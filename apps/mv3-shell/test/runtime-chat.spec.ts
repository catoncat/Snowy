import type { LlmProfileConfig } from "@bbl-next/contracts";
import { InMemorySessionStorage } from "@bbl-next/kernel";
import { describe, expect, it, vi } from "vitest";
import { RUNNER_BACKGROUND_TARGET, createBackgroundRunnerBridge } from "../src/background.js";
import { createBackgroundRuntimeServices } from "../src/runtime-services.js";

async function waitFor(predicate: () => boolean, timeoutMs = 250) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for async condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function waitForInterventionStatus(
  bridge: { route: (message: unknown) => Promise<any> },
  interventionId: string,
  status: string,
  timeoutMs = 250,
) {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    const result = await bridge.route({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "intervention.list",
    });
    const matched = result?.data?.items?.find?.(
      (entry: { id?: string; status?: string }) =>
        entry?.id === interventionId && entry?.status === status,
    );
    if (matched) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for intervention ${interventionId} to reach ${status}`);
}

function createInterventionSyncChannelHub() {
  const listeners = new Set<(event: { data: unknown }) => void>();

  return {
    createChannel() {
      return {
        postMessage(message: unknown) {
          queueMicrotask(() => {
            for (const listener of listeners) {
              listener({ data: message });
            }
          });
        },
        addEventListener(type: string, listener: (event: { data: unknown }) => void) {
          if (type === "message") {
            listeners.add(listener);
          }
        },
        removeEventListener(type: string, listener: (event: { data: unknown }) => void) {
          if (type === "message") {
            listeners.delete(listener);
          }
        },
        close() {
          return undefined;
        },
      };
    },
  };
}

describe("mv3-shell runtime chat bridge", () => {
  it("streams assistant fallback when no LLM config is set", async () => {
    const sentMessages: unknown[] = [];
    const services = createBackgroundRuntimeServices({
      sessionStorage: new InMemorySessionStorage(),
      chromeApi: {
        runtime: {
          sendMessage: vi.fn(async (message) => {
            sentMessages.push(message);
            return undefined;
          }),
        },
      },
    });

    const initial = await services.bootstrapChat();
    expect(initial.runState.status).toBe("idle");
    expect(initial.messages).toEqual([]);

    const accepted = await services.sendChatPrompt({ text: "Summarize the page" });
    expect(accepted).toMatchObject({ accepted: true });

    await waitFor(() =>
      sentMessages.some(
        (message) =>
          (message as { type?: string; event?: { type?: string } }).type ===
            "bbl-next.runtime.chat.event" &&
          (message as { event?: { type?: string } }).event?.type === "assistant.done",
      ),
    );

    const events = sentMessages
      .filter(
        (message): message is { type: string; event: { type: string } } =>
          (message as { type?: string }).type === "bbl-next.runtime.chat.event",
      )
      .map((message) => message.event.type);

    expect(events).toContain("run.state");
    expect(events).toContain("assistant.delta");
    expect(events).toContain("assistant.done");

    const doneEvent = sentMessages
      .filter(
        (msg): msg is { type: string; event: { type: string; text?: string } } =>
          (msg as { type?: string }).type === "bbl-next.runtime.chat.event" &&
          (msg as { event?: { type?: string } }).event?.type === "assistant.done",
      )
      .map((msg) => msg.event);
    expect(doneEvent[0]?.text).toContain("No LLM provider is configured");
  });

  it("stops an active stream and emits stopped state", async () => {
    const sentMessages: unknown[] = [];
    const services = createBackgroundRuntimeServices({
      sessionStorage: new InMemorySessionStorage(),
      chromeApi: {
        runtime: {
          sendMessage: vi.fn(async (message) => {
            sentMessages.push(message);
            return undefined;
          }),
        },
      },
    });

    await services.sendChatPrompt({ text: "Stop me" });
    await waitFor(() =>
      sentMessages.some(
        (message) => (message as { event?: { type?: string } }).event?.type === "assistant.delta",
      ),
    );

    const stopped = await services.stopChatRun();
    expect(stopped.runState.status).toBe("stopped");

    await waitFor(() =>
      sentMessages.some(
        (message) =>
          (message as { event?: { type?: string; status?: string } }).event?.type === "run.state" &&
          (message as { event?: { status?: string } }).event?.status === "stopped",
      ),
    );
  });

  it("routes runtime.chat.* messages through runtime services", async () => {
    const runtimeServices = {
      bootstrapChat: vi.fn(async () => ({
        sessionId: "s-1",
        messages: [],
        runState: { status: "idle" },
      })),
      sendChatPrompt: vi.fn(async ({ text }) => ({
        sessionId: "s-1",
        accepted: true,
        echoedText: text,
      })),
      stopChatRun: vi.fn(async () => ({ sessionId: "s-1", runState: { status: "stopped" } })),
      getKernelRuntimeState: vi.fn(async () => ({
        session: { id: "s-1" },
        runState: { phase: "idle" },
      })),
    };

    const bridge = createBackgroundRunnerBridge({
      chromeApi: {
        runtime: { getURL: (path: string) => path },
        offscreen: {},
      },
      runtimeServices,
    });

    await expect(
      bridge.route({ target: RUNNER_BACKGROUND_TARGET, kind: "runtime.chat.bootstrap" }),
    ).resolves.toMatchObject({ ok: true, data: { sessionId: "s-1" } });

    await expect(
      bridge.route({ target: RUNNER_BACKGROUND_TARGET, kind: "runtime.chat.send", text: "hello" }),
    ).resolves.toMatchObject({ ok: true, data: { accepted: true, echoedText: "hello" } });

    await expect(
      bridge.route({ target: RUNNER_BACKGROUND_TARGET, kind: "runtime.chat.stop" }),
    ).resolves.toMatchObject({ ok: true, data: { runState: { status: "stopped" } } });
  });

  it("routes loop.start / loop.stop / loop.status through runtime services", async () => {
    const runtimeServices = {
      sendChatPrompt: vi.fn(async ({ text }) => ({
        sessionId: "s-1",
        accepted: true,
        echoedText: text,
      })),
      stopChatRun: vi.fn(async () => ({ sessionId: "s-1", runState: { status: "stopped" } })),
      getLoopStatus: vi.fn(() => ({
        status: "idle",
        hasActiveRun: false,
        activeRunId: null,
      })),
      getKernelRuntimeState: vi.fn(async () => ({
        session: { id: "s-1" },
        runState: { phase: "idle" },
      })),
    };

    const bridge = createBackgroundRunnerBridge({
      chromeApi: {
        runtime: { getURL: (path: string) => path },
        offscreen: {},
      },
      runtimeServices,
    });

    await expect(
      bridge.route({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "loop.start",
        text: "Navigate to example.com",
      }),
    ).resolves.toMatchObject({ ok: true, data: { accepted: true } });

    await expect(
      bridge.route({ target: RUNNER_BACKGROUND_TARGET, kind: "loop.status" }),
    ).resolves.toMatchObject({ ok: true, data: { status: "idle" } });

    await expect(
      bridge.route({ target: RUNNER_BACKGROUND_TARGET, kind: "loop.stop" }),
    ).resolves.toMatchObject({ ok: true, data: { runState: { status: "stopped" } } });
  });

  it("routes llm.config.update through runtime services", async () => {
    const runtimeServices = {
      updateLlmConfig: vi.fn(async () => ({ updated: true, profileCount: 1 })),
      getKernelRuntimeState: vi.fn(async () => ({
        session: { id: "s-1" },
        runState: { phase: "idle" },
      })),
    };

    const bridge = createBackgroundRunnerBridge({
      chromeApi: {
        runtime: { getURL: (path: string) => path },
        offscreen: {},
      },
      runtimeServices,
    });

    await expect(
      bridge.route({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "llm.config.update",
        patch: { apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
      }),
    ).resolves.toMatchObject({ ok: true, data: { updated: true, profileCount: 1 } });

    expect(runtimeServices.updateLlmConfig).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });
  });
});

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

function createFixtureChromeApi() {
  return {
    runtime: {
      getURL: (path: string) => path,
      sendMessage: vi.fn(async () => undefined),
    },
    tabs: {
      query: vi.fn(async () => [
        { id: 11, url: "https://fixture.test/login", active: true, title: "Fixture Login" },
      ]),
    },
    offscreen: {},
  };
}

function createFixturePageHookBridge({ verified = false }: { verified?: boolean } = {}) {
  return {
    install: vi.fn(async (step: { scriptId: string }) => ({
      installationId: `${step.scriptId}:1`,
    })),
    invoke: vi.fn(
      async ({
        installation,
        action,
        input,
        tab,
      }: {
        installation: { step: { scriptId: string }; result: { installationId: string } };
        action: string;
        input: unknown;
        tab: { url: string };
      }) => ({
        ok: true,
        action,
        input,
        installationId: installation.result.installationId,
        installedScriptId: installation.step.scriptId,
        tabUrl: tab.url,
      }),
    ),
    verify: vi.fn(async () => verified),
  };
}

function buildSiteRuntimeInvokeRequest({
  action = "secure_login",
  verifier = "page_hook_ok",
}: {
  action?: string;
  verifier?: string;
} = {}) {
  return {
    skillId: "fixture.page",
    action,
    tab: {
      tabId: 11,
      url: "https://fixture.test/login",
      active: true,
    },
    input: {
      username: "alice",
    },
    plan: {
      skillId: "fixture.page",
      action,
      steps: [
        {
          world: "main" as const,
          scriptId: "bbl-next.page-hook.fixture",
        },
      ],
    },
    module: {
      id: `fixture.page.${action}`,
      source: `
        exports.default = async ({ input }) => ({
          username: input.username
        });
      `,
    },
    verifier,
    intervention: {
      kind: "takeover" as const,
      title: "Manual verify required",
      message: "Finish the verification flow manually.",
      trigger: "verify_failed" as const,
    },
  };
}

function createRunnerInvoke() {
  return async (invocation: { input: unknown }) => ({
    ok: true,
    data: {
      ok: true,
      result: {
        result: invocation.input,
        durationMs: 1,
      },
    },
  });
}

describe("mv3-shell end-to-end loop integration", () => {
  const TEST_PROFILE_CONFIG: LlmProfileConfig = {
    profiles: [
      {
        id: "default",
        providerId: "openai_compatible",
        llmBase: "https://test.api",
        llmKey: "test-key",
        llmModel: "test-model",
      },
    ],
    defaultProfile: "default",
  };

  it("runs end-to-end: prompt → LLM text response → assistant.done", async () => {
    const sentMessages: unknown[] = [];
    let fetchCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      fetchCallCount++;
      return sseResponse([
        chatChunk("Hello from the LLM!"),
        chatChunk(undefined, undefined, "stop"),
        "[DONE]",
      ]);
    }) as typeof fetch;

    try {
      const services = createBackgroundRuntimeServices({
        sessionStorage: new InMemorySessionStorage(),
        profileConfig: TEST_PROFILE_CONFIG,
        chromeApi: {
          runtime: {
            sendMessage: vi.fn(async (message) => {
              sentMessages.push(message);
              return undefined;
            }),
          },
        },
      });

      const accepted = await services.sendChatPrompt({ text: "Say hello" });
      expect(accepted).toMatchObject({ accepted: true });

      await waitFor(
        () =>
          sentMessages.some(
            (msg) =>
              (msg as { type?: string; event?: { type?: string } }).type ===
                "bbl-next.runtime.chat.event" &&
              (msg as { event?: { type?: string } }).event?.type === "assistant.done",
          ),
        2000,
      );

      expect(fetchCallCount).toBeGreaterThanOrEqual(1);

      const events = sentMessages
        .filter(
          (msg): msg is { type: string; event: { type: string } } =>
            (msg as { type?: string }).type === "bbl-next.runtime.chat.event",
        )
        .map((msg) => msg.event.type);

      expect(events).toContain("run.state");
      expect(events).toContain("assistant.delta");
      expect(events).toContain("assistant.done");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("can send a second chat prompt after the first response completes", async () => {
    const sentMessages: unknown[] = [];
    let fetchCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      fetchCallCount += 1;
      return sseResponse([
        chatChunk(fetchCallCount === 1 ? "First response" : "Second response"),
        chatChunk(undefined, undefined, "stop"),
        "[DONE]",
      ]);
    }) as typeof fetch;

    try {
      const services = createBackgroundRuntimeServices({
        sessionStorage: new InMemorySessionStorage(),
        profileConfig: TEST_PROFILE_CONFIG,
        chromeApi: {
          runtime: {
            sendMessage: vi.fn(async (message) => {
              sentMessages.push(message);
              return undefined;
            }),
          },
        },
      });

      await expect(services.sendChatPrompt({ text: "First" })).resolves.toMatchObject({
        accepted: true,
      });
      await waitFor(
        () =>
          sentMessages.some(
            (msg) =>
              (msg as { type?: string; event?: { type?: string; text?: string } }).type ===
                "bbl-next.runtime.chat.event" &&
              (msg as { event?: { type?: string; text?: string } }).event?.type ===
                "assistant.done" &&
              (msg as { event?: { text?: string } }).event?.text === "First response",
          ),
        2000,
      );

      await expect(services.sendChatPrompt({ text: "Second" })).resolves.toMatchObject({
        accepted: true,
      });
      await waitFor(
        () =>
          sentMessages.some(
            (msg) =>
              (msg as { type?: string; event?: { type?: string; text?: string } }).type ===
                "bbl-next.runtime.chat.event" &&
              (msg as { event?: { type?: string; text?: string } }).event?.type ===
                "assistant.done" &&
              (msg as { event?: { text?: string } }).event?.text === "Second response",
          ),
        2000,
      );

      expect(fetchCallCount).toBe(2);
      expect(
        sentMessages.some(
          (msg) =>
            (msg as { type?: string; event?: { type?: string } }).type ===
              "bbl-next.runtime.chat.event" &&
            (msg as { event?: { type?: string } }).event?.type === "run.error",
        ),
      ).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses kernel-managed provider/profile state on the runtime chat path", async () => {
    const sentMessages: unknown[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      sseResponse([
        chatChunk("Hello from the kernel-managed route"),
        chatChunk(undefined, undefined, "stop"),
        "[DONE]",
      ]),
    ) as typeof fetch;

    try {
      const services = createBackgroundRuntimeServices({
        sessionStorage: new InMemorySessionStorage(),
        profileConfig: TEST_PROFILE_CONFIG,
        chromeApi: {
          runtime: {
            sendMessage: vi.fn(async (message) => {
              sentMessages.push(message);
              return undefined;
            }),
          },
        },
      });
      const runtime = await services.ensureServices();
      const getActiveProfileSpy = vi.spyOn(runtime.kernel, "getActiveProfile");
      const getProviderRegistrySpy = vi.spyOn(runtime.kernel, "getProviderRegistry");

      const accepted = await services.sendChatPrompt({ text: "Use the kernel route" });
      expect(accepted).toMatchObject({ accepted: true });

      await waitFor(
        () =>
          sentMessages.some(
            (msg) =>
              (msg as { type?: string; event?: { type?: string } }).type ===
                "bbl-next.runtime.chat.event" &&
              (msg as { event?: { type?: string } }).event?.type === "assistant.done",
          ),
        2000,
      );

      expect(getActiveProfileSpy).toHaveBeenCalled();
      expect(getProviderRegistrySpy).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("records loop telemetry into runtime.history and audit.tail for tool executions", async () => {
    const sentMessages: unknown[] = [];
    let fetchCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      fetchCallCount += 1;
      if (fetchCallCount === 1) {
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
      return sseResponse([
        chatChunk("Navigation complete."),
        chatChunk(undefined, undefined, "stop"),
        "[DONE]",
      ]);
    }) as typeof fetch;

    try {
      const chromeApi = {
        runtime: {
          getURL: (path: string) => path,
          sendMessage: vi.fn(async (message) => {
            sentMessages.push(message);
            return undefined;
          }),
        },
        tabs: {
          query: vi.fn(async () => [
            { id: 11, url: "https://fixture.test/start", active: true, title: "Fixture Start" },
          ]),
          update: vi.fn(async (tabId: number, updateInfo: { url: string }) => ({
            id: tabId,
            url: updateInfo.url,
            active: true,
            title: "Fixture Target",
          })),
        },
        offscreen: {},
      };

      const bridge = createBackgroundRunnerBridge({
        chromeApi,
        sessionStorage: new InMemorySessionStorage(),
        profileConfig: TEST_PROFILE_CONFIG,
      });

      await expect(
        bridge.route({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "runtime.chat.send",
          text: "Go to example.com",
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          accepted: true,
        },
      });

      await waitFor(
        () =>
          sentMessages.some(
            (msg) =>
              (msg as { type?: string; event?: { type?: string } }).type ===
                "bbl-next.runtime.chat.event" &&
              (msg as { event?: { type?: string } }).event?.type === "assistant.done",
          ),
        2000,
      );

      await expect(
        bridge.route({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "resource.read",
          resourceId: "runtime.history",
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          id: "runtime.history",
          primitive: "resource",
          data: {
            status: "available",
            totalCount: 1,
            entries: [
              expect.objectContaining({
                stepIndex: 0,
                capabilityId: "tabs.navigate",
                ok: true,
                durationMs: expect.any(Number),
              }),
            ],
          },
        },
      });

      await expect(
        bridge.route({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "resource.read",
          resourceId: "audit.tail",
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          id: "audit.tail",
          data: {
            entries: expect.arrayContaining([
              expect.objectContaining({
                kind: "loop.step",
                capabilityId: "tabs.navigate",
                status: "executed",
                durationMs: expect.any(Number),
                sessionId: expect.any(String),
              }),
            ]),
          },
        },
      });

      expect(chromeApi.tabs.update).toHaveBeenCalledWith(11, {
        url: "https://example.com",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("emits fallback message when no LLM config is set", async () => {
    const sentMessages: unknown[] = [];

    const services = createBackgroundRuntimeServices({
      sessionStorage: new InMemorySessionStorage(),
      // No profileConfig → no LLM
      chromeApi: {
        runtime: {
          sendMessage: vi.fn(async (message) => {
            sentMessages.push(message);
            return undefined;
          }),
        },
      },
    });

    const accepted = await services.sendChatPrompt({ text: "Hello" });
    expect(accepted).toMatchObject({ accepted: true });

    await waitFor(() =>
      sentMessages.some(
        (msg) =>
          (msg as { type?: string; event?: { type?: string } }).type ===
            "bbl-next.runtime.chat.event" &&
          (msg as { event?: { type?: string } }).event?.type === "assistant.done",
      ),
    );

    const doneEvent = sentMessages
      .filter(
        (msg): msg is { type: string; event: { type: string; text?: string } } =>
          (msg as { type?: string }).type === "bbl-next.runtime.chat.event" &&
          (msg as { event?: { type?: string } }).event?.type === "assistant.done",
      )
      .map((msg) => msg.event);

    expect(doneEvent[0]?.text).toContain("No LLM provider is configured");
  });

  it("reads compaction continuity markers for observability replay consumers", async () => {
    const sessionStorage = new InMemorySessionStorage();
    const services = createBackgroundRuntimeServices({
      sessionStorage,
      chromeApi: {
        runtime: {
          sendMessage: vi.fn(async () => undefined),
        },
      },
    });

    const bootstrap = await services.bootstrapChat();
    const sessionId = bootstrap.sessionId;
    expect(typeof sessionId).toBe("string");

    const entries = await sessionStorage.getEntries(sessionId as string);
    const parentId = entries.at(-1)?.entryId;

    await sessionStorage.appendEntry(sessionId as string, {
      entryId: "cmp-1",
      parentId,
      type: "compaction",
      timestamp: "2026-04-16T00:00:10.000Z",
      payload: {
        reason: "threshold",
        summary: "Earlier turns compacted",
        firstKeptEntryId: "entry-9",
        previousSummary: "Older session summary",
        tokensBefore: 1200,
        tokensAfter: 320,
      },
    });

    await expect(services.readReplayContinuityMarkers()).resolves.toEqual([
      {
        entryId: "cmp-1",
        sessionId,
        timestamp: "2026-04-16T00:00:10.000Z",
        summary: "Earlier turns compacted",
        previousSummary: "Older session summary",
        firstKeptEntryId: "entry-9",
      },
    ]);
  });

  it("getLoopStatus returns idle when no run is active", () => {
    const services = createBackgroundRuntimeServices({
      sessionStorage: new InMemorySessionStorage(),
      chromeApi: {
        runtime: { sendMessage: vi.fn(async () => undefined) },
      },
    });

    const status = services.getLoopStatus();
    expect(status).toMatchObject({
      status: "idle",
      hasActiveRun: false,
      activeRunId: null,
    });
  });

  it("persists config.update state across runtime service restart and rehydrates model + automation", async () => {
    const storedData: Record<string, unknown> = {};
    const createStorageArea = () => ({
      get: vi.fn(async (keys) => {
        const result: Record<string, unknown> = {};
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (storedData[key]) {
            result[key] = storedData[key];
          }
        }
        return result;
      }),
      set: vi.fn(async (items) => {
        Object.assign(storedData, items);
      }),
    });

    const firstRuntimeServices = createBackgroundRuntimeServices({
      sessionStorage: new InMemorySessionStorage(),
      chromeApi: {
        ...createFixtureChromeApi(),
        storage: {
          local: createStorageArea(),
        },
      },
    });

    const updated = await firstRuntimeServices.dispatchCapability({
      capabilityId: "config.update",
      input: {
        patch: {
          model: {
            provider: "openai",
            api: "responses",
            model: "gpt-5.4",
          },
          automation: {
            activeTabOnly: true,
          },
        },
      },
    });

    expect(updated).toMatchObject({
      config: {
        status: "ready",
        values: {
          model: {
            provider: "openai",
            api: "responses",
            model: "gpt-5.4",
          },
          automation: {
            activeTabOnly: true,
          },
        },
      },
    });
    expect(storedData["bbl-next.llm.config.v1"]).toMatchObject({
      profiles: [
        expect.objectContaining({
          id: "default",
          llmModel: "gpt-5.4",
        }),
      ],
      defaultProfile: "default",
    });

    const secondRuntimeServices = createBackgroundRuntimeServices({
      sessionStorage: new InMemorySessionStorage(),
      chromeApi: {
        ...createFixtureChromeApi(),
        storage: {
          local: createStorageArea(),
        },
      },
    });

    await expect(secondRuntimeServices.getConfigBootstrapSummary()).resolves.toMatchObject({
      status: "ready",
      values: {
        model: {
          provider: "openai",
          api: "responses",
          model: "gpt-5.4",
        },
        automation: {
          activeTabOnly: true,
        },
      },
      updatedAt: expect.any(String),
    });

    const restartedKernelState = await secondRuntimeServices.getKernelRuntimeState();
    expect(restartedKernelState.activeProfile).toMatchObject({
      ok: true,
      route: expect.objectContaining({
        profile: "default",
        llmModel: "gpt-5.4",
      }),
    });
  });

  it("stores provider credentials through config.update while redacting API keys from summaries", async () => {
    const storedData: Record<string, unknown> = {};
    const createStorageArea = () => ({
      get: vi.fn(async (keys) => {
        const result: Record<string, unknown> = {};
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (storedData[key]) {
            result[key] = storedData[key];
          }
        }
        return result;
      }),
      set: vi.fn(async (items) => {
        Object.assign(storedData, items);
      }),
    });

    const services = createBackgroundRuntimeServices({
      sessionStorage: new InMemorySessionStorage(),
      chromeApi: {
        ...createFixtureChromeApi(),
        storage: {
          local: createStorageArea(),
        },
      },
    });

    const updated = await services.dispatchCapability({
      capabilityId: "config.update",
      input: {
        patch: {
          model: {
            provider: "openai",
            model: "gpt-4o",
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-config-update",
          },
        },
      },
    });

    expect(updated).toMatchObject({
      config: {
        status: "ready",
        values: {
          model: {
            provider: "openai",
            api: "responses",
            model: "gpt-4o",
            baseUrl: "https://api.openai.com/v1",
          },
        },
      },
    });
    expect(JSON.stringify(updated.config)).not.toContain("sk-config-update");
    expect(storedData["bbl-next.llm.config.v1"]).toMatchObject({
      profiles: [
        expect.objectContaining({
          id: "default",
          providerId: "openai_compatible",
          providerOptions: { api: "responses" },
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-config-update",
          llmModel: "gpt-4o",
        }),
      ],
      defaultProfile: "default",
    });
    expect(JSON.stringify(storedData["bbl-next.config.control-plane.v1"])).not.toContain(
      "sk-config-update",
    );

    const runtimeState = await services.getKernelRuntimeState();
    expect(runtimeState.activeProfile).toMatchObject({
      ok: true,
      route: expect.objectContaining({
        profile: "default",
        llmBase: "https://api.openai.com/v1",
        llmKey: "sk-config-update",
        llmModel: "gpt-4o",
        providerOptions: { api: "responses" },
      }),
    });

    const restartedServices = createBackgroundRuntimeServices({
      sessionStorage: new InMemorySessionStorage(),
      chromeApi: {
        ...createFixtureChromeApi(),
        storage: {
          local: createStorageArea(),
        },
      },
    });
    const restartedSummary = await restartedServices.getConfigBootstrapSummary();

    expect(restartedSummary).toMatchObject({
      status: "ready",
      values: {
        model: {
          provider: "openai",
          api: "responses",
          model: "gpt-4o",
          baseUrl: "https://api.openai.com/v1",
        },
      },
      updatedAt: expect.any(String),
    });
    expect(JSON.stringify(restartedSummary)).not.toContain("sk-config-update");
  });

  it("uses freshly saved config.update provider on the background chat path", async () => {
    const sentMessages: unknown[] = [];
    let fetchCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      fetchCallCount += 1;
      return sseResponse([
        chatChunk("Hello from saved provider"),
        chatChunk(undefined, undefined, "stop"),
        "[DONE]",
      ]);
    }) as typeof fetch;

    try {
      const bridge = createBackgroundRunnerBridge({
        chromeApi: {
          ...createFixtureChromeApi(),
          runtime: {
            getURL: (path: string) => path,
            sendMessage: vi.fn(async (message) => {
              sentMessages.push(message);
              return undefined;
            }),
          },
        },
        sessionStorage: new InMemorySessionStorage(),
      });

      await expect(
        bridge.route({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "config.update",
          patch: {
            model: {
              provider: "openai",
              model: "gpt-4o",
              baseUrl: "https://api.openai.com/v1/chat/completions",
              apiKey: "sk-background-chat",
            },
          },
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          config: {
            values: {
              model: {
                provider: "openai",
                api: "responses",
                model: "gpt-4o",
                baseUrl: "https://api.openai.com/v1/responses",
              },
            },
          },
        },
      });

      await expect(
        bridge.route({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "runtime.chat.send",
          text: "Use saved provider",
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          accepted: true,
        },
      });

      await waitFor(
        () =>
          sentMessages.some(
            (msg) =>
              (msg as { type?: string; event?: { type?: string } }).type ===
                "bbl-next.runtime.chat.event" &&
              (msg as { event?: { type?: string } }).event?.type === "assistant.done",
          ),
        2000,
      );

      const doneEvent = sentMessages.find(
        (msg): msg is { type: string; event: { type: string; text?: string } } =>
          (msg as { type?: string }).type === "bbl-next.runtime.chat.event" &&
          (msg as { event?: { type?: string } }).event?.type === "assistant.done",
      );

      expect(fetchCallCount).toBeGreaterThan(0);
      const [requestUrl, requestOptions] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(requestUrl).toBe("https://api.openai.com/v1/responses");
      expect(JSON.parse(String(requestOptions.body))).toMatchObject({
        model: "gpt-4o",
        input: expect.arrayContaining([{ role: "user", content: "Use saved provider" }]),
      });
      expect(doneEvent?.event.text).toBe("Hello from saved provider");
      expect(doneEvent?.event.text).not.toContain("No LLM provider is configured");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes human-entered OpenAI provider aliases before chat routing", async () => {
    const sentMessages: unknown[] = [];
    let fetchCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      fetchCallCount += 1;
      return sseResponse([
        chatChunk("Hello from provider alias"),
        chatChunk(undefined, undefined, "stop"),
        "[DONE]",
      ]);
    }) as typeof fetch;

    try {
      const bridge = createBackgroundRunnerBridge({
        chromeApi: {
          ...createFixtureChromeApi(),
          runtime: {
            getURL: (path: string) => path,
            sendMessage: vi.fn(async (message) => {
              sentMessages.push(message);
              return undefined;
            }),
          },
        },
        sessionStorage: new InMemorySessionStorage(),
      });

      await expect(
        bridge.route({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "config.update",
          patch: {
            model: {
              provider: "OpenAI Compatible",
              model: "gpt-4o",
              baseUrl: "https://api.openai.com/v1",
              apiKey: "sk-provider-alias",
            },
          },
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          config: {
            values: {
              model: {
                provider: "openai",
              },
            },
          },
        },
      });

      await expect(
        bridge.route({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "runtime.chat.send",
          text: "Use provider alias",
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          accepted: true,
        },
      });

      await waitFor(
        () =>
          sentMessages.some(
            (msg) =>
              (msg as { type?: string; event?: { type?: string } }).type ===
                "bbl-next.runtime.chat.event" &&
              (msg as { event?: { type?: string } }).event?.type === "assistant.done",
          ),
        2000,
      );

      const doneEvent = sentMessages.find(
        (msg): msg is { type: string; event: { type: string; text?: string } } =>
          (msg as { type?: string }).type === "bbl-next.runtime.chat.event" &&
          (msg as { event?: { type?: string } }).event?.type === "assistant.done",
      );

      expect(fetchCallCount).toBeGreaterThan(0);
      expect(doneEvent?.event.text).toBe("Hello from provider alias");
      expect(doneEvent?.event.text).not.toContain("No LLM provider is configured");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("applies shared model.routing overrides to the active kernel route without explicit per-call overrides", async () => {
    const storedData: Record<string, unknown> = {};
    const createStorageArea = () => ({
      get: vi.fn(async (keys) => {
        const result: Record<string, unknown> = {};
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (storedData[key]) {
            result[key] = storedData[key];
          }
        }
        return result;
      }),
      set: vi.fn(async (items) => {
        Object.assign(storedData, items);
      }),
    });

    const services = createBackgroundRuntimeServices({
      sessionStorage: new InMemorySessionStorage(),
      profileConfig: {
        profiles: [
          {
            id: "default",
            providerId: "openai_compatible",
            llmBase: "https://api.openai.com/v1",
            llmKey: "sk-default",
            llmModel: "gpt-4.1",
          },
          {
            id: "fallback",
            providerId: "openai_compatible",
            llmBase: "https://api.openai.com/v1",
            llmKey: "sk-fallback",
            llmModel: "gpt-4.1-mini",
          },
        ],
        defaultProfile: "default",
      },
      chromeApi: {
        ...createFixtureChromeApi(),
        storage: {
          local: createStorageArea(),
        },
      },
    });

    await expect(
      services.dispatchCapability({
        capabilityId: "config.update",
        input: {
          patch: {
            model: {
              routing: {
                defaultProfile: "fallback",
                fallbackProfile: "default",
                laneProfiles: {
                  primary: ["fallback"],
                  compaction: ["default"],
                },
              },
            },
          },
        },
      }),
    ).resolves.toMatchObject({
      config: {
        values: {
          model: {
            routing: {
              defaultProfile: "fallback",
              fallbackProfile: "default",
              laneProfiles: {
                primary: ["fallback"],
                compaction: ["default"],
              },
            },
          },
        },
      },
    });

    const runtimeState = await services.getKernelRuntimeState();
    expect(runtimeState.activeProfile).toMatchObject({
      ok: true,
      route: expect.objectContaining({
        profile: "fallback",
        orderedProfiles: ["fallback"],
      }),
    });

    const { kernel } = await services.ensureServices();
    expect(kernel.resolveProviderRoute({ lane: "compaction" })).toMatchObject({
      ok: true,
      route: expect.objectContaining({
        profile: "default",
        orderedProfiles: ["default"],
      }),
    });
  });

  it("rehydrates shared model.routing overrides from config.summary into runtime-owned profile config after restart", async () => {
    const storedData: Record<string, unknown> = {
      "bbl-next.llm.config.v1": {
        profiles: [
          {
            id: "default",
            providerId: "openai_compatible",
            llmBase: "https://api.openai.com/v1",
            llmKey: "sk-default",
            llmModel: "gpt-4.1",
          },
          {
            id: "fallback",
            providerId: "openai_compatible",
            llmBase: "https://api.openai.com/v1",
            llmKey: "sk-fallback",
            llmModel: "gpt-4.1-mini",
          },
        ],
        defaultProfile: "default",
      },
      "bbl-next.config.control-plane.v1": {
        status: "ready",
        fields: ["model", "automation", "permissions", "preferences"],
        values: {
          model: {
            routing: {
              defaultProfile: "fallback",
              fallbackProfile: "default",
              laneProfiles: {
                primary: ["fallback"],
                compaction: ["default"],
              },
            },
          },
        },
        note: null,
        updatedAt: "2026-04-17T10:00:00.000Z",
      },
    };
    const createStorageArea = () => ({
      get: vi.fn(async (keys) => {
        const result: Record<string, unknown> = {};
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (storedData[key]) {
            result[key] = storedData[key];
          }
        }
        return result;
      }),
      set: vi.fn(async (items) => {
        Object.assign(storedData, items);
      }),
    });

    const services = createBackgroundRuntimeServices({
      sessionStorage: new InMemorySessionStorage(),
      chromeApi: {
        ...createFixtureChromeApi(),
        storage: {
          local: createStorageArea(),
        },
      },
    });

    await expect(services.getConfigBootstrapSummary()).resolves.toMatchObject({
      status: "ready",
      values: {
        model: {
          routing: {
            defaultProfile: "fallback",
            fallbackProfile: "default",
            laneProfiles: {
              primary: ["fallback"],
              compaction: ["default"],
            },
          },
        },
      },
    });

    const runtimeState = await services.getKernelRuntimeState();
    expect(runtimeState.activeProfile).toMatchObject({
      ok: true,
      route: expect.objectContaining({
        profile: "fallback",
        orderedProfiles: ["fallback"],
      }),
    });

    const { kernel } = await services.ensureServices();
    expect(kernel.resolveProviderRoute({ lane: "compaction" })).toMatchObject({
      ok: true,
      route: expect.objectContaining({
        profile: "default",
        orderedProfiles: ["default"],
      }),
    });
  });

  it("updateLlmConfig stores and updates kernel-managed profile state without resetting services", async () => {
    const storedData: Record<string, unknown> = {};
    const initialProfileConfig: LlmProfileConfig = {
      profiles: [
        {
          id: "default",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-old",
          llmModel: "gpt-4o-mini",
        },
        {
          id: "fallback",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-fallback",
          llmModel: "gpt-4.1",
        },
      ],
      defaultProfile: "default",
    };
    const services = createBackgroundRuntimeServices({
      sessionStorage: new InMemorySessionStorage(),
      profileConfig: initialProfileConfig,
      chromeApi: {
        runtime: { sendMessage: vi.fn(async () => undefined) },
        storage: {
          local: {
            get: vi.fn(async (keys) => {
              const result: Record<string, unknown> = {};
              for (const key of Array.isArray(keys) ? keys : [keys]) {
                if (storedData[key]) result[key] = storedData[key];
              }
              return result;
            }),
            set: vi.fn(async (items) => {
              Object.assign(storedData, items);
            }),
          },
        },
      },
    });
    const firstRuntime = await services.ensureServices();
    const initialKernelState = await services.getKernelRuntimeState();

    const result = await services.updateLlmConfig({
      profiles: [
        {
          id: "default",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-old",
          llmModel: "gpt-4o-mini",
        },
        {
          id: "fallback",
          providerId: "openai_compatible",
          llmBase: "https://api.anthropic.com/v1",
          llmKey: "sk-fallback",
          llmModel: "claude-3-opus",
        },
      ],
      defaultProfile: "fallback",
    });

    const secondRuntime = await services.ensureServices();
    const updatedKernelState = await services.getKernelRuntimeState();

    expect(result).toMatchObject({ updated: true, profileCount: 2 });
    expect(secondRuntime.kernel).toBe(firstRuntime.kernel);
    expect(updatedKernelState.session.id).toBe(initialKernelState.session.id);
    expect(updatedKernelState.activeProfile).toMatchObject({
      ok: true,
      route: expect.objectContaining({
        profile: "fallback",
        llmModel: "claude-3-opus",
      }),
    });
    expect(storedData["bbl-next.llm.config.v1"]).toMatchObject({
      profiles: [
        expect.objectContaining({
          id: "default",
          llmKey: "sk-old",
          llmBase: "https://api.openai.com/v1",
          llmModel: "gpt-4o-mini",
        }),
        expect.objectContaining({
          id: "fallback",
          llmKey: "sk-fallback",
          llmBase: "https://api.anthropic.com/v1",
          llmModel: "claude-3-opus",
        }),
      ],
      defaultProfile: "fallback",
    });

    await expect(services.getConfigBootstrapSummary()).resolves.toMatchObject({
      status: "ready",
      values: {
        model: {
          model: "claude-3-opus",
        },
      },
      updatedAt: expect.any(String),
    });

    const restartedServices = createBackgroundRuntimeServices({
      sessionStorage: new InMemorySessionStorage(),
      chromeApi: {
        runtime: { sendMessage: vi.fn(async () => undefined) },
        storage: {
          local: {
            get: vi.fn(async (keys) => {
              const result: Record<string, unknown> = {};
              for (const key of Array.isArray(keys) ? keys : [keys]) {
                if (storedData[key]) result[key] = storedData[key];
              }
              return result;
            }),
            set: vi.fn(async (items) => {
              Object.assign(storedData, items);
            }),
          },
        },
      },
    });

    await expect(restartedServices.getConfigBootstrapSummary()).resolves.toMatchObject({
      status: "ready",
      values: {
        model: {
          model: "claude-3-opus",
        },
      },
      updatedAt: expect.any(String),
    });
  });
});

describe("mv3-shell intervention bridge integration", () => {
  it("routes intervention.list and intervention.resolve with kernel-backed state", async () => {
    const chromeApi = createFixtureChromeApi();
    const runtimeServices = createBackgroundRuntimeServices({
      chromeApi,
      invokeRunner: createRunnerInvoke(),
      pageHookBridge: createFixturePageHookBridge(),
      sessionStorage: new InMemorySessionStorage(),
      interventionTimeoutMs: 10_000,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi,
      runtimeServices,
    });

    const invoked = await runtimeServices.invokeSiteSkill(buildSiteRuntimeInvokeRequest());
    const intervention = invoked.intervention;

    expect(intervention).toMatchObject({
      id: "ivr:fixture.page:secure_login:verify_failed:11:page_hook_ok",
      status: "requested",
      trigger: "verify_failed",
    });

    await expect(
      bridge.route({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "intervention.list",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        summary: {
          status: "requested",
          activeCount: 1,
        },
        items: [
          expect.objectContaining({
            id: intervention.id,
            status: "requested",
          }),
        ],
      },
    });

    await expect(
      bridge.route({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "resource.read",
        resourceId: "runtime.summary",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: "runtime.summary",
        data: {
          interventions: {
            status: "requested",
            activeCount: 1,
            recentCount: 0,
            active: [
              expect.objectContaining({
                id: intervention.id,
                status: "requested",
              }),
            ],
            recent: [],
          },
        },
      },
    });

    await expect(
      bridge.route({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "intervention.resolve",
        interventionId: intervention.id,
        resolution: {
          resolution: "resume",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        intervention: {
          id: intervention.id,
          status: "resolved",
          resolution: {
            resolution: "resume",
          },
        },
      },
    });

    await expect(
      bridge.route({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "intervention.list",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        summary: {
          status: "settled",
          activeCount: 0,
        },
        items: [
          expect.objectContaining({
            id: intervention.id,
            status: "resolved",
          }),
        ],
      },
    });

    await expect(
      bridge.route({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "resource.read",
        resourceId: "runtime.summary",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: "runtime.summary",
        data: {
          interventions: {
            status: "settled",
            activeCount: 0,
            recentCount: 1,
            active: [],
            recent: [
              expect.objectContaining({
                id: intervention.id,
                status: "resolved",
              }),
            ],
          },
        },
      },
    });
  });

  it("exposes cancellation and timeout paths through the intervention bridge", async () => {
    const chromeApi = createFixtureChromeApi();
    const runtimeServices = createBackgroundRuntimeServices({
      chromeApi,
      invokeRunner: createRunnerInvoke(),
      pageHookBridge: createFixturePageHookBridge(),
      sessionStorage: new InMemorySessionStorage(),
      interventionTimeoutMs: 5,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi,
      runtimeServices,
    });

    const cancelledInvoke = await runtimeServices.invokeSiteSkill(
      buildSiteRuntimeInvokeRequest({
        action: "secure_login_cancel",
        verifier: "page_hook_cancel",
      }),
    );

    await expect(
      bridge.route({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "intervention.cancel",
        interventionId: cancelledInvoke.intervention.id,
        reason: "user_cancelled",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        intervention: {
          id: cancelledInvoke.intervention.id,
          status: "cancelled",
          resolution: {
            reason: "user_cancelled",
          },
        },
      },
    });

    const timedOutInvoke = await runtimeServices.invokeSiteSkill(
      buildSiteRuntimeInvokeRequest({
        action: "secure_login_timeout",
        verifier: "page_hook_timeout",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    await expect(
      bridge.route({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "intervention.list",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        summary: {
          status: "settled",
          activeCount: 0,
        },
        items: expect.arrayContaining([
          expect.objectContaining({
            id: cancelledInvoke.intervention.id,
            status: "cancelled",
          }),
          expect.objectContaining({
            id: timedOutInvoke.intervention.id,
            status: "timed_out",
          }),
        ]),
      },
    });

    await expect(
      bridge.route({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "resource.read",
        resourceId: "runtime.summary",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: "runtime.summary",
        data: {
          interventions: {
            status: "settled",
            activeCount: 0,
            recentCount: 2,
            active: [],
            recent: expect.arrayContaining([
              expect.objectContaining({
                id: cancelledInvoke.intervention.id,
                status: "cancelled",
              }),
              expect.objectContaining({
                id: timedOutInvoke.intervention.id,
                status: "timed_out",
              }),
            ]),
          },
        },
      },
    });
  });

  it("surfaces stale and timeout intervention escalations through audit.tail", async () => {
    const chromeApi = createFixtureChromeApi();
    const runtimeServices = createBackgroundRuntimeServices({
      chromeApi,
      invokeRunner: createRunnerInvoke(),
      pageHookBridge: createFixturePageHookBridge(),
      sessionStorage: new InMemorySessionStorage(),
      interventionTimeoutMs: 40,
      interventionEscalationMs: 10,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi,
      runtimeServices,
    });

    const invoked = await runtimeServices.invokeSiteSkill(buildSiteRuntimeInvokeRequest());

    await new Promise((resolve) => setTimeout(resolve, 15));

    await expect(
      bridge.route({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "audit.tail",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: "audit.tail",
        data: {
          entries: expect.arrayContaining([
            expect.objectContaining({
              kind: "intervention.escalation",
              interventionId: invoked.intervention.id,
              status: "attention_required",
              escalation: expect.objectContaining({
                reason: "stale",
                thresholdMs: 10,
              }),
            }),
          ]),
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 40));

    await expect(
      bridge.route({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "audit.tail",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: "audit.tail",
        data: {
          entries: expect.arrayContaining([
            expect.objectContaining({
              kind: "intervention.escalation",
              interventionId: invoked.intervention.id,
              status: "timed_out",
              escalation: expect.objectContaining({
                reason: "timeout",
                thresholdMs: 40,
              }),
            }),
          ]),
        },
      },
    });
  });

  it("syncs intervention state across runtime service instances via a shared channel", async () => {
    const sessionStorage = new InMemorySessionStorage();
    const syncHub = createInterventionSyncChannelHub();
    const firstChromeApi = createFixtureChromeApi();
    const firstRuntimeServices = createBackgroundRuntimeServices({
      chromeApi: firstChromeApi,
      invokeRunner: createRunnerInvoke(),
      pageHookBridge: createFixturePageHookBridge(),
      sessionStorage,
      interventionTimeoutMs: 10_000,
      interventionSyncChannel: syncHub.createChannel(),
    });
    const firstBridge = createBackgroundRunnerBridge({
      chromeApi: firstChromeApi,
      runtimeServices: firstRuntimeServices,
    });

    const secondChromeApi = createFixtureChromeApi();
    const secondRuntimeServices = createBackgroundRuntimeServices({
      chromeApi: secondChromeApi,
      invokeRunner: createRunnerInvoke(),
      pageHookBridge: createFixturePageHookBridge(),
      sessionStorage,
      interventionTimeoutMs: 10_000,
      interventionSyncChannel: syncHub.createChannel(),
    });
    const secondBridge = createBackgroundRunnerBridge({
      chromeApi: secondChromeApi,
      runtimeServices: secondRuntimeServices,
    });

    await secondRuntimeServices.ensureSession();

    const requested = await firstRuntimeServices.invokeSiteSkill(buildSiteRuntimeInvokeRequest());

    await expect(
      waitForInterventionStatus(secondBridge, requested.intervention.id, "requested"),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        summary: {
          status: "requested",
          activeCount: 1,
        },
      },
    });

    await secondBridge.route({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "intervention.resolve",
      interventionId: requested.intervention.id,
      resolution: {
        resolution: "resume",
      },
    });

    await expect(
      waitForInterventionStatus(firstBridge, requested.intervention.id, "resolved"),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        summary: {
          status: "settled",
          activeCount: 0,
        },
      },
    });
  });

  it("rehydrates pending interventions across runtime service restart", async () => {
    const sessionStorage = new InMemorySessionStorage();
    const firstChromeApi = createFixtureChromeApi();
    const firstRuntimeServices = createBackgroundRuntimeServices({
      chromeApi: firstChromeApi,
      invokeRunner: createRunnerInvoke(),
      pageHookBridge: createFixturePageHookBridge(),
      sessionStorage,
      interventionTimeoutMs: 10_000,
    });

    const firstInvoke = await firstRuntimeServices.invokeSiteSkill(buildSiteRuntimeInvokeRequest());

    const secondChromeApi = createFixtureChromeApi();
    const secondRuntimeServices = createBackgroundRuntimeServices({
      chromeApi: secondChromeApi,
      invokeRunner: createRunnerInvoke(),
      pageHookBridge: createFixturePageHookBridge(),
      sessionStorage,
      interventionTimeoutMs: 10_000,
    });
    const secondBridge = createBackgroundRunnerBridge({
      chromeApi: secondChromeApi,
      runtimeServices: secondRuntimeServices,
    });

    // Trigger session initialization to rehydrate persisted interventions
    await secondRuntimeServices.ensureSession();

    await expect(
      secondBridge.route({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "intervention.list",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        summary: {
          status: "requested",
          activeCount: 1,
        },
        items: [
          expect.objectContaining({
            id: firstInvoke.intervention.id,
            status: "requested",
          }),
        ],
      },
    });

    const kernelState = await secondRuntimeServices.getKernelRuntimeState();
    expect(kernelState.session.id).toBe(firstInvoke.intervention.sessionId);

    await expect(
      secondBridge.route({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "intervention.resolve",
        interventionId: firstInvoke.intervention.id,
        resolution: {
          resolution: "resume",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        intervention: {
          id: firstInvoke.intervention.id,
          status: "resolved",
        },
      },
    });
  });
});
