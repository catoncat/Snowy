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
