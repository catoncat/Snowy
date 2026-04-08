import type { LlmToolCall, SessionContextMessage } from "@bbl-next/contracts";
import {
  buildAssistantContentBlocks,
  contextMessagesToLlmMessages,
  llmMessagesToApiPayload,
  normalizeToolCallId,
} from "@bbl-next/kernel";
import { describe, expect, it } from "vitest";

describe("normalizeToolCallId", () => {
  it("returns a valid id as-is", () => {
    expect(normalizeToolCallId("call_abc123")).toBe("call_abc123");
  });

  it("returns valid id with hyphens and underscores", () => {
    expect(normalizeToolCallId("call-abc_123")).toBe("call-abc_123");
  });

  it("generates a fallback for empty input", () => {
    const id = normalizeToolCallId(undefined, "seed42");
    expect(id).toBe("tc_seed42");
  });

  it("generates a fallback for invalid characters", () => {
    const id = normalizeToolCallId("invalid!@#$%", "seed");
    expect(id).toBe("tc_seed");
  });

  it("truncates long fallback seeds to 56 chars", () => {
    const longSeed = "a".repeat(100);
    const id = normalizeToolCallId(undefined, longSeed);
    expect(id).toBe(`tc_${"a".repeat(56)}`);
    expect(id.length).toBe(59);
  });

  it("strips invalid chars from fallback seed", () => {
    const id = normalizeToolCallId(undefined, "hello world!!!");
    expect(id).toBe("tc_helloworld");
  });
});

describe("buildAssistantContentBlocks", () => {
  it("returns text block for text-only content", () => {
    const blocks = buildAssistantContentBlocks("Hello", undefined);
    expect(blocks).toEqual([{ type: "text", text: "Hello" }]);
  });

  it("returns tool call blocks", () => {
    const toolCalls: LlmToolCall[] = [
      {
        id: "call_1",
        type: "function",
        function: { name: "get_weather", arguments: '{"city":"NYC"}' },
      },
    ];
    const blocks = buildAssistantContentBlocks(null, toolCalls);
    expect(blocks).toEqual([
      {
        type: "toolCall",
        id: "call_1",
        name: "get_weather",
        arguments: '{"city":"NYC"}',
      },
    ]);
  });

  it("returns both text and tool call blocks", () => {
    const toolCalls: LlmToolCall[] = [
      {
        id: "call_1",
        type: "function",
        function: { name: "fn", arguments: "{}" },
      },
    ];
    const blocks = buildAssistantContentBlocks("Thinking...", toolCalls);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: "text", text: "Thinking..." });
    expect(blocks[1]).toEqual({
      type: "toolCall",
      id: "call_1",
      name: "fn",
      arguments: "{}",
    });
  });

  it("returns empty array for null content and no tool calls", () => {
    expect(buildAssistantContentBlocks(null, undefined)).toEqual([]);
    expect(buildAssistantContentBlocks(undefined, [])).toEqual([]);
  });

  it("normalizes invalid tool call IDs", () => {
    const toolCalls: LlmToolCall[] = [
      {
        id: "",
        type: "function",
        function: { name: "fn", arguments: "{}" },
      },
    ];
    const blocks = buildAssistantContentBlocks(null, toolCalls);
    expect(blocks[0].type).toBe("toolCall");
    if (blocks[0].type === "toolCall") {
      expect(blocks[0].id).toMatch(/^tc_/);
    }
  });
});

describe("contextMessagesToLlmMessages", () => {
  function msg(
    role: SessionContextMessage["role"],
    content: string,
    extra: Partial<SessionContextMessage> = {},
  ): SessionContextMessage {
    return { role, content, entryId: `e-${Math.random()}`, ...extra };
  }

  it("converts user messages", () => {
    const result = contextMessagesToLlmMessages([msg("user", "Hello")]);
    expect(result).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("converts system messages", () => {
    const result = contextMessagesToLlmMessages([msg("system", "You are helpful.")]);
    expect(result).toEqual([{ role: "system", content: "You are helpful." }]);
  });

  it("converts assistant messages as content blocks", () => {
    const result = contextMessagesToLlmMessages([msg("assistant", "Sure!")]);
    expect(result).toEqual([{ role: "assistant", content: [{ type: "text", text: "Sure!" }] }]);
  });

  it("converts compactionSummary to system message", () => {
    const result = contextMessagesToLlmMessages([
      msg("compactionSummary", "Summary of prior conversation."),
    ]);
    expect(result).toEqual([
      {
        role: "system",
        content: "[Previous conversation summary]\nSummary of prior conversation.",
      },
    ]);
  });

  it("converts tool results using toolCallId", () => {
    const result = contextMessagesToLlmMessages([
      msg("user", '{"temp": 72}', {
        toolCallId: "call_1",
        toolName: "get_weather",
      }),
    ]);
    expect(result).toEqual([
      {
        role: "tool",
        content: '{"temp": 72}',
        tool_call_id: "call_1",
        name: "get_weather",
      },
    ]);
  });

  it("handles a full conversation with compaction rebuild", () => {
    const messages: SessionContextMessage[] = [
      msg("compactionSummary", "User asked about weather."),
      msg("user", "What's the weather in NYC?"),
      msg("assistant", "Let me check."),
      msg("user", '{"temp": 72}', { toolCallId: "call_1", toolName: "get_weather" }),
      msg("assistant", "It's 72°F in NYC."),
    ];

    const result = contextMessagesToLlmMessages(messages);

    expect(result).toHaveLength(5);
    expect(result[0].role).toBe("system");
    expect(result[1].role).toBe("user");
    expect(result[2].role).toBe("assistant");
    expect(result[3].role).toBe("tool");
    expect(result[4].role).toBe("assistant");
  });

  it("returns empty array for empty input", () => {
    expect(contextMessagesToLlmMessages([])).toEqual([]);
  });
});

describe("llmMessagesToApiPayload", () => {
  it("converts user message", () => {
    const result = llmMessagesToApiPayload([{ role: "user", content: "Hi" }]);
    expect(result).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("converts system message", () => {
    const result = llmMessagesToApiPayload([{ role: "system", content: "Be helpful" }]);
    expect(result).toEqual([{ role: "system", content: "Be helpful" }]);
  });

  it("converts tool message with tool_call_id", () => {
    const result = llmMessagesToApiPayload([
      { role: "tool", content: "result", tool_call_id: "call_1", name: "fn" },
    ]);
    expect(result).toEqual([
      { role: "tool", content: "result", tool_call_id: "call_1", name: "fn" },
    ]);
  });

  it("converts assistant message with text only", () => {
    const result = llmMessagesToApiPayload([
      {
        role: "assistant",
        content: [{ type: "text", text: "Hello!" }],
      },
    ]);
    expect(result).toEqual([{ role: "assistant", content: "Hello!" }]);
  });

  it("converts assistant message with tool calls", () => {
    const result = llmMessagesToApiPayload([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Checking..." },
          {
            type: "toolCall",
            id: "call_1",
            name: "get_weather",
            arguments: '{"city":"NYC"}',
          },
        ],
      },
    ]);
    expect(result).toEqual([
      {
        role: "assistant",
        content: "Checking...",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "get_weather", arguments: '{"city":"NYC"}' },
          },
        ],
      },
    ]);
  });

  it("sets content to null for assistant with no text", () => {
    const result = llmMessagesToApiPayload([
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call_1",
            name: "fn",
            arguments: "{}",
          },
        ],
      },
    ]);
    expect(result[0].content).toBeNull();
    expect(result[0].tool_calls).toHaveLength(1);
  });
});
