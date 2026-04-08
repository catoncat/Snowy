import type {
  LlmAssistantContentBlock,
  LlmAssistantMessage,
  LlmContextMessage,
  LlmMessage,
  LlmTextBlock,
  LlmToolCall,
  LlmToolCallBlock,
  SessionContextMessage,
} from "@bbl-next/contracts";

let toolCallFallbackSequence = 0;

/**
 * Normalize a tool call ID to match the pattern /^[a-zA-Z0-9_-]{1,64}$/.
 * If the input is invalid, generate a deterministic fallback from a seed.
 */
export function normalizeToolCallId(rawId: string | undefined, fallbackSeed?: string): string {
  const id = String(rawId || "").trim();
  if (id && /^[a-zA-Z0-9_-]{1,64}$/.test(id)) return id;
  const autoSeed = `${Date.now()}_${toolCallFallbackSequence++}`;
  const seed = String(fallbackSeed || autoSeed)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 56);
  return `tc_${seed || autoSeed.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 56)}`;
}

/**
 * Build assistant content blocks from a raw LLM response.
 */
export function buildAssistantContentBlocks(
  rawContent: string | null | undefined,
  rawToolCalls: LlmToolCall[] | undefined,
): LlmAssistantContentBlock[] {
  const blocks: LlmAssistantContentBlock[] = [];

  if (rawContent) {
    blocks.push({ type: "text", text: rawContent } satisfies LlmTextBlock);
  }

  if (rawToolCalls?.length) {
    for (const tc of rawToolCalls) {
      blocks.push({
        type: "toolCall",
        id: normalizeToolCallId(tc.id),
        name: tc.function.name,
        arguments: tc.function.arguments,
      } satisfies LlmToolCallBlock);
    }
  }

  return blocks;
}

/**
 * Convert SessionContextMessages (from kernel.buildContext) to LLM messages
 * for sending to the LLM API.
 *
 * SessionContextMessage roles: "user" | "assistant" | "system" | "compactionSummary"
 * Tool results are stored as messages with toolCallId + toolName set.
 */
export function contextMessagesToLlmMessages(messages: SessionContextMessage[]): LlmMessage[] {
  const result: LlmMessage[] = [];

  for (const msg of messages) {
    // Compaction summaries are injected as system context
    if (msg.role === "compactionSummary") {
      result.push({
        role: "system",
        content: `[Previous conversation summary]\n${msg.content}`,
      } satisfies LlmContextMessage);
      continue;
    }

    // Tool result: has toolCallId → becomes "tool" role in LLM format
    if (msg.toolCallId) {
      result.push({
        role: "tool",
        content: msg.content,
        tool_call_id: msg.toolCallId,
        name: msg.toolName,
      } satisfies LlmContextMessage);
      continue;
    }

    if (msg.role === "user" || msg.role === "system") {
      result.push({
        role: msg.role,
        content: msg.content,
      } satisfies LlmContextMessage);
      continue;
    }

    if (msg.role === "assistant") {
      result.push({
        role: "assistant",
        content: [{ type: "text", text: msg.content }],
      } satisfies LlmAssistantMessage);
    }
  }

  return result;
}

/**
 * Convert LLM messages to the OpenAI API format (for sending to provider).
 */
export function llmMessagesToApiPayload(messages: LlmMessage[]): Array<Record<string, unknown>> {
  return messages.map((msg) => {
    if (msg.role === "assistant") {
      const assistantMsg = msg as LlmAssistantMessage;
      const textParts = assistantMsg.content
        .filter((b): b is LlmTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const toolCallBlocks = assistantMsg.content.filter(
        (b): b is LlmToolCallBlock => b.type === "toolCall",
      );

      const result: Record<string, unknown> = {
        role: "assistant",
        content: textParts || null,
      };

      if (toolCallBlocks.length > 0) {
        result.tool_calls = toolCallBlocks.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
      }

      return result;
    }

    // system / user / tool
    const contextMsg = msg as LlmContextMessage;
    const result: Record<string, unknown> = {
      role: contextMsg.role,
      content: contextMsg.content,
    };
    if (contextMsg.tool_call_id) result.tool_call_id = contextMsg.tool_call_id;
    if (contextMsg.name) result.name = contextMsg.name;
    return result;
  });
}
