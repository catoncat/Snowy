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
  let currentEvent: string | undefined;

  let accumulatedText = "";
  const toolByIndex = new Map<number, ToolCallAccumulator>();
  let stopReason: string | undefined;

  function appendText(chunk: string): void {
    if (!chunk) {
      return;
    }
    accumulatedText += chunk;
    onDeltaText?.(chunk);
  }

  function toolAccumulator(index: number): ToolCallAccumulator {
    let acc = toolByIndex.get(index);
    if (!acc) {
      acc = {
        index,
        id: "",
        type: "function",
        function: { name: "", arguments: "" },
      };
      toolByIndex.set(index, acc);
    }
    return acc;
  }

  function responseToolIndex(parsed: Record<string, unknown>, item?: Record<string, unknown>) {
    if (typeof parsed.output_index === "number") {
      return parsed.output_index;
    }
    if (typeof item?.output_index === "number") {
      return item.output_index;
    }
    return toolByIndex.size;
  }

  function processResponsesOutputItem(
    item: Record<string, unknown> | undefined,
    index: number,
  ): void {
    if (!item) {
      return;
    }

    if (item.type === "function_call") {
      const acc = toolAccumulator(index);
      if (typeof item.call_id === "string") {
        acc.id = item.call_id;
      } else if (typeof item.id === "string") {
        acc.id = item.id;
      }
      if (typeof item.name === "string") {
        acc.function.name = item.name;
      }
      if (typeof item.arguments === "string") {
        acc.function.arguments = item.arguments;
      }
      return;
    }

    if (item.type === "message" && !accumulatedText) {
      const content = Array.isArray(item.content) ? item.content : [];
      for (const block of content) {
        if (!block || typeof block !== "object" || Array.isArray(block)) {
          continue;
        }
        const text = (block as Record<string, unknown>).text;
        if (typeof text === "string") {
          appendText(text);
        }
      }
    }
  }

  function processResponsesPacket(parsed: Record<string, unknown>, eventType?: string): boolean {
    const type = typeof parsed.type === "string" ? parsed.type : eventType;
    if (!type?.startsWith("response.")) {
      return false;
    }

    if (type === "response.output_text.delta" && typeof parsed.delta === "string") {
      appendText(parsed.delta);
    }

    if (type === "response.function_call_arguments.delta") {
      const acc = toolAccumulator(responseToolIndex(parsed));
      if (typeof parsed.item_id === "string" && !acc.id) {
        acc.id = parsed.item_id;
      }
      if (typeof parsed.delta === "string") {
        acc.function.arguments += parsed.delta;
      }
    }

    if (type === "response.output_item.added" || type === "response.output_item.done") {
      const item = parsed.item as Record<string, unknown> | undefined;
      processResponsesOutputItem(item, responseToolIndex(parsed, item));
    }

    if (type === "response.completed") {
      stopReason = "stop";
      const response = parsed.response as Record<string, unknown> | undefined;
      if (!accumulatedText && response) {
        if (typeof response.output_text === "string") {
          appendText(response.output_text);
        }
        const output = Array.isArray(response.output) ? response.output : [];
        output.forEach((item, index) => {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            processResponsesOutputItem(item as Record<string, unknown>, index);
          }
        });
      }
    }

    return true;
  }

  function processLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      currentEvent = undefined;
      return;
    }
    if (trimmed.startsWith(":")) return;
    if (trimmed.startsWith("event: ")) {
      currentEvent = trimmed.slice(7).trim();
      return;
    }
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

    if (processResponsesPacket(parsed, currentEvent)) {
      return;
    }

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
      appendText(delta.content);
    }

    const deltaToolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
    if (deltaToolCalls) {
      for (const tc of deltaToolCalls) {
        const idx = (tc.index as number) ?? 0;
        const acc = toolAccumulator(idx);
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
