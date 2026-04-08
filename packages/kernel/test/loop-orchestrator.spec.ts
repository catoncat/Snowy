import type {
  LlmProfileConfig,
  LlmProviderAdapter,
  LlmProviderSendInput,
  SessionStorage,
} from "@bbl-next/contracts";
import { CapabilityRegistry, FamilyProviderRegistry } from "@bbl-next/core";
import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../src/in-memory-session-storage.js";
import { createKernel } from "../src/kernel-facade.js";
import { runLoop } from "../src/loop-orchestrator.js";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const text = chunks.map((c) => `data: ${c}\n\n`).join("");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function chatChunk(content?: string, toolCalls?: unknown[], finishReason?: string) {
  return JSON.stringify({
    choices: [
      {
        delta: {
          ...(content !== undefined ? { content } : {}),
          ...(toolCalls ? { tool_calls: toolCalls } : {}),
        },
        ...(finishReason ? { finish_reason: finishReason } : {}),
      },
    ],
  });
}

const TEST_PROFILE_CONFIG: LlmProfileConfig = {
  profiles: [
    {
      id: "default",
      providerId: "test",
      llmBase: "https://test.api",
      llmKey: "test-key",
      llmModel: "test-model",
    },
  ],
  defaultProfile: "default",
};

const TEST_DESCRIPTOR = {
  id: "tabs.navigate",
  version: 1,
  description: "Navigate to a URL",
  inputSchema: { type: "object", properties: { url: { type: "string" } } },
  risk: "low" as const,
  sideEffects: "writes" as const,
  permissions: [],
  supportsVerify: false,
  supportsStreaming: false,
  outputSchema: { type: "object" },
  exportable: false,
  executionBinding: { family: "tabs", operation: "navigate" },
};

describe("runLoop", () => {
  function setup(mockSendFn: (input: LlmProviderSendInput) => Promise<Response>) {
    const storage: SessionStorage = new InMemorySessionStorage();
    const registry = new CapabilityRegistry([TEST_DESCRIPTOR]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "tabs",
      invoke: async ({ binding, input }) => {
        return { navigated: true, url: (input as Record<string, unknown>).url };
      },
    });

    const kernel = createKernel({
      storage,
      llm: { complete: async () => "" },
      registry,
      providers,
    });

    const provider: LlmProviderAdapter = {
      id: "test",
      resolveRequestUrl: () => "https://test.api/v1/chat/completions",
      send: mockSendFn,
    };

    return { kernel, registry, provider, storage };
  }

  it("completes a simple text-only response", async () => {
    let callCount = 0;
    const { kernel, registry, provider } = setup(async () => {
      callCount++;
      return sseResponse([chatChunk("Hello!"), chatChunk(undefined, undefined, "stop"), "[DONE]"]);
    });

    const session = await kernel.createSession();
    const result = await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      { sessionId: session.id, prompt: "Say hello" },
    );

    expect(result.terminalStatus).toBe("done");
    expect(callCount).toBe(1);
  });

  it("executes a tool call and loops", async () => {
    let callCount = 0;
    const { kernel, registry, provider } = setup(async () => {
      callCount++;
      if (callCount === 1) {
        // First call: LLM returns a tool call
        return sseResponse([
          chatChunk(undefined, [
            {
              index: 0,
              id: "tc_1",
              function: { name: "tabs_navigate", arguments: '{"url":"https://example.com"}' },
            },
          ]),
          chatChunk(undefined, undefined, "stop"),
          "[DONE]",
        ]);
      }
      // Second call: LLM returns text (done)
      return sseResponse([
        chatChunk("Navigated successfully!"),
        chatChunk(undefined, undefined, "stop"),
        "[DONE]",
      ]);
    });

    const session = await kernel.createSession();
    const toolCalls: string[] = [];
    const result = await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      {
        sessionId: session.id,
        prompt: "Go to example.com",
        onToolCall: (name) => toolCalls.push(name),
      },
    );

    expect(result.terminalStatus).toBe("done");
    expect(callCount).toBe(2);
    expect(toolCalls).toEqual(["tabs_navigate"]);
  });

  it("replays persisted assistant contentBlocks back into the next llm request", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    let callCount = 0;
    const { kernel, registry, provider } = setup(async (input) => {
      payloads.push(input.payload);
      callCount++;
      if (callCount === 1) {
        return sseResponse([
          chatChunk("Navigating now.", [
            {
              index: 0,
              id: "tc_1",
              function: { name: "tabs_navigate", arguments: '{"url":"https://example.com"}' },
            },
          ]),
          chatChunk(undefined, undefined, "tool_calls"),
          "[DONE]",
        ]);
      }
      return sseResponse([chatChunk("Done."), chatChunk(undefined, undefined, "stop"), "[DONE]"]);
    });

    const session = await kernel.createSession();
    await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      { sessionId: session.id, prompt: "Go to example.com" },
    );

    const secondMessages = payloads[1]?.messages;
    expect(Array.isArray(secondMessages)).toBe(true);
    const assistantMessage = (secondMessages as Array<Record<string, unknown>>).find(
      (msg) => msg.role === "assistant",
    );
    expect(assistantMessage).toEqual({
      role: "assistant",
      content: "Navigating now.",
      tool_calls: [
        {
          id: "tc_1",
          type: "function",
          function: {
            name: "tabs_navigate",
            arguments: '{"url":"https://example.com"}',
          },
        },
      ],
    });
  });

  it("reuses the same normalized tool call id for assistant and tool result messages", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    let callCount = 0;
    const { kernel, registry, provider } = setup(async (input) => {
      payloads.push(input.payload);
      callCount++;
      if (callCount === 1) {
        return sseResponse([
          chatChunk(undefined, [
            {
              index: 0,
              id: "",
              function: { name: "tabs_navigate", arguments: '{"url":"https://example.com"}' },
            },
          ]),
          chatChunk(undefined, undefined, "tool_calls"),
          "[DONE]",
        ]);
      }
      return sseResponse([chatChunk("Done."), chatChunk(undefined, undefined, "stop"), "[DONE]"]);
    });

    const session = await kernel.createSession();
    await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      { sessionId: session.id, prompt: "Go to example.com" },
    );

    const secondMessages = payloads[1]?.messages as Array<Record<string, unknown>>;
    const assistantMessage = secondMessages.find((msg) => msg.role === "assistant");
    const toolMessage = secondMessages.find((msg) => msg.role === "tool");
    const toolCalls =
      (assistantMessage?.tool_calls as Array<Record<string, unknown>> | undefined) ?? [];
    expect(toolCalls[0]?.id).toMatch(/^tc_/);
    expect(toolCalls[0]?.id).toBe(toolMessage?.tool_call_id);
  });

  it("injects task progress as a per-iteration system message", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    let callCount = 0;
    const { kernel, registry, provider } = setup(async (input) => {
      payloads.push(input.payload);
      callCount++;
      if (callCount === 1) {
        return sseResponse([
          chatChunk(undefined, [
            {
              index: 0,
              id: "tc_1",
              function: { name: "tabs_navigate", arguments: '{"url":"https://example.com"}' },
            },
          ]),
          chatChunk(undefined, undefined, "tool_calls"),
          "[DONE]",
        ]);
      }
      return sseResponse([chatChunk("Done."), chatChunk(undefined, undefined, "stop"), "[DONE]"]);
    });

    const session = await kernel.createSession();
    await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      { sessionId: session.id, prompt: "Go to example.com" },
    );

    const firstMessages = payloads[0]?.messages as Array<Record<string, unknown>>;
    const secondMessages = payloads[1]?.messages as Array<Record<string, unknown>>;
    expect(firstMessages[1]).toEqual({
      role: "system",
      content: expect.stringContaining("loop_step: 1/50"),
    });
    expect(String(firstMessages[1]?.content)).toContain("tool_steps_done: 0");
    expect(secondMessages[1]).toEqual({
      role: "system",
      content: expect.stringContaining("loop_step: 2/50"),
    });
    expect(String(secondMessages[1]?.content)).toContain("tool_steps_done: 1");
  });

  it("injects strategy hints after the same action target fails twice", async () => {
    const failingDescriptor = {
      ...TEST_DESCRIPTOR,
      id: "page.click",
      description: "Click an element by uid",
      inputSchema: { type: "object", properties: { uid: { type: "string" } } },
      executionBinding: { family: "page", operation: "click" },
    };

    const storage: SessionStorage = new InMemorySessionStorage();
    const registry = new CapabilityRegistry([failingDescriptor]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: async () => {
        throw new Error("Element is detached");
      },
    });

    const kernel = createKernel({
      storage,
      llm: { complete: async () => "" },
      registry,
      providers,
    });

    const payloads: Array<Record<string, unknown>> = [];
    let callCount = 0;
    const provider: LlmProviderAdapter = {
      id: "test",
      resolveRequestUrl: () => "https://test.api/v1/chat/completions",
      send: async (input) => {
        payloads.push(input.payload);
        callCount += 1;
        if (callCount <= 2) {
          return sseResponse([
            chatChunk(undefined, [
              {
                index: 0,
                id: `tc_${callCount}`,
                function: { name: "page_click", arguments: '{"uid":"submit-button"}' },
              },
            ]),
            chatChunk(undefined, undefined, "tool_calls"),
            "[DONE]",
          ]);
        }
        return sseResponse([
          chatChunk("Use another tactic."),
          chatChunk(undefined, undefined, "stop"),
          "[DONE]",
        ]);
      },
    };

    const session = await kernel.createSession();
    await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      { sessionId: session.id, prompt: "Submit the form" },
    );

    const thirdMessages = payloads[2]?.messages as Array<Record<string, unknown>>;
    expect(String(thirdMessages[1]?.content)).toContain("STRATEGY HINT");
    expect(String(thirdMessages[1]?.content)).toContain("page_click");
    expect(String(thirdMessages[1]?.content)).toContain("submit-button");
  });

  it("tracks repeated failures per target instead of aggregating different targets", async () => {
    const failingDescriptor = {
      ...TEST_DESCRIPTOR,
      id: "page.click",
      description: "Click an element by uid",
      inputSchema: { type: "object", properties: { uid: { type: "string" } } },
      executionBinding: { family: "page", operation: "click" },
    };

    const storage: SessionStorage = new InMemorySessionStorage();
    const registry = new CapabilityRegistry([failingDescriptor]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: async () => {
        throw new Error("Element is detached");
      },
    });

    const kernel = createKernel({
      storage,
      llm: { complete: async () => "" },
      registry,
      providers,
    });

    const payloads: Array<Record<string, unknown>> = [];
    const requestedUids = ["submit-button", "cancel-button", "fallback-button"];
    let callCount = 0;
    const provider: LlmProviderAdapter = {
      id: "test",
      resolveRequestUrl: () => "https://test.api/v1/chat/completions",
      send: async (input) => {
        payloads.push(input.payload);
        const uid = requestedUids[callCount] ?? "fallback-button";
        callCount += 1;
        if (callCount <= requestedUids.length) {
          return sseResponse([
            chatChunk(undefined, [
              {
                index: 0,
                id: `tc_${callCount}`,
                function: { name: "page_click", arguments: JSON.stringify({ uid }) },
              },
            ]),
            chatChunk(undefined, undefined, "tool_calls"),
            "[DONE]",
          ]);
        }
        return sseResponse([chatChunk("Done."), chatChunk(undefined, undefined, "stop"), "[DONE]"]);
      },
    };

    const session = await kernel.createSession();
    await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG, contextWindow: 1_000_000 },
      { sessionId: session.id, prompt: "Try different buttons" },
    );

    const thirdMessages = payloads[2]?.messages as Array<Record<string, unknown>>;
    expect(String(thirdMessages[1]?.content)).not.toContain("STRATEGY HINT");
  });

  it("calls onDelta for streaming text", async () => {
    const { kernel, registry, provider } = setup(async () => {
      return sseResponse([chatChunk("part1"), chatChunk("part2"), "[DONE]"]);
    });

    const session = await kernel.createSession();
    const deltas: string[] = [];
    await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      {
        sessionId: session.id,
        prompt: "test",
        onDelta: (chunk) => deltas.push(chunk),
      },
    );

    expect(deltas).toEqual(["part1", "part2"]);
  });

  it("stops on abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    const { kernel, registry, provider } = setup(async () => {
      throw new Error("should not be called");
    });

    const session = await kernel.createSession();
    const result = await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      {
        sessionId: session.id,
        prompt: "test",
        signal: controller.signal,
      },
    );

    expect(result.terminalStatus).toBe("stopped");
  });
});
