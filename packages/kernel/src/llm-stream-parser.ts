import type { LlmSseStreamResult, LlmToolCall } from "@bbl-next/contracts";

interface ToolCallAccumulator {
  index: number;
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * Parse an OpenAI-compatible SSE stream and accumulate
 * into a single unified response message with text + tool_calls.
 */
export async function readLlmMessageFromSseStream(
  body: ReadableStream<Uint8Array>,
  onDeltaText?: (chunk: string) => void,
): Promise<LlmSseStreamResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  let rawBody = "";
  let buffer = "";
  let packetCount = 0;

  let accumulatedText = "";
  const toolByIndex = new Map<number, ToolCallAccumulator>();
  let stopReason: string | undefined;

  function processLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":")) return;
    if (trimmed === "data: [DONE]") return;
    if (!trimmed.startsWith("data: ")) return;

    const jsonStr = trimmed.slice(6);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      return;
    }
    packetCount++;

    const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
    if (!choices?.length) return;

    const choice = choices[0];
    const delta = choice.delta as Record<string, unknown> | undefined;
    const finishReason = choice.finish_reason as string | undefined;

    if (finishReason) {
      stopReason = finishReason;
    }

    if (!delta) return;

    if (typeof delta.content === "string" && delta.content) {
      accumulatedText += delta.content;
      onDeltaText?.(delta.content);
    }

    const deltaToolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
    if (deltaToolCalls) {
      for (const tc of deltaToolCalls) {
        const idx = (tc.index as number) ?? 0;
        let acc = toolByIndex.get(idx);
        if (!acc) {
          acc = {
            index: idx,
            id: "",
            type: "function",
            function: { name: "", arguments: "" },
          };
          toolByIndex.set(idx, acc);
        }
        if (typeof tc.id === "string") acc.id += tc.id;
        const fn = tc.function as Record<string, unknown> | undefined;
        if (fn) {
          if (typeof fn.name === "string") acc.function.name += fn.name;
          if (typeof fn.arguments === "string") acc.function.arguments += fn.arguments;
        }
      }
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      rawBody += chunk;
      buffer += chunk;

      const lines = buffer.split("\n");
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        processLine(line);
      }
    }

    buffer += decoder.decode();
    for (const line of buffer.split("\n")) {
      processLine(line);
    }
  } finally {
    reader.releaseLock();
  }

  // Build final tool_calls array sorted by index
  const toolCalls: LlmToolCall[] = Array.from(toolByIndex.entries())
    .sort(([a], [b]) => a - b)
    .map(([, acc]) => ({
      id: acc.id,
      type: "function" as const,
      function: {
        name: acc.function.name,
        arguments: acc.function.arguments,
      },
    }));

  const message: Record<string, unknown> = {
    role: "assistant",
    content: accumulatedText || null,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    stop_reason: stopReason,
  };

  return { message, rawBody, packetCount };
}
