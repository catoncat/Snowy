import type {
  LlmProfileConfig,
  LlmProviderAdapter,
  LlmProviderSendInput,
  LoopTelemetryEntry,
  SessionStorage,
  ToolContract,
} from "@bbl-next/contracts";
import { CapabilityRegistry, FamilyProviderRegistry } from "@bbl-next/core";
import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../src/in-memory-session-storage.js";
import { createKernel } from "../src/kernel-facade.js";
import { resolveLlmRoute } from "../src/llm-profile-resolver.js";
import { LlmProviderRegistry } from "../src/llm-provider-registry.js";
import {
  calculateLlmRetryDelayMs,
  requestLlmWithRetry,
  runLoop,
} from "../src/loop-orchestrator.js";
import { buildSystemPromptBase } from "../src/prompt-builder.js";

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

function makeRetryProfileConfig(overrides: Partial<LlmProfileConfig> = {}): LlmProfileConfig {
  return {
    profiles: [
      {
        id: "default",
        providerId: "test",
        llmBase: "https://test.api",
        llmKey: "test-key",
        llmModel: "test-model",
        llmRetryMaxAttempts: 3,
        llmMaxRetryDelayMs: 0,
      },
      {
        id: "fallback",
        providerId: "test",
        llmBase: "https://fallback.api",
        llmKey: "fallback-key",
        llmModel: "fallback-model",
        llmRetryMaxAttempts: 3,
        llmMaxRetryDelayMs: 0,
      },
    ],
    defaultProfile: "default",
    fallbackProfile: "fallback",
    ...overrides,
  };
}

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

const TEST_HIGH_RISK_DESCRIPTOR = {
  id: "tabs.close.tab",
  version: 1,
  description: "Close the current tab",
  inputSchema: { type: "object", properties: { tabId: { type: "number" } } },
  risk: "high" as const,
  sideEffects: "writes" as const,
  permissions: [],
  supportsVerify: false,
  supportsStreaming: false,
  outputSchema: { type: "object" },
  exportable: false,
  executionBinding: { family: "tabs", operation: "close_tab" },
};

const TEST_SITE_DESCRIPTOR = {
  id: "site.runtime.invoke",
  version: 1,
  description: "Invoke a site runtime action",
  inputSchema: { type: "object", properties: { action: { type: "string" } } },
  risk: "medium" as const,
  sideEffects: "writes" as const,
  permissions: [],
  supportsVerify: true,
  supportsStreaming: false,
  outputSchema: { type: "object" },
  exportable: false,
  executionBinding: { family: "siteRuntime", operation: "invoke" },
};

describe("runLoop", () => {
  function setup(mockSendFn: (input: LlmProviderSendInput) => Promise<Response>) {
    const storage: SessionStorage = new InMemorySessionStorage();
    const registry = new CapabilityRegistry([TEST_DESCRIPTOR]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "tabs",
      invoke: async ({ input }) => {
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

  function setupWithCompaction(
    mockSendFn: (input: LlmProviderSendInput) => Promise<Response>,
    llmSummary = "Compacted summary.",
  ) {
    const storage: SessionStorage = new InMemorySessionStorage();
    const registry = new CapabilityRegistry([TEST_DESCRIPTOR]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "tabs",
      invoke: async ({ input }) => {
        return { navigated: true, url: (input as Record<string, unknown>).url };
      },
    });

    const kernel = createKernel({
      storage,
      llm: { complete: async () => llmSummary },
      registry,
      providers,
      compaction: { keepRecentTokens: 1 },
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

  it("negotiates the initial route through kernel provider registry state", async () => {
    const storage: SessionStorage = new InMemorySessionStorage();
    const registry = new CapabilityRegistry([TEST_DESCRIPTOR]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "tabs",
      invoke: async ({ input }) => {
        return { navigated: true, url: (input as Record<string, unknown>).url };
      },
    });

    const providerRegistry = new LlmProviderRegistry();
    providerRegistry.register(
      {
        id: "primary_provider",
        resolveRequestUrl: () => "https://primary.example.test/chat/completions",
        send: async () => new Response("unreachable"),
      },
      { healthStatus: "down" },
    );
    providerRegistry.register(
      {
        id: "fallback_provider",
        resolveRequestUrl: () => "https://fallback.example.test/chat/completions",
        send: async () => new Response("ok"),
      },
      { healthStatus: "healthy" },
    );

    const kernel = createKernel({
      storage,
      llm: { complete: async () => "" },
      registry,
      providers,
      providerRegistry,
      profileConfig: {
        defaultProfile: "default",
        fallbackProfile: "fallback",
        profiles: [
          {
            id: "default",
            providerId: "primary_provider",
            llmBase: "https://primary.example.test",
            llmKey: "sk-primary",
            llmModel: "gpt-4.1-mini",
          },
          {
            id: "fallback",
            providerId: "fallback_provider",
            llmBase: "https://fallback.example.test",
            llmKey: "sk-fallback",
            llmModel: "gpt-4.1",
          },
        ],
      },
    });

    const seenRoutes: Array<{ profile: string; provider: string; model: string }> = [];
    const provider: LlmProviderAdapter = {
      id: "router",
      resolveRequestUrl: () => "https://router.example.test/chat/completions",
      send: async (input) => {
        seenRoutes.push({
          profile: input.route.profile,
          provider: input.route.provider,
          model: String(input.payload.model),
        });
        return sseResponse([
          chatChunk("Fallback route selected."),
          chatChunk(undefined, undefined, "stop"),
          "[DONE]",
        ]);
      },
    };

    const session = await kernel.createSession();
    const result = await runLoop(
      {
        kernel,
        registry,
        provider,
        profileConfig: {
          defaultProfile: "default",
          fallbackProfile: "fallback",
          profiles: [
            {
              id: "default",
              providerId: "primary_provider",
              llmBase: "https://primary.example.test",
              llmKey: "sk-primary",
              llmModel: "gpt-4.1-mini",
            },
            {
              id: "fallback",
              providerId: "fallback_provider",
              llmBase: "https://fallback.example.test",
              llmKey: "sk-fallback",
              llmModel: "gpt-4.1",
            },
          ],
        },
      },
      { sessionId: session.id, prompt: "Say hello" },
    );

    expect(result.terminalStatus).toBe("done");
    expect(seenRoutes).toEqual([
      {
        profile: "fallback",
        provider: "fallback_provider",
        model: "gpt-4.1",
      },
    ]);
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

  it("uses threshold compaction between turns and rebuilds context before continuing", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const requestPhases: string[] = [];
    let sessionId = "";
    let callCount = 0;

    const { kernel, registry, provider } = setupWithCompaction(async (input) => {
      payloads.push(input.payload);
      if (sessionId) {
        requestPhases.push(kernel.getRunState(sessionId).phase);
      }
      callCount += 1;

      if (callCount === 1) {
        return sseResponse([
          chatChunk(undefined, [
            {
              index: 0,
              id: "tc_threshold",
              function: { name: "tabs_navigate", arguments: '{"url":"https://example.com"}' },
            },
          ]),
          chatChunk(undefined, undefined, "tool_calls"),
          "[DONE]",
        ]);
      }

      return sseResponse([
        chatChunk("Threshold compaction recovered the context."),
        chatChunk(undefined, undefined, "stop"),
        "[DONE]",
      ]);
    }, "Threshold summary.");

    const session = await kernel.createSession();
    sessionId = session.id;
    const result = await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG, contextWindow: 200 },
      {
        sessionId: session.id,
        prompt: `Go to example.com and keep detailed notes ${"x".repeat(1_200)}`,
      },
    );

    const entries = await kernel.sessions.getEntries(session.id);
    const compactionEntries = entries.filter((entry) => entry.type === "compaction");
    expect(result.terminalStatus).toBe("done");
    expect(callCount).toBe(2);
    expect(requestPhases).toEqual(["running", "running"]);
    expect(compactionEntries).toHaveLength(1);
    expect((compactionEntries[0]?.payload as { reason?: string }).reason).toBe("threshold");

    const secondMessages = payloads[1]?.messages as Array<Record<string, unknown>>;
    expect(
      secondMessages.some(
        (message) =>
          message.role === "system" &&
          String(message.content).includes("[Previous conversation summary]\nThreshold summary."),
      ),
    ).toBe(true);
  });

  it("compacts on context overflow errors and retries the llm request with rebuilt context", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const requestPhases: string[] = [];
    let sessionId = "";
    let callCount = 0;

    const { kernel, registry, provider } = setupWithCompaction(async (input) => {
      payloads.push(input.payload);
      if (sessionId) {
        requestPhases.push(kernel.getRunState(sessionId).phase);
      }
      callCount += 1;

      if (callCount === 1) {
        return new Response('{"error":{"message":"context window exceeded"}}', { status: 400 });
      }

      return sseResponse([
        chatChunk("Overflow compaction recovered the context."),
        chatChunk(undefined, undefined, "stop"),
        "[DONE]",
      ]);
    }, "Overflow summary.");

    const session = await kernel.createSession();
    sessionId = session.id;
    await kernel.appendMessage(session.id, {
      role: "assistant",
      text: `Historical context ${"y".repeat(1_200)}`,
    });

    const result = await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG, contextWindow: 4_096 },
      { sessionId: session.id, prompt: "Retry after compaction" },
    );

    const entries = await kernel.sessions.getEntries(session.id);
    const compactionEntries = entries.filter((entry) => entry.type === "compaction");
    expect(result.terminalStatus).toBe("done");
    expect(callCount).toBe(2);
    expect(requestPhases).toEqual(["running", "running"]);
    expect(compactionEntries).toHaveLength(1);
    expect((compactionEntries[0]?.payload as { reason?: string }).reason).toBe("overflow");

    const secondMessages = payloads[1]?.messages as Array<Record<string, unknown>>;
    expect(
      secondMessages.some(
        (message) =>
          message.role === "system" &&
          String(message.content).includes("[Previous conversation summary]\nOverflow summary."),
      ),
    ).toBe(true);
  });

  it("fails after overflow compaction retry budget is exhausted", async () => {
    let callCount = 0;
    const { kernel, registry, provider } = setupWithCompaction(async () => {
      callCount += 1;
      return new Response('{"error":{"message":"context window exceeded"}}', { status: 400 });
    }, "Overflow summary.");

    const session = await kernel.createSession();
    await kernel.appendMessage(session.id, {
      role: "assistant",
      text: `Historical context ${"z".repeat(1_200)}`,
    });

    await expect(
      runLoop(
        { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG, contextWindow: 4_096 },
        { sessionId: session.id, prompt: "Keep retrying forever?" },
      ),
    ).rejects.toThrow("LLM context overflow persisted after 1 compaction attempt");

    expect(callCount).toBe(2);
    expect(kernel.getRunState(session.id).phase).toBe("stopped");
  });

  it("continues after a site verify failure is resolved via intervention lifecycle", async () => {
    const storage: SessionStorage = new InMemorySessionStorage();
    const registry = new CapabilityRegistry([TEST_SITE_DESCRIPTOR]);
    const providers = new FamilyProviderRegistry();
    const interventionStatuses: string[] = [];
    const innerTerminalStatuses: Array<string | null> = [];
    const providerPhases: string[] = [];

    const kernel = createKernel({
      storage,
      llm: { complete: async () => "" },
      registry,
      providers,
      executeSiteStep: async () => ({
        ok: true,
        verified: false,
        data: {
          result: {
            attempted: true,
          },
          verified: false,
          trace: ["invoke:secure_login", "verify:page_hook_ok"],
          intervention: {
            id: "ivr:fixture.page:secure_login:verify_failed:11:page_hook_ok",
            kind: "takeover",
            trigger: "verify_failed",
            status: "requested",
            title: "Manual verify required",
            message: "Finish the verification flow manually.",
            skillId: "fixture.page",
            action: "secure_login",
            tabId: 11,
            payload: {
              tabUrl: "https://fixture.test/login",
              verifier: "page_hook_ok",
            },
          },
        },
      }),
    });

    providers.register({
      family: "siteRuntime",
      invoke: async ({ context, input }) => {
        const sessionId = context?.sessionId;
        if (!sessionId) {
          throw new Error("Expected provider context to include a sessionId");
        }
        providerPhases.push(kernel.getRunState(sessionId).phase);
        const executed = await kernel.executeStep(sessionId, {
          kind: "site",
          capabilityId: "site.runtime.invoke",
          skillId: "fixture.page",
          action: "secure_login",
          tab: {
            tabId: 11,
            url: "https://fixture.test/login",
            active: true,
          },
          input: {
            input,
            plan: {
              skillId: "fixture.page",
              action: "secure_login",
              steps: [],
            },
            module: {
              id: "fixture.page.secure-login",
              source: "exports.default = async ({ input }) => input;",
            },
            verifier: "page_hook_ok",
            intervention: {
              kind: "takeover",
              title: "Manual verify required",
              message: "Finish the verification flow manually.",
              trigger: "verify_failed",
            },
          },
        });

        innerTerminalStatuses.push(kernel.checkTerminal(sessionId, executed.turn));
        const siteData = executed.result.data as
          | { intervention?: Record<string, unknown>; verified?: boolean }
          | undefined;
        if (!siteData?.intervention) {
          throw new Error("Expected a site intervention request");
        }

        return {
          ok: true,
          verified: siteData.verified,
          intervention: siteData.intervention,
        };
      },
    });

    let callCount = 0;
    const provider: LlmProviderAdapter = {
      id: "test",
      resolveRequestUrl: () => "https://test.api/v1/chat/completions",
      send: async () => {
        callCount += 1;
        if (callCount === 1) {
          return sseResponse([
            chatChunk(undefined, [
              {
                index: 0,
                id: "tc_site_1",
                function: {
                  name: "site_runtime_invoke",
                  arguments: '{"action":"secure_login","username":"alice"}',
                },
              },
            ]),
            chatChunk(undefined, undefined, "tool_calls"),
            "[DONE]",
          ]);
        }

        return sseResponse([
          chatChunk("Manual verification completed. Continue the run."),
          chatChunk(undefined, undefined, "stop"),
          "[DONE]",
        ]);
      },
    };

    const session = await kernel.createSession();
    const result = await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      {
        sessionId: session.id,
        prompt: "Log me in and continue after manual verification",
        onIntervention(record) {
          interventionStatuses.push(`${record.status}:${kernel.getRunState(session.id).phase}`);
          return { resolution: { resolution: "resume" } };
        },
      },
    );

    expect(result.terminalStatus).toBe("done");
    expect(callCount).toBe(2);
    expect(innerTerminalStatuses).toEqual(["failed_verify"]);
    expect(interventionStatuses).toEqual(["requested:paused", "resolved:paused"]);
    expect(providerPhases).toEqual(["running"]);
    expect(kernel.getInterventionSummary({ sessionId: session.id })).toMatchObject({
      status: "settled",
      totalCount: 1,
      activeCount: 0,
      recentCount: 2,
    });
  });

  it("requests confirm-policy intervention before executing a high-risk side-effectful step", async () => {
    const storage: SessionStorage = new InMemorySessionStorage();
    const registry = new CapabilityRegistry([TEST_HIGH_RISK_DESCRIPTOR]);
    const providers = new FamilyProviderRegistry();
    const invokedPhases: string[] = [];
    const interventionPhases: string[] = [];
    const interventionStatuses: string[] = [];

    providers.register({
      family: "tabs",
      invoke: async ({ context, input }) => {
        if (!context?.sessionId) {
          throw new Error("Expected provider context to include a sessionId");
        }
        invokedPhases.push(kernel.getRunState(context.sessionId).phase);
        return {
          closed: true,
          tabId: (input as { tabId?: number }).tabId ?? null,
        };
      },
    });

    const kernel = createKernel({
      storage,
      llm: { complete: async () => "" },
      registry,
      providers,
    });

    let callCount = 0;
    const provider: LlmProviderAdapter = {
      id: "test",
      resolveRequestUrl: () => "https://test.api/v1/chat/completions",
      send: async () => {
        callCount += 1;
        if (callCount === 1) {
          return sseResponse([
            chatChunk(undefined, [
              {
                index: 0,
                id: "tc_risk_1",
                function: { name: "tabs_close_tab", arguments: '{"tabId":7}' },
              },
            ]),
            chatChunk(undefined, undefined, "tool_calls"),
            "[DONE]",
          ]);
        }

        return sseResponse([
          chatChunk("The tab was closed after confirmation."),
          chatChunk(undefined, undefined, "stop"),
          "[DONE]",
        ]);
      },
    };

    const session = await kernel.createSession();
    const result = await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      {
        sessionId: session.id,
        prompt: "Close the current tab",
        onIntervention(record, context) {
          interventionPhases.push(`${context.phase}:${kernel.getRunState(session.id).phase}`);
          interventionStatuses.push(record.status);
          return { resolution: { confirmed: true } };
        },
      },
    );

    expect(result.terminalStatus).toBe("done");
    expect(callCount).toBe(2);
    expect(interventionStatuses).toEqual(["requested", "resolved"]);
    expect(interventionPhases).toEqual(["requested:paused", "resolved:paused"]);
    expect(invokedPhases).toEqual(["running"]);
    expect(kernel.getInterventionSummary({ sessionId: session.id })).toMatchObject({
      status: "settled",
      totalCount: 1,
      activeCount: 0,
      recentCount: 2,
    });
  });

  it("pauses the run when a high-risk intervention is pending without a resolver", async () => {
    const storage: SessionStorage = new InMemorySessionStorage();
    const registry = new CapabilityRegistry([TEST_HIGH_RISK_DESCRIPTOR]);
    const providers = new FamilyProviderRegistry();
    const invoked: string[] = [];

    providers.register({
      family: "tabs",
      invoke: async () => {
        invoked.push("called");
        return { closed: true };
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
      send: async () =>
        sseResponse([
          chatChunk(undefined, [
            {
              index: 0,
              id: "tc_risk_pending",
              function: { name: "tabs_close_tab", arguments: '{"tabId":7}' },
            },
          ]),
          chatChunk(undefined, undefined, "tool_calls"),
          "[DONE]",
        ]),
    };

    const session = await kernel.createSession();
    const result = await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      { sessionId: session.id, prompt: "Close the current tab" },
    );

    expect(result.terminalStatus).toBe("stopped");
    expect(invoked).toEqual([]);
    expect(kernel.getRunState(session.id).phase).toBe("paused");
    expect(kernel.getInterventionSummary({ sessionId: session.id })).toMatchObject({
      status: "requested",
      totalCount: 1,
      activeCount: 1,
      recentCount: 1,
    });
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

  it("preserves the full prompt context message set in the llm payload", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const { kernel, registry, provider } = setup(async (input) => {
      payloads.push(input.payload);
      return sseResponse([chatChunk("Done."), chatChunk(undefined, undefined, "stop"), "[DONE]"]);
    });

    const session = await kernel.createSession();
    await runLoop(
      {
        kernel,
        registry,
        provider,
        profileConfig: TEST_PROFILE_CONFIG,
        promptOptions: {
          availableSkills: [
            {
              name: "agent-workflow-next",
              description: "Route the current browser-brain-loop-next task.",
              path: ".agents/skills/agent-workflow-next/SKILL.md",
              triggers: ["issue", "workflow"],
            },
          ],
          sharedTabs: [
            {
              tabId: 9,
              title: "Inbox",
              url: "https://mail.example.test/inbox",
            },
          ],
        },
      },
      { sessionId: session.id, prompt: "Summarize the current context" },
    );

    const firstMessages = payloads[0]?.messages as Array<Record<string, unknown>>;
    expect(firstMessages[0]).toEqual({
      role: "system",
      content: expect.stringContaining("## Available Skills"),
    });
    expect(String(firstMessages[0]?.content)).toContain("agent-workflow-next");
    expect(firstMessages[1]).toEqual({
      role: "system",
      content: expect.stringContaining("Shared Tabs Context"),
    });
    expect(String(firstMessages[1]?.content)).toContain("tab 9");
    expect(firstMessages[2]).toEqual({
      role: "system",
      content: expect.stringContaining("loop_step: 1/50"),
    });
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

  it("keeps timeout failures terminal even with failure tracking enabled", async () => {
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
        const error = new Error("request timeout");
        throw error;
      },
    });

    const kernel = createKernel({
      storage,
      llm: { complete: async () => "" },
      registry,
      providers,
    });

    let callCount = 0;
    const provider: LlmProviderAdapter = {
      id: "test",
      resolveRequestUrl: () => "https://test.api/v1/chat/completions",
      send: async () => {
        callCount += 1;
        return sseResponse([
          chatChunk(undefined, [
            {
              index: 0,
              id: "tc_timeout",
              function: { name: "page_click", arguments: '{"uid":"submit-button"}' },
            },
          ]),
          chatChunk(undefined, undefined, "tool_calls"),
          "[DONE]",
        ]);
      },
    };

    const session = await kernel.createSession();
    const result = await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      { sessionId: session.id, prompt: "Submit the form" },
    );

    expect(result.terminalStatus).toBe("timeout");
    expect(callCount).toBe(1);
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

  it("collects telemetry entries with timing data for each tool execution", async () => {
    let callCount = 0;
    const { kernel, registry, provider } = setup(async () => {
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
          chatChunk(undefined, undefined, "stop"),
          "[DONE]",
        ]);
      }
      return sseResponse([chatChunk("Done."), chatChunk(undefined, undefined, "stop"), "[DONE]"]);
    });

    const session = await kernel.createSession();
    const result = await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      { sessionId: session.id, prompt: "Go to example.com" },
    );

    expect(result.telemetry).toHaveLength(1);
    const entry = result.telemetry[0];
    expect(entry.stepIndex).toBe(0);
    expect(entry.capabilityId).toBe("tabs.navigate");
    expect(entry.ok).toBe(true);
    expect(typeof entry.startedAt).toBe("string");
    expect(typeof entry.endedAt).toBe("string");
    expect(typeof entry.durationMs).toBe("number");
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry.errorCode).toBeUndefined();
  });

  it("emits telemetry via onStepTelemetry callback", async () => {
    let callCount = 0;
    const { kernel, registry, provider } = setup(async () => {
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
          chatChunk(undefined, undefined, "stop"),
          "[DONE]",
        ]);
      }
      return sseResponse([chatChunk("Done."), chatChunk(undefined, undefined, "stop"), "[DONE]"]);
    });

    const session = await kernel.createSession();
    const emitted: LoopTelemetryEntry[] = [];
    await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      {
        sessionId: session.id,
        prompt: "Go to example.com",
        onStepTelemetry: (entry) => {
          emitted.push(entry);
        },
      },
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0].capabilityId).toBe("tabs.navigate");
    expect(emitted[0].ok).toBe(true);
  });

  it("records errorCode in telemetry for failed tool executions", async () => {
    const failingDescriptor = {
      ...TEST_DESCRIPTOR,
      id: "page.click",
      description: "Click an element",
      inputSchema: { type: "object", properties: { uid: { type: "string" } } },
      executionBinding: { family: "page", operation: "click" },
    };

    const storage: SessionStorage = new InMemorySessionStorage();
    const registry = new CapabilityRegistry([failingDescriptor]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: async () => {
        throw new Error("Element not found");
      },
    });

    const kernel = createKernel({
      storage,
      llm: { complete: async () => "" },
      registry,
      providers,
    });

    let callCount = 0;
    const provider: LlmProviderAdapter = {
      id: "test",
      resolveRequestUrl: () => "https://test.api/v1/chat/completions",
      send: async () => {
        callCount += 1;
        if (callCount === 1) {
          return sseResponse([
            chatChunk(undefined, [
              {
                index: 0,
                id: "tc_fail",
                function: { name: "page_click", arguments: '{"uid":"btn"}' },
              },
            ]),
            chatChunk(undefined, undefined, "tool_calls"),
            "[DONE]",
          ]);
        }
        return sseResponse([
          chatChunk("Unable to click the button."),
          chatChunk(undefined, undefined, "stop"),
          "[DONE]",
        ]);
      },
    };

    const session = await kernel.createSession();
    const result = await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      { sessionId: session.id, prompt: "Click the button" },
    );

    expect(result.telemetry.length).toBeGreaterThanOrEqual(1);
    const entry = result.telemetry[0];
    expect(entry.capabilityId).toBe("page.click");
    expect(entry.ok).toBe(false);
    expect(entry.errorCode).toBeDefined();
    expect(callCount).toBe(2);
  });

  it("returns empty telemetry for text-only responses", async () => {
    const { kernel, registry, provider } = setup(async () => {
      return sseResponse([chatChunk("Hello!"), chatChunk(undefined, undefined, "stop"), "[DONE]"]);
    });

    const session = await kernel.createSession();
    const result = await runLoop(
      { kernel, registry, provider, profileConfig: TEST_PROFILE_CONFIG },
      { sessionId: session.id, prompt: "Say hello" },
    );

    expect(result.telemetry).toEqual([]);
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

describe("buildSystemPromptBase", () => {
  it("uses actual tool names in guidance", () => {
    const tools: ToolContract[] = [
      {
        name: "page_query",
        capabilityId: "page.query",
        description: "q",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        annotations: {
          risk: "low",
          sideEffects: "reads",
          supportsVerify: false,
          supportsStreaming: false,
        },
      },
      {
        name: "page_click",
        capabilityId: "page.click",
        description: "c",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        annotations: {
          risk: "medium",
          sideEffects: "writes",
          supportsVerify: true,
          supportsStreaming: false,
        },
      },
      {
        name: "page_fill",
        capabilityId: "page.fill",
        description: "f",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        annotations: {
          risk: "medium",
          sideEffects: "writes",
          supportsVerify: true,
          supportsStreaming: false,
        },
      },
      {
        name: "page_press_key",
        capabilityId: "page.press_key",
        description: "k",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        annotations: {
          risk: "medium",
          sideEffects: "writes",
          supportsVerify: false,
          supportsStreaming: false,
        },
      },
      {
        name: "page_screenshot",
        capabilityId: "page.screenshot",
        description: "s",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        annotations: {
          risk: "low",
          sideEffects: "reads",
          supportsVerify: false,
          supportsStreaming: false,
        },
      },
      {
        name: "tabs_navigate",
        capabilityId: "tabs.navigate",
        description: "n",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        annotations: {
          risk: "low",
          sideEffects: "writes",
          supportsVerify: false,
          supportsStreaming: false,
        },
      },
    ];

    const prompt = buildSystemPromptBase(tools);
    expect(prompt).toContain("page_query");
    expect(prompt).toContain("page_click");
    expect(prompt).toContain("page_fill");
    expect(prompt).toContain("page_press_key");
    expect(prompt).toContain("page_screenshot");
    expect(prompt).toContain("tabs_navigate");
    expect(prompt).not.toContain("page.query");
    expect(prompt).not.toContain("tabs.navigate");
  });
});

describe("calculateLlmRetryDelayMs", () => {
  it("applies exponential backoff and caps retry-after to the route max", () => {
    expect(calculateLlmRetryDelayMs({ attempt: 0, maxDelayMs: 4_000 })).toBe(250);
    expect(calculateLlmRetryDelayMs({ attempt: 4, maxDelayMs: 1_000 })).toBe(1_000);
    expect(
      calculateLlmRetryDelayMs({
        attempt: 0,
        maxDelayMs: 1_500,
        retryAfterHeader: "5",
      }),
    ).toBe(1_500);
  });
});

describe("requestLlmWithRetry", () => {
  it("retries retryable status codes before succeeding", async () => {
    const config = makeRetryProfileConfig({
      profiles: [
        {
          id: "default",
          providerId: "test",
          llmBase: "https://test.api",
          llmKey: "test-key",
          llmModel: "test-model",
          llmRetryMaxAttempts: 2,
          llmMaxRetryDelayMs: 0,
        },
      ],
      defaultProfile: "default",
      fallbackProfile: undefined,
    });
    const routeResult = resolveLlmRoute(config);
    expect(routeResult.ok).toBe(true);
    if (!routeResult.ok) return;

    let callCount = 0;
    const provider: LlmProviderAdapter = {
      id: "test",
      resolveRequestUrl: () => "https://test.api/v1/chat/completions",
      send: async () => {
        callCount += 1;
        if (callCount < 3) {
          return new Response("busy", { status: 429 });
        }
        return new Response("ok", { status: 200 });
      },
    };

    const result = await requestLlmWithRetry({
      provider,
      profileConfig: config,
      route: routeResult.route,
      payload: { model: routeResult.route.llmModel, messages: [] },
      signal: new AbortController().signal,
    });

    expect(callCount).toBe(3);
    expect(result.route.profile).toBe("default");
    expect(result.response.status).toBe(200);
  });

  it("escalates to the fallback profile after repeated matching failures", async () => {
    const config = makeRetryProfileConfig();
    const routeResult = resolveLlmRoute(config);
    expect(routeResult.ok).toBe(true);
    if (!routeResult.ok) return;

    const seenProfiles: string[] = [];
    const seenModels: string[] = [];
    const provider: LlmProviderAdapter = {
      id: "test",
      resolveRequestUrl: () => "https://test.api/v1/chat/completions",
      send: async (input) => {
        seenProfiles.push(input.route.profile);
        seenModels.push(String(input.payload.model));
        if (input.route.profile === "default") {
          return new Response("overloaded", { status: 503 });
        }
        return new Response("ok", { status: 200 });
      },
    };

    const result = await requestLlmWithRetry({
      provider,
      profileConfig: config,
      route: routeResult.route,
      payload: { model: routeResult.route.llmModel, messages: [] },
      signal: new AbortController().signal,
    });

    expect(seenProfiles).toEqual(["default", "default", "fallback"]);
    expect(seenModels).toEqual(["test-model", "test-model", "fallback-model"]);
    expect(result.route.profile).toBe("fallback");
    expect(result.response.status).toBe(200);
  });
});
