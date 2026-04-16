import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import type { KernelDiagnosticsSnapshot } from "@bbl-next/contracts";
import { InMemorySessionStorage } from "@bbl-next/kernel";
import { describe, expect, it, vi } from "vitest";
import manifest from "../manifest.json";
import {
  RUNNER_BACKGROUND_TARGET,
  RUNNER_OFFSCREEN_DOCUMENT_PATH,
  RUNNER_OFFSCREEN_REASONS,
  createBackgroundRunnerBridge,
  createPageHookBridge,
} from "../src/background.js";
import { createDefaultOffscreenRunnerHost, createOffscreenRunnerBridge } from "../src/offscreen.js";
import {
  SIDEPANEL_MANAGEMENT_ACTION_KINDS,
  SIDEPANEL_MANAGEMENT_RESOURCE_IDS,
  createBackgroundRuntimeServices,
  createRemoteExecAdapter,
  createRemoteHostProbe,
  createRemoteHostTransport,
  isSidepanelManagementActionKind,
  isSidepanelManagementResourceId,
} from "../src/runtime-services.js";

type MessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (value: unknown) => void,
) => unknown;

function createDomSandbox() {
  const dispatchLog: Array<{ target: string; type: string; key?: string }> = [];

  function createTarget(target: string) {
    return {
      dispatchEvent(event: { type: string; key?: string }) {
        dispatchLog.push({
          target,
          type: event.type,
          ...(typeof event.key === "string" ? { key: event.key } : {}),
        });
        return true;
      },
    };
  }

  class KeyboardEvent {
    readonly type: string;
    readonly key: string;
    readonly bubbles: boolean;
    readonly cancelable: boolean;
    readonly composed: boolean;

    constructor(type: string, init: Record<string, unknown> = {}) {
      this.type = type;
      this.key = typeof init.key === "string" ? init.key : "";
      this.bubbles = init.bubbles === true;
      this.cancelable = init.cancelable === true;
      this.composed = init.composed === true;
    }
  }

  const activeElement = createTarget("activeElement");
  const body = createTarget("body");
  const documentElement = createTarget("documentElement");
  const document = {
    activeElement,
    body,
    documentElement,
    dispatchEvent: createTarget("document").dispatchEvent,
    __dispatchLog: dispatchLog,
  };

  return {
    document,
    KeyboardEvent,
  };
}

function createMessageBus() {
  const listeners: MessageListener[] = [];

  const onMessage = {
    addListener(listener: MessageListener) {
      listeners.push(listener);
    },
    removeListener(listener: MessageListener) {
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    },
  };

  async function sendMessage(message: unknown) {
    for (const listener of [...listeners]) {
      const response = await new Promise((resolve) => {
        let settled = false;
        const sendResponse = (value: unknown) => {
          settled = true;
          resolve(value);
        };
        const result = listener(message, {}, sendResponse);
        if (result && typeof (result as Promise<unknown>).then === "function") {
          Promise.resolve(result as Promise<unknown>).then(resolve);
          return;
        }
        if (result === true) {
          return;
        }
        if (result !== undefined) {
          settled = true;
          resolve(result);
          return;
        }
        if (!settled) {
          resolve(undefined);
        }
      });
      if (response !== undefined) {
        return response;
      }
    }
    return undefined;
  }

  return {
    onMessage,
    sendMessage,
  };
}

function resolveSourceFixturePath(file: string): URL {
  const direct = new URL(`../${file}`, import.meta.url);
  if (existsSync(direct)) {
    return direct;
  }
  if (file.endsWith(".js")) {
    const tsFallback = new URL(`../${file.slice(0, -3)}.ts`, import.meta.url);
    if (existsSync(tsFallback)) {
      return tsFallback;
    }
  }
  return direct;
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function createAuditStoreHarness(initialEntries: unknown[] = []) {
  let persistedEntries = cloneValue(initialEntries);
  return {
    async load() {
      return cloneValue(persistedEntries);
    },
    async save(entries: unknown[]) {
      persistedEntries = cloneValue(entries);
    },
  };
}

function createStorageAreaHarness(initialEntries: Record<string, unknown> = {}) {
  const persistedEntries = cloneValue(initialEntries);
  return {
    async get(keys: string | string[]) {
      const result: Record<string, unknown> = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (key in persistedEntries) {
          result[key] = cloneValue(persistedEntries[key]);
        }
      }
      return result;
    },
    async set(entries: Record<string, unknown>) {
      for (const [key, value] of Object.entries(entries)) {
        persistedEntries[key] = cloneValue(value);
      }
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete persistedEntries[key];
      }
    },
    dump() {
      return cloneValue(persistedEntries);
    },
  };
}

type KernelDiagnosticsSnapshotOverrides = {
  session?: Partial<KernelDiagnosticsSnapshot["session"]>;
  run?: Partial<KernelDiagnosticsSnapshot["run"]>;
  loop?: Partial<KernelDiagnosticsSnapshot["loop"]>;
  interventions?: Partial<KernelDiagnosticsSnapshot["interventions"]>;
  provider?: Partial<KernelDiagnosticsSnapshot["provider"]>;
};

function createKernelDiagnosticsSnapshot(
  overrides: KernelDiagnosticsSnapshotOverrides = {},
): KernelDiagnosticsSnapshot {
  return {
    session: {
      id: "kernel-session",
      createdAt: "2026-04-09T03:20:00.000Z",
      title: "mv3-shell runtime session",
      model: null,
      ...(overrides.session ?? {}),
    },
    run: {
      phase: "idle",
      queuedPrompts: {
        steer: 0,
        followUp: 0,
      },
      retry: {
        active: false,
        attempt: 0,
        maxAttempts: 2,
      },
      ...(overrides.run ?? {}),
    },
    loop: {
      stepCount: 0,
      noProgress: null,
      maxSteps: 50,
      ...(overrides.loop ?? {}),
    },
    interventions: {
      status: "empty",
      totalCount: 0,
      activeCount: 0,
      recentCount: 0,
      active: [],
      recent: [],
      ...(overrides.interventions ?? {}),
    },
    provider: {
      route: {
        status: "empty",
        profile: null,
        provider: null,
        llmModel: null,
        orderedProfiles: [],
      },
      registered: [],
      ...(overrides.provider ?? {}),
    },
  };
}

function createChromeHarness({
  host,
  createHost,
  autoRegisterOffscreen = true,
  hangOffscreen = false,
  activeTab,
  storageArea,
}: {
  host?: {
    dispatch: (request: unknown) => Promise<unknown>;
    getHealth: () => unknown;
  };
  createHost?: () => {
    dispatch: (request: unknown) => Promise<unknown>;
    getHealth: () => unknown;
  };
  autoRegisterOffscreen?: boolean;
  hangOffscreen?: boolean;
  activeTab?: {
    id: number;
    url: string;
    active?: boolean;
    title?: string;
  } | null;
  storageArea?: {
    get: (keys: string | string[]) => Promise<Record<string, unknown>>;
    set: (entries: Record<string, unknown>) => Promise<void>;
    remove?: (keys: string | string[]) => Promise<void>;
  };
}) {
  const messageBus = createMessageBus();
  let hasOffscreen = false;
  let disposeOffscreen: null | (() => void) = null;
  let currentActiveTab = activeTab
    ? {
        ...activeTab,
        active: activeTab.active ?? true,
      }
    : null;
  const hostFactory = createHost ?? (host ? () => host : undefined);
  const runtimeApi = {
    ...messageBus,
    onInstalled: {
      addListener: vi.fn(),
    },
    getURL(path: string) {
      return `chrome-extension://test/${path}`;
    },
    async getContexts({ documentUrls }: { documentUrls?: string[] }) {
      if (!hasOffscreen) {
        return [];
      }
      const offscreenUrl = runtimeApi.getURL(RUNNER_OFFSCREEN_DOCUMENT_PATH);
      return documentUrls?.includes(offscreenUrl)
        ? [{ contextType: "OFFSCREEN_DOCUMENT", documentUrl: offscreenUrl }]
        : [];
    },
  };

  if (hangOffscreen) {
    runtimeApi.sendMessage = vi.fn(() => new Promise(() => {}));
  } else {
    runtimeApi.sendMessage = vi.fn((message) => messageBus.sendMessage(message));
  }

  const tabsApi = {
    query: vi.fn(async () =>
      currentActiveTab
        ? [
            {
              ...currentActiveTab,
            },
          ]
        : [],
    ),
    update: vi.fn(async (tabId: number, updateProperties: { url?: string }) => {
      if (!currentActiveTab || currentActiveTab.id !== tabId) {
        throw new Error(`Active tab ${tabId} is unavailable`);
      }
      currentActiveTab = {
        ...currentActiveTab,
        ...(typeof updateProperties.url === "string" ? { url: updateProperties.url } : {}),
        active: true,
      };
      return {
        ...currentActiveTab,
      };
    }),
    create: vi.fn(async ({ url, active = false }: { url?: string; active?: boolean }) => ({
      id: Math.max(currentActiveTab?.id ?? 0, Date.now()) + 1,
      url: typeof url === "string" ? url : "about:blank",
      active: active === true,
      title: active === true ? "Active Tab" : "Background Tab",
    })),
    remove: vi.fn(async (_tabId: number) => undefined),
    captureVisibleTab: vi.fn(
      async (windowId: number | undefined, options?: { format?: string; quality?: number }) => {
        if (!currentActiveTab) {
          throw new Error("Active tab is unavailable");
        }
        const format = options?.format === "jpeg" ? "jpeg" : "png";
        const payload = Buffer.from(
          JSON.stringify({
            tabId: currentActiveTab.id,
            url: currentActiveTab.url,
            windowId: windowId ?? null,
            quality: options?.quality ?? null,
          }),
        ).toString("base64");
        return `data:image/${format};base64,${payload}`;
      },
    ),
  };

  const offscreenApi = {
    createDocument: vi.fn(async () => {
      hasOffscreen = true;
      if (autoRegisterOffscreen) {
        disposeOffscreen?.();
        disposeOffscreen = createOffscreenRunnerBridge(
          hostFactory
            ? {
                runtimeApi,
                createHost: () => hostFactory(),
              }
            : {
                runtimeApi,
              },
        ).registerRuntimeListener();
      }
    }),
    closeDocument: vi.fn(async () => {
      hasOffscreen = false;
      disposeOffscreen?.();
      disposeOffscreen = null;
    }),
  };

  return {
    chromeApi: {
      runtime: runtimeApi,
      offscreen: offscreenApi,
      tabs: tabsApi,
      ...(storageArea
        ? {
            storage: {
              local: storageArea,
            },
          }
        : {}),
    },
    runtimeApi,
    offscreenApi,
    tabsApi,
    dropOffscreenListener() {
      disposeOffscreen?.();
      disposeOffscreen = null;
    },
    cleanup() {
      disposeOffscreen?.();
    },
  };
}

function createScriptingHarness() {
  const worlds = new Map<string, Record<string, unknown>>();

  function getContext(tabId: number, world: string): Record<string, unknown> {
    const key = `${tabId}:${world}`;
    const existing = worlds.get(key);
    if (existing) {
      return existing;
    }
    const sandbox: Record<string, unknown> = {
      console,
      ...createDomSandbox(),
    };
    sandbox.globalThis = sandbox;
    worlds.set(key, sandbox);
    return sandbox;
  }

  return {
    chromeApi: {
      scripting: {
        executeScript: vi.fn(
          async (request: {
            target: { tabId: number };
            world?: string;
            files?: string[];
            func?: (...args: unknown[]) => unknown;
            args?: unknown[];
          }) => {
            const world = request.world ?? "ISOLATED";
            const context = getContext(request.target.tabId, world);

            if (request.files) {
              for (const file of request.files) {
                const source = readFileSync(resolveSourceFixturePath(file), "utf8");
                runInNewContext(source, context, {
                  filename: file,
                });
              }
            }

            if (request.func) {
              context.__bblArgs = request.args ?? [];
              const result = await Promise.resolve(
                runInNewContext(`(${request.func.toString()})(...globalThis.__bblArgs)`, context, {
                  filename: "executeScript.js",
                }),
              );
              context.__bblArgs = undefined;
              return [{ result }];
            }

            return [];
          },
        ),
      },
    },
  };
}

function createIntegratedChromeHarness(
  options: {
    host?: {
      dispatch: (request: unknown) => Promise<unknown>;
      getHealth: () => unknown;
    };
    createHost?: () => {
      dispatch: (request: unknown) => Promise<unknown>;
      getHealth: () => unknown;
    };
    autoRegisterOffscreen?: boolean;
    hangOffscreen?: boolean;
    activeTab?: {
      id: number;
      url: string;
      active?: boolean;
      title?: string;
    } | null;
  } = {},
) {
  const runtimeHarness = createChromeHarness(options);
  const scriptingHarness = createScriptingHarness();

  return {
    ...runtimeHarness,
    chromeApi: {
      ...runtimeHarness.chromeApi,
      scripting: scriptingHarness.chromeApi.scripting,
    },
  };
}

describe("mv3-shell manifest", () => {
  it("declares the MV3 offscreen-ready shell", () => {
    const hostPermissions = (manifest as { host_permissions?: string[] }).host_permissions ?? [];
    const webAccessibleResources =
      (manifest as { web_accessible_resources?: unknown[] }).web_accessible_resources ?? [];

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe("116");
    expect(manifest.permissions).toContain("offscreen");
    expect(manifest.permissions).toContain("activeTab");
    expect(hostPermissions).toEqual([]);
    expect(webAccessibleResources).toEqual([]);
    expect(manifest.background).toMatchObject({
      service_worker: "src/background.js",
      type: "module",
    });
    expect(manifest.side_panel).toMatchObject({
      default_path: "src/sidepanel.html",
    });
  });

  it("keeps the offscreen entry free of TypeScript source imports", () => {
    const source = readFileSync(new URL("../src/offscreen.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/\.ts["']/);
  });

  it("wires the offscreen entry to the workspace js-runner package", () => {
    const source = readFileSync(new URL("../src/offscreen.ts", import.meta.url), "utf8");

    expect(source).toMatch(/@bbl-next\/js-runner/);
    expect(source).not.toMatch(/\.\/runner-host-core\.js/);
  });

  it("creates the offscreen document once and uses the WORKERS reason", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });

    await expect(bridge.ensureHost()).resolves.toMatchObject({
      ok: true,
      data: {
        ready: true,
        bridge: {
          hostReady: true,
        },
      },
    });
    await expect(bridge.ensureHost()).resolves.toMatchObject({
      ok: true,
    });

    expect(harness.offscreenApi.createDocument).toHaveBeenCalledTimes(1);
    expect(harness.offscreenApi.createDocument).toHaveBeenCalledWith({
      url: RUNNER_OFFSCREEN_DOCUMENT_PATH,
      reasons: RUNNER_OFFSCREEN_REASONS,
      justification: expect.any(String),
    });
    harness.cleanup();
  });

  it("routes invoke and cancel through the offscreen host", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "invoke") {
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: true,
            result: {
              result: request.invocation.input,
              durationMs: 1,
            },
          };
        }
        if (request.kind === "cancel") {
          return {
            kind: "cancel_result",
            requestId: request.requestId,
            ok: true,
            targetRequestId: request.targetRequestId,
            cancelled: true,
          };
        }
        return {
          kind: "health_result",
          requestId: request.requestId,
          ok: true,
          health: {
            status: "idle",
            inflightCount: 0,
            consecutiveFailures: 0,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });

    await expect(
      bridge.invoke({
        module: {
          id: "demo",
          source: "exports.default = async () => 'ok';",
        },
        ctx: {},
        input: "payload",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        kind: "invoke_result",
        ok: true,
        result: {
          result: "payload",
        },
      },
    });
    await expect(bridge.cancel("req-123")).resolves.toMatchObject({
      ok: true,
      data: {
        kind: "cancel_result",
        cancelled: true,
        targetRequestId: "req-123",
      },
    });

    expect(host.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "invoke",
      }),
    );
    expect(host.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "cancel",
        targetRequestId: "req-123",
      }),
    );
    harness.cleanup();
  });

  it("exposes health through the background runtime bridge", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      sessionId: "session-audit-1",
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runner.health",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        kind: "health_result",
        ok: true,
        health: {
          status: "idle",
          inflightCount: 0,
        },
        bridge: {
          hostReady: true,
        },
      },
    });

    dispose();
    harness.cleanup();
  });

  it("exposes a healthy runtime diagnostics snapshot through the background bridge", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createChromeHarness({ host });
    const pageHookBridge = {
      snapshotState: vi.fn(async ({ tabId, world }: { tabId: number; world: string }) => ({
        tabId,
        world,
        installs: 1,
        invocations: 2,
      })),
    };
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      pageHookBridge,
    });
    const dispose = bridge.registerRuntimeListener();

    await bridge.ensureHost();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.diagnostics",
        tabId: 21,
        world: "main",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "healthy",
        kernel: {
          session: {
            id: expect.any(String),
            title: "mv3-shell runtime session",
          },
          run: {
            phase: "idle",
            queuedPrompts: {
              steer: 0,
              followUp: 0,
            },
          },
          loop: {
            stepCount: 0,
            maxSteps: 50,
          },
          interventions: {
            status: "empty",
            totalCount: 0,
            activeCount: 0,
          },
          provider: {
            route: {
              status: "empty",
            },
          },
        },
        bridge: {
          hostReady: true,
          offscreenPresent: true,
        },
        runner: {
          reachable: true,
          health: {
            status: "idle",
            inflightCount: 0,
          },
        },
        site: {
          status: "healthy",
          tabId: 21,
          world: "main",
          snapshot: {
            installs: 1,
            invocations: 2,
          },
        },
      },
    });

    expect(pageHookBridge.snapshotState).toHaveBeenCalledWith({
      tabId: 21,
      world: "main",
    });

    dispose();
    harness.cleanup();
  });

  it("routes runtime.capture_diagnostics through the public control plane without recovery side effects", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await bridge.ensureHost();
    const offscreenCreatesBefore = harness.offscreenApi.createDocument.mock.calls.length;
    const offscreenClosesBefore = harness.offscreenApi.closeDocument.mock.calls.length;

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.capture_diagnostics",
        tabId: 21,
        world: "main",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "healthy",
        kernel: {
          session: {
            id: expect.any(String),
          },
          provider: {
            route: {
              status: "empty",
            },
          },
        },
        bridge: {
          hostReady: true,
          offscreenPresent: true,
        },
        runner: {
          reachable: true,
          health: {
            status: "idle",
          },
        },
      },
    });

    expect(harness.offscreenApi.createDocument).toHaveBeenCalledTimes(offscreenCreatesBefore);
    expect(harness.offscreenApi.closeDocument).toHaveBeenCalledTimes(offscreenClosesBefore);
    dispose();
    harness.cleanup();
  });

  it("exposes a degraded runtime diagnostics snapshot without recovering the host", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "degraded",
              inflightCount: 0,
              consecutiveFailures: 2,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "degraded",
        inflightCount: 0,
        consecutiveFailures: 2,
      })),
    };
    const harness = createChromeHarness({ host });
    const pageHookBridge = {
      snapshotState: vi.fn(async () => {
        throw new Error("page hook unavailable");
      }),
    };
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      pageHookBridge,
    });

    await bridge.ensureHost();
    const offscreenCreatesBeforeDiagnostics = harness.offscreenApi.createDocument.mock.calls.length;
    const offscreenClosesBeforeDiagnostics = harness.offscreenApi.closeDocument.mock.calls.length;

    await expect(
      bridge.diagnostics({
        tabId: 21,
        world: "main",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "degraded",
        bridge: {
          hostReady: true,
          offscreenPresent: true,
        },
        runner: {
          reachable: true,
          health: {
            status: "degraded",
            consecutiveFailures: 2,
          },
        },
        site: {
          status: "degraded",
          error: {
            code: "E_RUNTIME",
            message: "page hook unavailable",
          },
        },
      },
    });

    expect(harness.offscreenApi.createDocument).toHaveBeenCalledTimes(
      offscreenCreatesBeforeDiagnostics,
    );
    expect(harness.offscreenApi.closeDocument).toHaveBeenCalledTimes(
      offscreenClosesBeforeDiagnostics,
    );
    harness.cleanup();
  });

  it("captures runtime error lifecycle in runtime.capture_diagnostics snapshots", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.capture_diagnostics",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "degraded",
        debug: {
          error: {
            status: "active",
            lastError: {
              code: "E_RUNTIME",
              message: "Offscreen document is not available",
              capturedAt: expect.any(String),
            },
            clearedAt: null,
          },
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.clear_error",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        cleared: true,
      },
    });

    await bridge.ensureHost();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.capture_diagnostics",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "healthy",
        debug: {
          error: {
            status: "cleared",
            lastError: null,
            clearedAt: expect.any(String),
          },
        },
      },
    });

    dispose();
    harness.cleanup();
  });

  it("consumes the kernel diagnostics facade for runtime.capture_diagnostics snapshots", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const captureDiagnostics = vi.fn(async () =>
      createKernelDiagnosticsSnapshot({
        session: {
          id: "session-loop-1",
        },
        run: {
          phase: "running",
          queuedPrompts: {
            steer: 1,
            followUp: 0,
          },
          retry: {
            active: true,
            attempt: 1,
            maxAttempts: 2,
          },
        },
        loop: {
          stepCount: 2,
          maxSteps: 50,
        },
        provider: {
          route: {
            status: "configured",
            profile: "default",
            provider: "openai_compatible",
            llmModel: "gpt-4.1-mini",
            orderedProfiles: ["default"],
          },
          registered: [
            {
              id: "openai_compatible",
              healthStatus: "healthy",
              capabilities: ["chat.completions"],
            },
          ],
        },
      }),
    );
    const runtimeServices = {
      ensureServices: vi.fn(async () => ({
        kernel: {
          captureDiagnostics,
        },
      })),
      ensureSession: vi.fn(async () => ({
        id: "session-loop-1",
        title: "mv3-shell runtime session",
        createdAt: "2026-04-09T03:20:00.000Z",
      })),
      getKernelRuntimeState: vi.fn(async () => ({
        session: {
          id: "session-loop-1",
          title: "mv3-shell runtime session",
          createdAt: "2026-04-09T03:20:00.000Z",
        },
        runState: {
          sessionId: "session-loop-1",
          phase: "running",
          retry: {
            active: true,
            attempt: 1,
            maxAttempts: 2,
          },
          queue: {
            steer: [
              {
                id: "qp-1",
                text: "continue loop",
                enqueuedAt: "2026-04-09T03:20:10.000Z",
              },
            ],
            followUp: [],
          },
        },
      })),
      getInterventionState: vi.fn(async () => {
        throw new Error("runtime.capture_diagnostics should use kernel.captureDiagnostics");
      }),
      listInterventions: vi.fn(async () => {
        throw new Error("runtime.capture_diagnostics should use kernel.captureDiagnostics");
      }),
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      runtimeServices,
    });
    const dispose = bridge.registerRuntimeListener();

    await bridge.ensureHost();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.capture_diagnostics",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "healthy",
        kernel: {
          session: {
            id: "session-loop-1",
          },
          run: {
            phase: "running",
            queuedPrompts: {
              steer: 1,
              followUp: 0,
            },
            retry: {
              active: true,
              attempt: 1,
              maxAttempts: 2,
            },
          },
          loop: {
            stepCount: 2,
            maxSteps: 50,
          },
          provider: {
            route: {
              status: "configured",
              profile: "default",
              provider: "openai_compatible",
            },
          },
        },
      },
    });

    expect(runtimeServices.ensureServices).toHaveBeenCalled();
    expect(runtimeServices.ensureSession).toHaveBeenCalled();
    expect(captureDiagnostics).toHaveBeenCalledWith("session-loop-1");
    expect(runtimeServices.getInterventionState).not.toHaveBeenCalled();
    expect(runtimeServices.listInterventions).not.toHaveBeenCalled();

    dispose();
    harness.cleanup();
  });

  it("exposes an empty runtime diagnostics snapshot when no page hook is installed", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createIntegratedChromeHarness({
      host,
    });
    const pageHookBridge = createPageHookBridge({
      chromeApi: harness.chromeApi,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      pageHookBridge,
    });

    await bridge.ensureHost();

    await expect(
      bridge.diagnostics({
        tabId: 21,
        world: "main",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "healthy",
        site: {
          status: "empty",
          tabId: 21,
          world: "main",
          snapshot: null,
        },
      },
    });

    harness.cleanup();
  });

  it("exposes a healthy bootstrap summary bundle through the background bridge", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createChromeHarness({
      host,
      activeTab: {
        id: 21,
        url: "https://x.com/home",
        title: "Home",
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      sessionId: "session-1",
      listSkills: async () => [
        {
          id: "skill.twitter",
          state: "enabled",
          trusted: true,
          recentChange: "skill.twitter enabled",
        },
        {
          id: "skill.notes",
          state: "disabled",
          trusted: false,
        },
      ],
    });
    const dispose = bridge.registerRuntimeListener();

    await bridge.ensureHost();
    const offscreenCreatesBeforeBootstrap = harness.offscreenApi.createDocument.mock.calls.length;

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.bootstrap",
        world: "main",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "healthy",
        resourceKeys: ["runtime", "config", "skills", "hosts"],
        runtime: {
          status: "healthy",
          mode: "active-tab-only",
          sessionId: "session-1",
          activeTab: {
            tabId: 21,
            url: "https://x.com/home",
            world: "main",
          },
          loopState: "idle",
        },
        skills: {
          status: "healthy",
          installedCount: 2,
          enabledCount: 1,
          trustedCount: 1,
        },
        hosts: {
          status: "healthy",
          defaultHostId: null,
          totalCount: 1,
          connectedCount: 1,
          items: [
            {
              hostId: "local",
              kind: "local",
              connected: true,
              state: "connected",
              isDefault: false,
            },
          ],
        },
        config: {
          status: "placeholder",
        },
      },
    });

    expect(harness.tabsApi.query).toHaveBeenCalledWith({
      active: true,
      lastFocusedWindow: true,
    });
    expect(harness.offscreenApi.createDocument).toHaveBeenCalledTimes(
      offscreenCreatesBeforeBootstrap,
    );
    dispose();
    harness.cleanup();
  });

  it("exposes a degraded bootstrap summary bundle when the local host is unhealthy", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "degraded",
              inflightCount: 0,
              consecutiveFailures: 2,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "degraded",
        inflightCount: 0,
        consecutiveFailures: 2,
      })),
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await bridge.ensureHost();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.bootstrap",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "degraded",
        runtime: {
          status: "degraded",
          loopState: "idle",
          lastError: null,
          sessionId: expect.any(String),
        },
        hosts: {
          status: "degraded",
          totalCount: 1,
          connectedCount: 1,
          defaultHostId: null,
          items: [
            {
              hostId: "local",
              connected: true,
              state: "degraded",
              isDefault: false,
            },
          ],
        },
      },
    });

    expect(harness.tabsApi.query).toHaveBeenCalledWith({
      active: true,
      lastFocusedWindow: true,
    });
    dispose();
    harness.cleanup();
  });

  it("exposes an empty bootstrap summary bundle before active runtime state exists", async () => {
    const harness = createChromeHarness({
      host: {
        dispatch: vi.fn(),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0,
        })),
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.bootstrap",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "empty",
        resourceKeys: ["runtime", "config", "skills", "hosts"],
        runtime: {
          status: "empty",
          sessionId: expect.any(String),
          loopState: "idle",
          activeTab: null,
        },
        skills: {
          status: "empty",
          installedCount: 0,
        },
        hosts: {
          status: "empty",
          defaultHostId: null,
          totalCount: 1,
          connectedCount: 0,
          items: [
            {
              hostId: "local",
              kind: "local",
              connected: false,
              state: "disconnected",
              isDefault: false,
            },
          ],
        },
        config: {
          status: "placeholder",
        },
      },
    });

    expect(harness.tabsApi.query).toHaveBeenCalledWith({
      active: true,
      lastFocusedWindow: true,
    });
    expect(harness.offscreenApi.createDocument).not.toHaveBeenCalled();
    dispose();
    harness.cleanup();
  });

  it("uses composed runtime services for bootstrap session state when sessionId is omitted", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const runtimeServices = {
      getKernelRuntimeState: vi.fn(async () => ({
        session: { id: "kernel-session" },
        runState: { phase: "paused" },
      })),
      invokeSiteSkill: vi.fn(),
    };
    const harness = createChromeHarness({
      host,
      activeTab: {
        id: 21,
        url: "https://x.com/home",
        title: "Home",
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      runtimeServices,
    });
    const dispose = bridge.registerRuntimeListener();

    await bridge.ensureHost();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.bootstrap",
        world: "main",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        runtime: {
          sessionId: "kernel-session",
          loopState: "paused",
        },
      },
    });

    expect(runtimeServices.getKernelRuntimeState).toHaveBeenCalledTimes(1);
    dispose();
    harness.cleanup();
  });

  it("delegates tabs routes through composed runtime services dispatch", async () => {
    const runtimeServices = {
      getKernelRuntimeState: vi.fn(async () => ({
        session: { id: "kernel-session" },
        runState: { phase: "idle" },
      })),
      dispatchCapability: vi.fn(
        async ({
          capabilityId,
          input,
        }: {
          capabilityId: string;
          input: { url?: string };
        }) =>
          capabilityId === "tabs.list"
            ? [
                {
                  tabId: 21,
                  url: "https://fixture.test/home",
                  active: true,
                  title: "Fixture Home",
                },
              ]
            : capabilityId === "tabs.get_active"
              ? {
                  tabId: 21,
                  url: "https://fixture.test/home",
                  active: true,
                  title: "Fixture Home",
                }
              : {
                  tabId: 21,
                  url: input.url,
                  active: true,
                  title: "Fixture Home",
                },
      ),
      invokeSiteSkill: vi.fn(),
    };
    const harness = createChromeHarness({
      activeTab: null,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      runtimeServices,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "tabs.list",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: [
        {
          tabId: 21,
          url: "https://fixture.test/home",
          active: true,
        },
      ],
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "tabs.get_active",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        tabId: 21,
        url: "https://fixture.test/home",
        active: true,
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "tabs.navigate",
        url: "https://fixture.test/settings",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        tabId: 21,
        url: "https://fixture.test/settings",
        active: true,
      },
    });

    expect(runtimeServices.dispatchCapability).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        capabilityId: "tabs.list",
        input: {},
      }),
    );
    expect(runtimeServices.dispatchCapability).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        capabilityId: "tabs.get_active",
        input: {},
      }),
    );
    expect(runtimeServices.dispatchCapability).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        capabilityId: "tabs.navigate",
        input: {
          url: "https://fixture.test/settings",
        },
      }),
    );
    expect(harness.tabsApi.query).not.toHaveBeenCalled();
    expect(harness.tabsApi.update).not.toHaveBeenCalled();

    dispose();
    harness.cleanup();
  });

  it("returns active tab metadata and navigates the active tab through the MV3 bridge", async () => {
    const harness = createChromeHarness({
      activeTab: {
        id: 21,
        url: "https://fixture.test/home",
        title: "Fixture Home",
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "tabs.list",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: [
        {
          tabId: 21,
          url: "https://fixture.test/home",
          active: true,
          title: "Fixture Home",
        },
      ],
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "tabs.get_active",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        tabId: 21,
        url: "https://fixture.test/home",
        active: true,
        title: "Fixture Home",
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "tabs.navigate",
        url: "https://fixture.test/settings",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        tabId: 21,
        url: "https://fixture.test/settings",
        active: true,
        title: "Fixture Home",
      },
    });

    expect(harness.tabsApi.update).toHaveBeenCalledWith(21, {
      url: "https://fixture.test/settings",
    });
    expect(harness.tabsApi.query).toHaveBeenCalledWith({});

    dispose();
    harness.cleanup();
  });

  it("delegates config.update through composed runtime services dispatch", async () => {
    const runtimeServices = {
      getKernelRuntimeState: vi.fn(async () => ({
        session: { id: "kernel-session" },
        runState: { phase: "idle" },
      })),
      dispatchCapability: vi.fn(async () => ({
        config: {
          status: "ready",
          fields: ["model", "automation", "permissions", "preferences"],
          values: {
            model: {
              provider: "openai",
            },
          },
          note: null,
          updatedAt: "2026-03-30T00:00:00.000Z",
        },
      })),
      invokeSiteSkill: vi.fn(),
    };
    const harness = createChromeHarness({});
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      runtimeServices,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "config.update",
        patch: {
          model: {
            provider: "openai",
          },
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        config: {
          status: "ready",
          values: {
            model: {
              provider: "openai",
            },
          },
        },
      },
    });

    expect(runtimeServices.dispatchCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityId: "config.update",
        input: {
          patch: {
            model: {
              provider: "openai",
            },
          },
        },
      }),
    );

    dispose();
    harness.cleanup();
  });

  it("rejects tabs.navigate when active tab metadata is unavailable", async () => {
    const harness = createChromeHarness({
      activeTab: null,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "tabs.navigate",
        url: "https://fixture.test/settings",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_BAD_INPUT",
        message: "tabs.navigate requires an active tab with url metadata",
      },
    });

    dispose();
    harness.cleanup();
  });

  it("routes page.press_key through the MV3 bridge and only injects on explicit invoke", async () => {
    const harness = createIntegratedChromeHarness({
      activeTab: {
        id: 11,
        url: "https://fixture.test/demo",
      },
      host: {
        dispatch: vi.fn(async (request) => {
          if (request.kind === "invoke") {
            return {
              kind: "invoke_result",
              requestId: request.requestId,
              ok: true,
              result: {
                result: request.invocation.input,
                durationMs: 1,
              },
            };
          }
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0,
        })),
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.diagnostics",
        tabId: 11,
        world: "main",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        site: {
          status: "empty",
          tabId: 11,
          world: "main",
          snapshot: null,
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "page.press_key",
        key: "Enter",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        ok: true,
        action: "press_key",
        key: "Enter",
        installationId: "bbl-next.page-hook.page:1",
        installedScriptId: "bbl-next.page-hook.page",
        dispatchCount: 2,
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.diagnostics",
        tabId: 11,
        world: "main",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        site: {
          status: "healthy",
          tabId: 11,
          world: "main",
          snapshot: {
            installs: [
              expect.objectContaining({
                installationId: "bbl-next.page-hook.page:1",
              }),
            ],
            invocations: [
              expect.objectContaining({
                action: "press_key",
                key: "Enter",
              }),
            ],
            verifications: [
              {
                action: "press_key",
                verified: true,
              },
            ],
            keyEvents: [
              expect.objectContaining({
                type: "keydown",
                key: "Enter",
              }),
              expect.objectContaining({
                type: "keyup",
                key: "Enter",
              }),
            ],
          },
        },
      },
    });

    dispose();
    harness.cleanup();
  });

  it("routes page.press_key through kernel-owned runner and site steps in runtime services", async () => {
    const harness = createIntegratedChromeHarness({
      activeTab: {
        id: 11,
        url: "https://fixture.test/demo",
      },
    });
    const invokeRunner = vi.fn(async (invocation: { input: { key: string } }) => ({
      ok: true,
      data: {
        ok: true,
        result: {
          result: invocation.input,
          durationMs: 1,
        },
      },
    }));
    const services = createBackgroundRuntimeServices({
      chromeApi: harness.chromeApi,
      invokeRunner,
      pageHookBridge: createPageHookBridge({
        chromeApi: harness.chromeApi,
      }),
    });

    const result = await services.invokePageAction({
      action: "press_key",
      input: {
        key: "Enter",
      },
    });
    const [{ kernel }, session] = await Promise.all([
      services.ensureServices(),
      services.ensureSession(),
    ]);

    expect(result).toMatchObject({
      verified: true,
      result: {
        ok: true,
        action: "press_key",
        key: "Enter",
        installationId: "bbl-next.page-hook.page:1",
        installedScriptId: "bbl-next.page-hook.page",
        dispatchCount: 2,
      },
    });
    expect(invokeRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        module: expect.objectContaining({
          id: "bbl.page.press_key",
        }),
        input: {
          key: "Enter",
        },
      }),
    );
    expect(kernel.getStepCount(session.id)).toBe(2);
    expect(kernel.getRunState(session.id).phase).toBe("paused");

    harness.cleanup();
  });

  it("delegates page.press_key through composed runtime services", async () => {
    const runtimeServices = {
      getKernelRuntimeState: vi.fn(async () => ({
        session: { id: "kernel-session" },
        runState: { phase: "idle" },
      })),
      invokePageAction: vi.fn(async () => ({
        result: {
          ok: true,
          via: "services",
        },
        verified: true,
        trace: ["invoke:press_key"],
      })),
      invokeSiteSkill: vi.fn(),
    };
    const harness = createChromeHarness({
      activeTab: null,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      runtimeServices,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "page.press_key",
        key: "Enter",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        ok: true,
        via: "services",
      },
    });

    expect(runtimeServices.invokePageAction).toHaveBeenCalledWith({
      action: "press_key",
      input: {
        key: "Enter",
      },
    });
    expect(harness.tabsApi.query).not.toHaveBeenCalled();
    expect(harness.offscreenApi.createDocument).not.toHaveBeenCalled();

    dispose();
    harness.cleanup();
  });

  it("captures a screenshot through composed runtime services", async () => {
    const runtimeServices = {
      getKernelRuntimeState: vi.fn(async () => ({
        session: { id: "kernel-session" },
        runState: { phase: "idle" },
      })),
      invokePageAction: vi.fn(async () => ({
        result: {
          format: "png",
          dataUrl: "data:image/png;base64,fixture",
        },
        verified: true,
        trace: ["invoke:screenshot"],
      })),
      invokeSiteSkill: vi.fn(),
    };
    const harness = createChromeHarness({
      activeTab: null,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      runtimeServices,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "page.screenshot",
        format: "png",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        format: "png",
        dataUrl: "data:image/png;base64,fixture",
      },
    });

    expect(runtimeServices.invokePageAction).toHaveBeenCalledWith({
      action: "screenshot",
      input: {
        format: "png",
        quality: undefined,
      },
    });
    expect(harness.tabsApi.query).not.toHaveBeenCalled();
    expect(harness.tabsApi.captureVisibleTab).not.toHaveBeenCalled();

    dispose();
    harness.cleanup();
  });

  it("rejects page.press_key when active tab metadata is unavailable", async () => {
    const harness = createIntegratedChromeHarness({
      activeTab: null,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "page.press_key",
        key: "Enter",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_BAD_INPUT",
        message: "page.press_key requires an active tab with url metadata",
      },
    });

    dispose();
    harness.cleanup();
  });

  it("captures a screenshot of the active tab through runtime services", async () => {
    const harness = createIntegratedChromeHarness({
      activeTab: {
        id: 21,
        url: "https://fixture.test/home",
        title: "Fixture Home",
      },
    });
    const services = createBackgroundRuntimeServices({
      chromeApi: harness.chromeApi,
    });

    await expect(
      services.invokePageAction({
        action: "screenshot",
        input: {
          format: "jpeg",
          quality: 80,
        },
      }),
    ).resolves.toMatchObject({
      verified: true,
      result: {
        format: "jpeg",
        dataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
      },
      trace: ["invoke:screenshot"],
    });

    expect(harness.tabsApi.captureVisibleTab).toHaveBeenCalledWith(undefined, {
      format: "jpeg",
      quality: 80,
    });

    harness.cleanup();
  });

  it("captures a screenshot of the active tab through the MV3 bridge", async () => {
    const harness = createChromeHarness({
      activeTab: {
        id: 21,
        url: "https://fixture.test/home",
        title: "Fixture Home",
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "page.screenshot",
        format: "jpeg",
        quality: 80,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        format: "jpeg",
        dataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
      },
    });

    expect(harness.tabsApi.captureVisibleTab).toHaveBeenCalledWith(undefined, {
      format: "jpeg",
      quality: 80,
    });

    dispose();
    harness.cleanup();
  });

  it("rejects page.screenshot when active tab metadata is unavailable", async () => {
    const harness = createIntegratedChromeHarness({
      activeTab: null,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "page.screenshot",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_BAD_INPUT",
        message: "page.screenshot requires an active tab with url metadata",
      },
    });

    dispose();
    harness.cleanup();
  });

  it("rejects page.screenshot when captureVisibleTab is unavailable", async () => {
    const harness = createIntegratedChromeHarness({
      activeTab: {
        id: 21,
        url: "https://fixture.test/home",
      },
    });
    (harness.chromeApi.tabs as { captureVisibleTab?: unknown }).captureVisibleTab = undefined;
    const services = createBackgroundRuntimeServices({
      chromeApi: harness.chromeApi,
    });

    await expect(
      services.invokePageAction({
        action: "screenshot",
      }),
    ).rejects.toMatchObject({
      code: "E_RUNTIME",
      message: "chrome.tabs.captureVisibleTab is required for page.screenshot",
    });

    harness.cleanup();
  });

  it("mv3 gate: tabs.navigate invalid input does not crash the bridge", async () => {
    const harness = createChromeHarness({
      activeTab: {
        id: 21,
        url: "https://fixture.test/home",
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "tabs.navigate",
        url: "",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_BAD_INPUT",
        message: "tabs.navigate requires a non-empty url",
      },
    });

    dispose();
    harness.cleanup();
  });

  it("mv3 gate: page.screenshot invalid request does not crash the bridge", async () => {
    const harness = createChromeHarness({
      activeTab: {
        id: 21,
        url: "https://fixture.test/home",
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "page.screenshot",
        format: "gif",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_BAD_INPUT",
        message: "page.screenshot format must be png or jpeg",
      },
    });

    dispose();
    harness.cleanup();
  });

  it("updates config via config.update and keeps runtime.bootstrap in sync", async () => {
    const harness = createChromeHarness({
      host: {
        dispatch: vi.fn(),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0,
        })),
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "config.update",
        patch: {
          model: {
            provider: "openai",
            defaultModel: "gpt-5.4",
          },
          automation: {
            activeTabOnly: true,
          },
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        config: {
          status: "ready",
          fields: ["model", "automation", "permissions", "preferences"],
          values: {
            model: {
              provider: "openai",
              defaultModel: "gpt-5.4",
            },
            automation: {
              activeTabOnly: true,
            },
          },
          note: null,
          updatedAt: expect.any(String),
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.bootstrap",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        config: {
          status: "ready",
          fields: ["model", "automation", "permissions", "preferences"],
          values: {
            model: {
              provider: "openai",
              defaultModel: "gpt-5.4",
            },
            automation: {
              activeTabOnly: true,
            },
          },
          note: null,
          updatedAt: expect.any(String),
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "config.update",
        patch: {
          unknown: {
            enabled: true,
          },
        },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_BAD_INPUT",
      },
    });

    dispose();
    harness.cleanup();
  });

  it("writes config and skills lifecycle changes into a unified audit.tail resource", async () => {
    const harness = createChromeHarness({
      host: {
        dispatch: vi.fn(),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0,
        })),
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "config.update",
        patch: {
          model: {
            provider: "openai",
          },
          automation: {
            activeTabOnly: true,
          },
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        config: {
          status: "ready",
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "skills.install",
        skillId: "skill.demo",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        skill: {
          skillId: "skill.demo",
          status: "installed",
          trusted: false,
          recentChange: "skills.install",
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "skills.enable",
        skillId: "skill.demo",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        skill: {
          skillId: "skill.demo",
          status: "enabled",
          trusted: false,
          recentChange: "skills.enable",
        },
      },
    });

    const auditResult = (await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "audit.tail",
    })) as {
      ok: boolean;
      data: {
        id: string;
        primitive: string;
        generatedAt: string;
        data: {
          status: string;
          totalCount: number;
          entries: Array<{
            timestamp: string;
            sessionId: string | null;
            kind: string;
            status: string;
            changedFields?: string[];
            skillId?: string;
            trusted?: boolean;
          }>;
        };
      };
    };

    expect(auditResult.ok).toBe(true);
    expect(auditResult.data.id).toBe("audit.tail");
    expect(auditResult.data.primitive).toBe("resource");
    expect(auditResult.data.data.totalCount).toBe(3);
    expect(auditResult.data.data.entries.map((entry) => entry.kind)).toEqual([
      "config.update",
      "skills.install",
      "skills.enable",
    ]);
    expect(auditResult.data.data.entries[0]).toMatchObject({
      kind: "config.update",
      status: "updated",
      changedFields: ["model", "automation"],
    });
    expect(auditResult.data.data.entries[1]).toMatchObject({
      kind: "skills.install",
      skillId: "skill.demo",
      status: "installed",
      trusted: false,
    });
    expect(auditResult.data.data.entries[2]).toMatchObject({
      kind: "skills.enable",
      skillId: "skill.demo",
      status: "enabled",
      trusted: false,
    });

    const sessionIds = auditResult.data.data.entries.map((entry) => entry.sessionId);
    expect(sessionIds.every((value) => typeof value === "string" && value.length > 0)).toBe(true);
    expect(new Set(sessionIds).size).toBe(1);
    expect(
      auditResult.data.data.entries[0]?.timestamp <= auditResult.data.data.entries[1]?.timestamp,
    ).toBe(true);
    expect(
      auditResult.data.data.entries[1]?.timestamp <= auditResult.data.data.entries[2]?.timestamp,
    ).toBe(true);

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.bootstrap",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        runtime: {
          sessionId: auditResult.data.data.entries[0]?.sessionId,
        },
        skills: {
          status: "healthy",
          installedCount: 1,
          enabledCount: 1,
          trustedCount: 0,
          recentChange: "skills.enable",
        },
      },
    });

    dispose();
    harness.cleanup();
  });

  it("reads summary and audit resources through the unified resource.read path", async () => {
    const harness = createChromeHarness({
      host: {
        dispatch: vi.fn(async (request) => {
          if (request.kind === "health") {
            return {
              kind: "health_result",
              requestId: request.requestId,
              ok: true,
              health: {
                status: "idle",
                inflightCount: 0,
                consecutiveFailures: 0,
              },
            };
          }
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: true,
            result: { result: "ok", durationMs: 1 },
          };
        }),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0,
        })),
      },
      activeTab: {
        id: 11,
        url: "https://fixture.test/resource",
        title: "Resource Fixture",
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      sessionId: "session-resource-1",
    });
    const dispose = bridge.registerRuntimeListener();

    await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "hosts.connect",
      hostId: "local",
    });
    await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "hosts.set_default",
      hostId: "local",
    });
    await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "config.update",
      patch: {
        model: {
          provider: "openai",
        },
      },
    });
    await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "skills.install",
      skillId: "skill.resource",
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "resource.read",
        resourceId: "runtime.summary",
        world: "main",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: "runtime.summary",
        primitive: "resource",
        data: {
          sessionId: "session-resource-1",
          activeTab: {
            tabId: 11,
            url: "https://fixture.test/resource",
            world: "main",
          },
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "resource.read",
        resourceId: "config.summary",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: "config.summary",
        data: {
          status: "ready",
          values: {
            model: {
              provider: "openai",
            },
          },
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "resource.read",
        resourceId: "skills.summary",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: "skills.summary",
        data: {
          installedCount: 1,
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "resource.read",
        resourceId: "hosts.summary",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: "hosts.summary",
        data: {
          defaultHostId: "local",
          connectedCount: 1,
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "resource.read",
        resourceId: "audit.tail",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: "audit.tail",
        primitive: "resource",
        data: {
          entries: expect.arrayContaining([
            expect.objectContaining({
              kind: "hosts.connect",
              sessionId: "session-resource-1",
            }),
            expect.objectContaining({
              kind: "config.update",
              sessionId: "session-resource-1",
            }),
            expect.objectContaining({
              kind: "skills.install",
              sessionId: "session-resource-1",
            }),
          ]),
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "resource.read",
        resourceId: "missing.summary",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_BAD_INPUT",
      },
    });

    dispose();
    harness.cleanup();
  });

  it("exports sidepanel management guard helpers for future UI consumers", () => {
    expect(isSidepanelManagementResourceId("runtime.summary")).toBe(true);
    expect(isSidepanelManagementResourceId("runtime.bootstrap")).toBe(false);
    expect(isSidepanelManagementActionKind("skills.install")).toBe(true);
    expect(isSidepanelManagementActionKind("runtime.chat.send")).toBe(false);
  });

  it("locks sidepanel management to shared AI-surface resources and control-plane actions", async () => {
    expect(SIDEPANEL_MANAGEMENT_RESOURCE_IDS).toEqual([
      "runtime.summary",
      "config.summary",
      "skills.summary",
      "hosts.summary",
    ]);
    expect(SIDEPANEL_MANAGEMENT_ACTION_KINDS).toEqual([
      "runtime.capture_diagnostics",
      "runtime.clear_error",
      "config.update",
      "intervention.resolve",
      "intervention.cancel",
      "skills.install",
      "skills.enable",
      "skills.disable",
      "skills.uninstall",
      "hosts.connect",
      "hosts.disconnect",
      "hosts.set_default",
    ]);
    expect(SIDEPANEL_MANAGEMENT_RESOURCE_IDS).not.toContain("runtime.bootstrap");
    expect(SIDEPANEL_MANAGEMENT_ACTION_KINDS).not.toContain("runtime.bootstrap");

    const harness = createChromeHarness({
      activeTab: {
        id: 31,
        url: "https://fixture.test/management",
        title: "Management fixture",
      },
      host: {
        dispatch: vi.fn(),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0,
        })),
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "config.update",
        patch: {
          model: {
            provider: "openai",
          },
        },
      }),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "skills.install",
        skillId: "skill.management",
      }),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "skills.enable",
        skillId: "skill.management",
      }),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.connect",
        hostId: "local",
      }),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.set_default",
        hostId: "local",
      }),
    ).resolves.toMatchObject({ ok: true });

    for (const resourceId of SIDEPANEL_MANAGEMENT_RESOURCE_IDS) {
      await expect(
        harness.runtimeApi.sendMessage({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "resource.read",
          resourceId,
          world: "main",
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          id: resourceId,
          primitive: "resource",
        },
      });
    }

    dispose();
    harness.cleanup();
  });

  it("lists and gets the local host without auto-connecting it", async () => {
    const harness = createChromeHarness({
      host: {
        dispatch: vi.fn(),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0,
        })),
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.list",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        defaultHostId: null,
        items: [
          {
            hostId: "local",
            kind: "local",
            connected: false,
            state: "disconnected",
            isDefault: false,
          },
        ],
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.get",
        hostId: "local",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "local",
        kind: "local",
        connected: false,
        state: "disconnected",
        isDefault: false,
      },
    });

    expect(harness.offscreenApi.createDocument).not.toHaveBeenCalled();
    dispose();
    harness.cleanup();
  });

  it("lists and gets the remote host as a first-class record when remote transport is configured", async () => {
    const harness = createChromeHarness({});
    const sendRemoteExec = vi.fn();
    const remoteTransport = createRemoteHostTransport({
      sendExec: sendRemoteExec,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      remoteTransport,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.list",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        defaultHostId: null,
        items: expect.arrayContaining([
          expect.objectContaining({
            hostId: "local",
            kind: "local",
            connected: false,
            state: "disconnected",
            isDefault: false,
          }),
          expect.objectContaining({
            hostId: "remote",
            kind: "remote",
            connected: false,
            state: "disconnected",
            isDefault: false,
          }),
        ]),
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.get",
        hostId: "remote",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "remote",
        kind: "remote",
        connected: false,
        state: "disconnected",
        isDefault: false,
      },
    });

    expect(harness.offscreenApi.createDocument).not.toHaveBeenCalled();
    expect(sendRemoteExec).not.toHaveBeenCalled();
    dispose();
    harness.cleanup();
  });

  it("surfaces a degraded remote host when the configured remote transport is unavailable", async () => {
    const harness = createChromeHarness({});
    const sendRemoteExec = vi.fn();
    const probeHandler = vi.fn(async () => ({
      status: "healthy",
    }));
    const availability = vi.fn(async ({ action }: { action: string }) => ({
      available: false,
      error: {
        code: "E_REMOTE_UNAVAILABLE",
        message: "transport offline",
        details: {
          action,
        },
      },
    }));
    const remoteTransport = createRemoteHostTransport({
      sendExec: sendRemoteExec,
      sendProbe: probeHandler,
      availability,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      remoteTransport,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.list",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        items: expect.arrayContaining([
          expect.objectContaining({
            hostId: "remote",
            kind: "remote",
            connected: false,
            state: "degraded",
            error: {
              code: "E_REMOTE_UNAVAILABLE",
              message: "transport offline",
              details: {
                action: "hosts.list",
                kind: "transport",
                hostId: "remote",
                reason: "transport_unavailable",
              },
            },
          }),
        ]),
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.get",
        hostId: "remote",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "remote",
        connected: false,
        state: "degraded",
        error: {
          code: "E_REMOTE_UNAVAILABLE",
          message: "transport offline",
          details: {
            action: "hosts.get",
            kind: "transport",
            hostId: "remote",
            reason: "transport_unavailable",
          },
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.connect",
        hostId: "remote",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_REMOTE_UNAVAILABLE",
        message: "transport offline",
        details: {
          action: "hosts.connect",
          kind: "transport",
          hostId: "remote",
          reason: "transport_unavailable",
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "host.exec",
        hostId: "remote",
        command: "pwd",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_REMOTE_UNAVAILABLE",
        message: "transport offline",
        details: {
          action: "host.exec",
          kind: "transport",
          hostId: "remote",
          reason: "transport_unavailable",
        },
      },
    });

    expect(availability).toHaveBeenCalledTimes(4);
    expect(sendRemoteExec).not.toHaveBeenCalled();
    expect(probeHandler).not.toHaveBeenCalled();
    dispose();
    harness.cleanup();
  });

  it("config.update configures a fetch-backed remote transport and keeps config.summary sanitized", async () => {
    const storageArea = createStorageAreaHarness();
    const harness = createChromeHarness({
      storageArea,
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input, _init) => {
      const url = String(input);
      if (url === "https://remote.example.test/health") {
        return new Response(
          JSON.stringify({
            status: "healthy",
            checkedAt: "2026-04-15T14:10:00.000Z",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url === "https://remote.example.test/exec") {
        return new Response(
          JSON.stringify({
            hostId: "remote",
            exitCode: 0,
            stdout: "remote:pwd",
            stderr: "",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    });

    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    try {
      await expect(
        harness.runtimeApi.sendMessage({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "config.update",
          patch: {
            automation: {
              remoteTransport: {
                baseUrl: "https://remote.example.test",
                execPath: "/exec",
                probePath: "/health",
                authToken: "secret-token",
              },
            },
          },
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          config: {
            status: "ready",
            values: {
              automation: {
                remoteTransport: {
                  baseUrl: "https://remote.example.test",
                  execPath: "/exec",
                  probePath: "/health",
                  authScheme: "bearer",
                },
              },
            },
          },
        },
      });

      await expect(
        harness.runtimeApi.sendMessage({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "hosts.connect",
          hostId: "remote",
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          defaultHostId: "remote",
          host: {
            hostId: "remote",
            connected: true,
            state: "connected",
            health: {
              status: "healthy",
            },
          },
        },
      });

      await expect(
        harness.runtimeApi.sendMessage({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "host.exec",
          command: "pwd",
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          hostId: "remote",
          exitCode: 0,
          stdout: "remote:pwd",
        },
      });

      await expect(
        harness.runtimeApi.sendMessage({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "resource.read",
          resourceId: "config.summary",
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          data: {
            values: {
              automation: {
                remoteTransport: {
                  baseUrl: "https://remote.example.test",
                  execPath: "/exec",
                  probePath: "/health",
                  authScheme: "bearer",
                },
              },
            },
          },
        },
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://remote.example.test/health",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer secret-token",
          }),
        }),
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://remote.example.test/exec",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer secret-token",
          }),
        }),
      );
      expect(
        JSON.stringify(storageArea.dump()["bbl-next.config.control-plane.v1"] ?? {}),
      ).not.toContain("secret-token");
      expect(storageArea.dump()["bbl-next.remote-transport.config.v1"]).toMatchObject({
        baseUrl: "https://remote.example.test",
        execPath: "/exec",
        probePath: "/health",
        authToken: "secret-token",
      });
    } finally {
      dispose();
      harness.cleanup();
      globalThis.fetch = originalFetch;
    }
  });

  it("does not persist remote transport config when config.update fails full patch validation", async () => {
    const storageArea = createStorageAreaHarness();
    const harness = createChromeHarness({
      storageArea,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    try {
      await expect(
        harness.runtimeApi.sendMessage({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "config.update",
          patch: {
            automation: {
              remoteTransport: {
                baseUrl: "https://remote.example.test",
                authToken: "secret-token",
              },
            },
            unknown: {
              enabled: true,
            },
          },
        }),
      ).resolves.toMatchObject({
        ok: false,
        error: {
          code: "E_BAD_INPUT",
          message: "config.update does not support field: unknown",
        },
      });

      expect(storageArea.dump()["bbl-next.remote-transport.config.v1"]).toBeUndefined();
    } finally {
      dispose();
      harness.cleanup();
    }
  });

  it("rejects remote transport baseUrl values that include username or password", async () => {
    const storageArea = createStorageAreaHarness();
    const harness = createChromeHarness({
      storageArea,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    try {
      await expect(
        harness.runtimeApi.sendMessage({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "config.update",
          patch: {
            automation: {
              remoteTransport: {
                baseUrl: "https://user:pass@remote.example.test",
              },
            },
          },
        }),
      ).resolves.toMatchObject({
        ok: false,
        error: {
          code: "E_BAD_INPUT",
          message:
            "config.update automation.remoteTransport.baseUrl must not include username or password",
        },
      });

      expect(storageArea.dump()["bbl-next.remote-transport.config.v1"]).toBeUndefined();
    } finally {
      dispose();
      harness.cleanup();
    }
  });

  it("rehydrates the configured remote transport after bridge restart", async () => {
    const storageArea = createStorageAreaHarness();
    const firstHarness = createChromeHarness({
      storageArea,
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === "https://remote.example.test/health") {
        return new Response(
          JSON.stringify({
            status: "healthy",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url === "https://remote.example.test/exec") {
        return new Response(
          JSON.stringify({
            hostId: "remote",
            exitCode: 0,
            stdout: "remote:echo ready",
            stderr: "",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    });

    const firstBridge = createBackgroundRunnerBridge({
      chromeApi: firstHarness.chromeApi,
      timeoutMs: 50,
    });
    const disposeFirst = firstBridge.registerRuntimeListener();

    try {
      await firstHarness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "config.update",
        patch: {
          automation: {
            remoteTransport: {
              baseUrl: "https://remote.example.test",
              authToken: "persisted-secret",
            },
          },
        },
      });
    } finally {
      disposeFirst();
      firstHarness.cleanup();
    }

    const secondHarness = createChromeHarness({
      storageArea,
    });
    const secondBridge = createBackgroundRunnerBridge({
      chromeApi: secondHarness.chromeApi,
      timeoutMs: 50,
    });
    const disposeSecond = secondBridge.registerRuntimeListener();

    try {
      await expect(
        secondHarness.runtimeApi.sendMessage({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "hosts.list",
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          items: expect.arrayContaining([
            expect.objectContaining({
              hostId: "remote",
              kind: "remote",
            }),
          ]),
        },
      });

      await secondHarness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.connect",
        hostId: "remote",
      });

      await expect(
        secondHarness.runtimeApi.sendMessage({
          target: RUNNER_BACKGROUND_TARGET,
          kind: "host.exec",
          command: "echo ready",
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          hostId: "remote",
          stdout: "remote:echo ready",
        },
      });
    } finally {
      disposeSecond();
      secondHarness.cleanup();
      globalThis.fetch = originalFetch;
    }
  });

  it("routes host substrate read/write/edit/exec through an explicit local host id", async () => {
    const files = new Map<string, string>();
    const host = {
      dispatch: vi.fn(async (request: unknown) => {
        const typedRequest = request as {
          kind: string;
          requestId?: string;
          hostId?: string;
          path?: string;
          content?: string;
          patch?: string;
          command?: string;
        };
        switch (typedRequest.kind) {
          case "health":
            return {
              kind: "health_result",
              requestId: typedRequest.requestId,
              ok: true,
              health: {
                status: "idle",
                inflightCount: 0,
                consecutiveFailures: 0,
              },
            };
          case "read":
            return {
              hostId: typedRequest.hostId,
              path: typedRequest.path,
              content: files.get(typedRequest.path!) ?? null,
            };
          case "write":
            files.set(typedRequest.path!, typedRequest.content ?? "");
            return {
              hostId: typedRequest.hostId,
              path: typedRequest.path,
              content: typedRequest.content,
            };
          case "edit": {
            const next = `${files.get(typedRequest.path!) ?? ""}${typedRequest.patch ?? ""}`;
            files.set(typedRequest.path!, next);
            return {
              hostId: typedRequest.hostId,
              path: typedRequest.path,
              content: next,
            };
          }
          case "exec":
            return {
              hostId: typedRequest.hostId,
              command: typedRequest.command,
              exitCode: 0,
              stdout: `executed:${typedRequest.command}`,
              stderr: "",
            };
          default:
            return {
              ok: false,
              error: {
                code: "E_RUNTIME",
                message: `Unknown host request: ${typedRequest.kind}`,
              },
            };
        }
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "host.write",
        hostId: "local",
        path: "/workspace/notes.txt",
        content: "hello",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "local",
        path: "/workspace/notes.txt",
        content: "hello",
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "host.read",
        hostId: "local",
        path: "/workspace/notes.txt",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "local",
        path: "/workspace/notes.txt",
        content: "hello",
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "host.edit",
        hostId: "local",
        path: "/workspace/notes.txt",
        patch: "\nworld",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "local",
        path: "/workspace/notes.txt",
        content: "hello\nworld",
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "host.exec",
        hostId: "local",
        command: "echo hi",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "local",
        command: "echo hi",
        exitCode: 0,
        stdout: "executed:echo hi",
      },
    });

    dispose();
    harness.cleanup();
  });

  it("routes host substrate requests through the default host when hostId is omitted", async () => {
    const host = {
      dispatch: vi.fn(async (request: unknown) => {
        const typedRequest = request as {
          kind: string;
          requestId?: string;
          hostId?: string;
          command?: string;
        };
        if (typedRequest.kind === "health") {
          return {
            kind: "health_result",
            requestId: typedRequest.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }
        if (typedRequest.kind === "exec") {
          return {
            hostId: typedRequest.hostId,
            command: typedRequest.command,
            exitCode: 0,
            stdout: `default:${typedRequest.command}`,
            stderr: "",
          };
        }
        return {
          ok: false,
          error: {
            code: "E_RUNTIME",
            message: `Unknown host request: ${typedRequest.kind}`,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "host.exec",
        command: "pwd",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_BAD_INPUT",
        message: "host.exec requires hostId or a default host",
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.set_default",
        hostId: "local",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        defaultHostId: "local",
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "host.exec",
        command: "pwd",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "local",
        command: "pwd",
        exitCode: 0,
        stdout: "default:pwd",
      },
    });

    dispose();
    harness.cleanup();
  });

  it("default offscreen host with local adapter supports read/write/edit and rejects exec", async () => {
    const harness = createChromeHarness({});
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.set_default",
        hostId: "local",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        defaultHostId: "local",
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "host.write",
        path: "/workspace/demo.txt",
        content: "hello from local adapter",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "local",
        path: "/workspace/demo.txt",
        content: "hello from local adapter",
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "host.read",
        path: "/workspace/demo.txt",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "local",
        path: "/workspace/demo.txt",
        content: "hello from local adapter",
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "host.edit",
        path: "/workspace/demo.txt",
        patch: " world",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "local",
        path: "/workspace/demo.txt",
        content: "hello from local adapter world",
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "host.exec",
        command: "pwd",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_CAPABILITY_NOT_FOUND",
        message: "Execution host adapter does not implement exec",
        details: {
          kind: "exec",
          hostId: "local",
          reason: "operation_not_supported",
        },
      },
    });

    expect(harness.offscreenApi.createDocument).toHaveBeenCalledTimes(1);
    dispose();
    harness.cleanup();
  });

  it("background bridge routes exec through the remote host transport and keeps local exec unsupported", async () => {
    const harness = createChromeHarness({});
    const sendRemoteExec = vi.fn(
      async (request: { hostId: string; command: string; timeoutMs?: number }) => ({
        hostId: request.hostId,
        command: request.command,
        exitCode: 0,
        stdout: `remote:${request.command}`,
        stderr: "",
      }),
    );
    const remoteTransport = createRemoteHostTransport({
      sendExec: sendRemoteExec,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      remoteTransport,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.set_default",
        hostId: "remote",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        defaultHostId: "remote",
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "host.exec",
        command: "pwd",
        timeoutMs: 123,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "remote",
        command: "pwd",
        exitCode: 0,
        stdout: "remote:pwd",
        stderr: "",
      },
    });

    expect(sendRemoteExec).toHaveBeenCalledTimes(1);
    expect(sendRemoteExec).toHaveBeenCalledWith(
      expect.objectContaining({
        hostId: "remote",
        command: "pwd",
        timeoutMs: 123,
      }),
    );
    expect(harness.offscreenApi.createDocument).not.toHaveBeenCalled();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "host.exec",
        hostId: "local",
        command: "pwd",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_CAPABILITY_NOT_FOUND",
        message: "Execution host adapter does not implement exec",
        details: {
          kind: "exec",
          hostId: "local",
          reason: "operation_not_supported",
        },
      },
    });

    dispose();
    harness.cleanup();
  });

  it("offscreen bridge keeps local file ops local and only routes exec for the remote host", async () => {
    const messageBus = createMessageBus();
    const runtimeApi = {
      ...messageBus,
      sendMessage: vi.fn((msg: unknown) => messageBus.sendMessage(msg)),
      onInstalled: { addListener: vi.fn() },
      getURL: (p: string) => `chrome-extension://test/${p}`,
      getContexts: async () => [],
    };

    const remoteExecHandler = vi.fn(async (request: { hostId: string; command: string }) => ({
      hostId: request.hostId,
      command: request.command,
      exitCode: 0,
      stdout: `remote:${request.command}`,
      stderr: "",
    }));

    const remoteHostAdapter = createRemoteExecAdapter(remoteExecHandler);

    const bridge = createOffscreenRunnerBridge({
      runtimeApi,
      remoteHostAdapter,
    });
    const dispose = bridge.registerRuntimeListener();

    const write = await bridge.handleMessage({
      target: "bbl-next.runner.offscreen",
      kind: "host.write",
      requestId: "w1",
      hostId: "local",
      path: "/workspace/test.txt",
      content: "hello",
    });
    expect(write).toMatchObject({
      ok: true,
      data: { path: "/workspace/test.txt", content: "hello" },
    });

    const read = await bridge.handleMessage({
      target: "bbl-next.runner.offscreen",
      kind: "host.read",
      requestId: "r1",
      hostId: "local",
      path: "/workspace/test.txt",
    });
    expect(read).toMatchObject({
      ok: true,
      data: { path: "/workspace/test.txt", content: "hello" },
    });

    const exec = await bridge.handleMessage({
      target: "bbl-next.runner.offscreen",
      kind: "host.exec",
      requestId: "x1",
      hostId: "remote",
      command: "pwd",
    });
    expect(exec).toMatchObject({
      ok: true,
      data: { hostId: "remote", command: "pwd", exitCode: 0, stdout: "remote:pwd" },
    });
    expect(remoteExecHandler).toHaveBeenCalledTimes(1);
    expect(remoteExecHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        hostId: "remote",
        command: "pwd",
      }),
    );

    const localExec = await bridge.handleMessage({
      target: "bbl-next.runner.offscreen",
      kind: "host.exec",
      requestId: "x-local",
      hostId: "local",
      command: "pwd",
    });
    expect(localExec).toMatchObject({
      ok: false,
      error: {
        code: "E_CAPABILITY_NOT_FOUND",
        message: "Execution host adapter does not implement exec",
        details: {
          kind: "exec",
          hostId: "local",
          reason: "operation_not_supported",
        },
      },
    });

    const remoteRead = await bridge.handleMessage({
      target: "bbl-next.runner.offscreen",
      kind: "host.read",
      requestId: "r-remote",
      hostId: "remote",
      path: "/workspace/test.txt",
    });
    expect(remoteRead).toMatchObject({
      ok: false,
      error: {
        code: "E_CAPABILITY_NOT_FOUND",
        message: "Execution host adapter does not implement read",
        details: {
          kind: "read",
          hostId: "remote",
          reason: "operation_not_supported",
        },
      },
    });

    dispose();
  });

  it("default offscreen runner host executes through RunnerHostCore and isolates module state", async () => {
    const host = createDefaultOffscreenRunnerHost({
      runtimeApi: {
        sendMessage: vi.fn(async () => ({
          ok: false,
          error: {
            code: "E_CAPABILITY_NOT_FOUND",
            message: "remote unavailable",
          },
        })),
      },
    });
    const module = {
      id: "counter",
      source: "let counter = 0; exports.default = async () => ++counter;",
    };

    await expect(
      host.dispatch({
        kind: "invoke",
        requestId: "counter-1",
        invocation: {
          module,
          ctx: {},
          input: null,
        },
      }),
    ).resolves.toMatchObject({
      kind: "invoke_result",
      requestId: "counter-1",
      ok: true,
      result: {
        result: 1,
      },
    });

    await expect(
      host.dispatch({
        kind: "invoke",
        requestId: "counter-2",
        invocation: {
          module,
          ctx: {},
          input: null,
        },
      }),
    ).resolves.toMatchObject({
      kind: "invoke_result",
      requestId: "counter-2",
      ok: true,
      result: {
        result: 1,
      },
    });
  });

  it("createRemoteExecAdapter wraps errors into structured host error responses", async () => {
    const failingHandler = vi.fn(async () => {
      throw new Error("bridge unreachable");
    });
    const adapter = createRemoteExecAdapter(failingHandler);
    const result = await adapter.exec({
      kind: "exec",
      requestId: "x1",
      hostId: "remote",
      command: "pwd",
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "E_RUNTIME",
        message: "bridge unreachable",
        details: { kind: "exec", hostId: "remote", reason: "remote_exec_failed" },
      },
    });
  });

  it("createRemoteExecAdapter wraps synchronous throws into structured host error responses", async () => {
    const adapter = createRemoteExecAdapter(() => {
      const error = new Error("bridge unreachable");
      // @ts-expect-error test-only code field
      error.code = "E_REMOTE";
      throw error;
    });

    await expect(
      adapter.exec({
        kind: "exec",
        requestId: "x-sync",
        hostId: "remote",
        command: "pwd",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_REMOTE",
        message: "bridge unreachable",
        details: { kind: "exec", hostId: "remote", reason: "remote_exec_failed" },
      },
    });
  });

  it("createRemoteHostProbe wraps errors into structured remote probe responses", async () => {
    const failingProbe = vi.fn(async () => {
      throw new Error("probe unreachable");
    });
    const probeRemoteHost = createRemoteHostProbe(failingProbe);

    await expect(
      probeRemoteHost({
        kind: "health",
        requestId: "probe-1",
        hostId: "remote",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_RUNTIME",
        message: "probe unreachable",
        details: {
          kind: "health",
          hostId: "remote",
          reason: "remote_probe_failed",
        },
      },
    });
  });

  it("connects, checks health, sets default, and disconnects the local host", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.connect",
        hostId: "local",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        defaultHostId: "local",
        host: {
          hostId: "local",
          kind: "local",
          connected: true,
          state: "connected",
          isDefault: true,
          health: {
            status: "healthy",
          },
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.health",
        hostId: "local",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "local",
        connected: true,
        state: "connected",
        health: {
          status: "healthy",
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.set_default",
        hostId: "local",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        defaultHostId: "local",
        host: {
          hostId: "local",
          isDefault: true,
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.disconnect",
        hostId: "local",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        defaultHostId: "local",
        host: {
          hostId: "local",
          connected: false,
          state: "disconnected",
          isDefault: true,
          health: {
            status: "unknown",
          },
        },
      },
    });

    expect(harness.offscreenApi.createDocument).toHaveBeenCalledTimes(1);
    expect(harness.offscreenApi.closeDocument).toHaveBeenCalledTimes(1);
    dispose();
    harness.cleanup();
  });

  it("uses remote transport probe results for remote connect and health", async () => {
    const harness = createChromeHarness({});
    const sendRemoteExec = vi.fn();
    const probeHandler = vi.fn(async () => ({
      status: "healthy",
    }));
    const remoteTransport = createRemoteHostTransport({
      sendExec: sendRemoteExec,
      sendProbe: probeHandler,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      remoteTransport,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.connect",
        hostId: "remote",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        defaultHostId: "remote",
        host: {
          hostId: "remote",
          connected: true,
          state: "connected",
          isDefault: true,
          health: {
            status: "healthy",
          },
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.health",
        hostId: "remote",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "remote",
        connected: true,
        state: "connected",
        health: {
          status: "healthy",
        },
      },
    });

    expect(probeHandler).toHaveBeenCalledTimes(2);
    expect(sendRemoteExec).not.toHaveBeenCalled();
    dispose();
    harness.cleanup();
  });

  it("surfaces degraded remote host state when the remote transport probe fails", async () => {
    const harness = createChromeHarness({});
    const probeHandler = vi.fn(async () => {
      const error = new Error("probe unreachable");
      // @ts-expect-error test-only code field
      error.code = "E_REMOTE";
      throw error;
    });
    const remoteTransport = createRemoteHostTransport({
      sendExec: vi.fn(),
      sendProbe: probeHandler,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      remoteTransport,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.connect",
        hostId: "remote",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_REMOTE",
        message: "probe unreachable",
        details: {
          kind: "health",
          hostId: "remote",
          reason: "remote_probe_failed",
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.health",
        hostId: "remote",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "remote",
        connected: false,
        state: "degraded",
        health: {
          status: "degraded",
        },
        error: {
          code: "E_REMOTE",
          message: "probe unreachable",
        },
      },
    });

    expect(probeHandler).toHaveBeenCalledTimes(2);
    dispose();
    harness.cleanup();
  });

  it("falls back to control-plane state when remote transport probe is not configured", async () => {
    const harness = createChromeHarness({});
    const sendRemoteExec = vi.fn(async (request: { hostId: string; command: string }) => ({
      hostId: request.hostId,
      command: request.command,
      exitCode: 0,
      stdout: `remote:${request.command}`,
      stderr: "",
    }));
    const remoteTransport = createRemoteHostTransport({
      sendExec: sendRemoteExec,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      remoteTransport,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.connect",
        hostId: "remote",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        defaultHostId: "remote",
        host: {
          hostId: "remote",
          kind: "remote",
          connected: true,
          state: "connected",
          isDefault: true,
          health: {
            status: "healthy",
          },
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.health",
        hostId: "remote",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "remote",
        connected: true,
        state: "connected",
        health: {
          status: "healthy",
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.set_default",
        hostId: "remote",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        defaultHostId: "remote",
        host: {
          hostId: "remote",
          isDefault: true,
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.disconnect",
        hostId: "remote",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        defaultHostId: "remote",
        host: {
          hostId: "remote",
          connected: false,
          state: "disconnected",
          isDefault: true,
          health: {
            status: "unknown",
          },
        },
      },
    });

    expect(harness.offscreenApi.createDocument).not.toHaveBeenCalled();
    expect(harness.offscreenApi.closeDocument).not.toHaveBeenCalled();
    expect(sendRemoteExec).not.toHaveBeenCalled();
    dispose();
    harness.cleanup();
  });

  it("reads host control plane changes back through audit.tail as the main read path", async () => {
    const auditStore = createAuditStoreHarness();
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: { result: "ok", durationMs: 1 },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      sessionId: "session-audit-1",
      auditStore,
    });
    const dispose = bridge.registerRuntimeListener();

    // connect
    await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "hosts.connect",
      hostId: "local",
    });

    // set_default
    await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "hosts.set_default",
      hostId: "local",
    });

    // disconnect
    await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "hosts.disconnect",
      hostId: "local",
    });

    // read audit tail via unified route
    const auditResult = (await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "audit.tail",
    })) as {
      ok: boolean;
      data: {
        id: string;
        data: {
          entries: Array<{
            timestamp: string;
            sessionId: string | null;
            kind: string;
            hostId: string;
            status: string;
          }>;
        };
      };
    };

    expect(auditResult.ok).toBe(true);
    expect(auditResult.data.id).toBe("audit.tail");
    const entries = auditResult.data.data.entries;
    expect(entries).toHaveLength(3);

    expect(entries[0]).toMatchObject({
      sessionId: "session-audit-1",
      kind: "hosts.connect",
      hostId: "local",
      status: "connected",
    });
    expect(typeof entries[0].timestamp).toBe("string");

    expect(entries[1]).toMatchObject({
      sessionId: "session-audit-1",
      kind: "hosts.set_default",
      hostId: "local",
      status: "default_set",
    });

    expect(entries[2]).toMatchObject({
      sessionId: "session-audit-1",
      kind: "hosts.disconnect",
      hostId: "local",
      status: "disconnected",
    });

    // also verify direct API
    const directTail = bridge.getAuditTail(2);
    expect(directTail).toHaveLength(2);
    expect(directTail[0].kind).toBe("hosts.set_default");
    expect(directTail[1].kind).toBe("hosts.disconnect");

    dispose();
    harness.cleanup();
  });

  it("persists the unified audit.tail across bridge restart and rehydrates mixed control-plane events", async () => {
    const auditStore = createAuditStoreHarness();
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: { result: "ok", durationMs: 1 },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };

    const firstHarness = createChromeHarness({ host });
    const firstBridge = createBackgroundRunnerBridge({
      chromeApi: firstHarness.chromeApi,
      timeoutMs: 50,
      sessionId: "session-persist-1",
      auditStore,
    });
    const disposeFirst = firstBridge.registerRuntimeListener();

    await firstHarness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "hosts.connect",
      hostId: "local",
    });
    await firstHarness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "hosts.set_default",
      hostId: "local",
    });
    await firstHarness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "config.update",
      patch: {
        model: {
          provider: "openai",
        },
      },
    });
    await firstHarness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "skills.install",
      skillId: "skill.persisted",
    });

    disposeFirst();
    firstHarness.cleanup();

    const secondHarness = createChromeHarness({ host });
    const secondBridge = createBackgroundRunnerBridge({
      chromeApi: secondHarness.chromeApi,
      timeoutMs: 50,
      auditStore,
    });
    const disposeSecond = secondBridge.registerRuntimeListener();

    const auditResult = (await secondHarness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "audit.tail",
    })) as {
      ok: boolean;
      data: {
        id: string;
        data: {
          entries: Array<{
            sessionId: string | null;
            kind: string;
            status: string;
            changedFields?: string[];
            skillId?: string;
          }>;
        };
      };
    };

    expect(auditResult).toMatchObject({
      ok: true,
      data: {
        id: "audit.tail",
        data: {
          entries: [
            {
              sessionId: "session-persist-1",
              kind: "hosts.connect",
              status: "connected",
            },
            {
              sessionId: "session-persist-1",
              kind: "hosts.set_default",
              status: "default_set",
            },
            {
              sessionId: "session-persist-1",
              kind: "config.update",
              status: "updated",
              changedFields: ["model"],
            },
            {
              sessionId: "session-persist-1",
              kind: "skills.install",
              status: "installed",
              skillId: "skill.persisted",
            },
          ],
        },
      },
    });

    expect(secondBridge.getAuditTail(10)).toHaveLength(4);

    disposeSecond();
    secondHarness.cleanup();
  });

  it("trims audit entries exceeding retention maxEntries on save and load", async () => {
    const auditStore = createAuditStoreHarness();
    const host = {
      dispatch: vi.fn(async (request) => ({
        kind: "health_result",
        requestId: (request as { requestId: string }).requestId,
        ok: true,
        health: { status: "idle", inflightCount: 0, consecutiveFailures: 0 },
      })),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };

    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      sessionId: "session-retention-1",
      auditStore,
      auditRetention: { maxEntries: 5, maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
    });
    const dispose = bridge.registerRuntimeListener();

    // Trigger 8 host connect events to generate audit entries
    // Must use hostId "local" — the only accepted host id
    for (let i = 0; i < 8; i++) {
      await harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.connect",
        hostId: "local",
      });
    }

    // In-memory tail should be trimmed to maxEntries
    const tail = bridge.getAuditTail(100);
    expect(tail).toHaveLength(5);

    // Persisted store should also have trimmed entries
    const persisted = await auditStore.load();
    expect(persisted).toHaveLength(5);

    // Restart with new bridge — should load trimmed entries
    dispose();
    harness.cleanup();

    const secondHarness = createChromeHarness({ host });
    const secondBridge = createBackgroundRunnerBridge({
      chromeApi: secondHarness.chromeApi,
      timeoutMs: 50,
      auditStore,
      auditRetention: { maxEntries: 5, maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
    });
    secondBridge.registerRuntimeListener();

    // getAuditTail waits for auditReady internally before returning loaded entries
    // Send a bootstrap message to trigger auditReady path
    await secondHarness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "runtime.bootstrap",
      world: "main",
    });
    expect(secondBridge.getAuditTail(100)).toHaveLength(5);

    secondHarness.cleanup();
  });

  it("trims audit entries older than retention maxAgeMs on load", async () => {
    const now = Date.now();
    const oldTimestamp = new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(); // 4 days ago
    const recentTimestamp = new Date(now - 1000).toISOString(); // 1 second ago

    const initialEntries = [
      {
        timestamp: oldTimestamp,
        sessionId: "s1",
        kind: "hosts.connect",
        hostId: "old",
        status: "connected",
      },
      {
        timestamp: oldTimestamp,
        sessionId: "s1",
        kind: "hosts.disconnect",
        hostId: "old",
        status: "disconnected",
      },
      {
        timestamp: recentTimestamp,
        sessionId: "s2",
        kind: "hosts.connect",
        hostId: "recent",
        status: "connected",
      },
    ];

    // Pre-populate storage with old + recent entries
    const storedData: Record<string, unknown> = {
      "bbl-next.audit.tail.v1": initialEntries,
    };
    const chromeApi = {
      runtime: {
        getURL: (path: string) => path,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: {
        local: {
          get: vi.fn(async (keys: string[]) => {
            const result: Record<string, unknown> = {};
            for (const key of keys) {
              if (storedData[key] !== undefined) result[key] = storedData[key];
            }
            return result;
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(storedData, items);
          }),
        },
      },
      offscreen: {},
    };

    const bridge = createBackgroundRunnerBridge({
      chromeApi,
      timeoutMs: 50,
      // maxAgeMs = 3 days → 4-day-old entries should be trimmed
      auditRetention: { maxEntries: 1000, maxAgeMs: 3 * 24 * 60 * 60 * 1000 },
    });
    bridge.registerRuntimeListener();

    // auditReady loads from chrome storage and trims; wait a tick for it to settle
    await new Promise((r) => setTimeout(r, 10));
    const tail = bridge.getAuditTail(100);
    expect(tail).toHaveLength(1);
    expect(tail[0].hostId).toBe("recent");
  });

  it("clears runtime error state via runtime.clear_error and returns consistent bootstrap", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: { status: "idle", inflightCount: 0, consecutiveFailures: 0 },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: { result: "ok", durationMs: 1 },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });
    const dispose = bridge.registerRuntimeListener();

    // Bootstrap without connecting — offscreen is absent, so runner diagnostics reports an error.
    // This captures a runtime error in the bridge state.
    const firstBootstrap = (await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "runtime.bootstrap",
    })) as { ok: boolean; data: { runtime: { lastError: unknown } } };
    expect(firstBootstrap.ok).toBe(true);
    expect(firstBootstrap.data.runtime.lastError).toMatchObject({
      code: "E_RUNTIME",
    });

    // Clear the error
    const clearResult = (await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "runtime.clear_error",
    })) as { ok: boolean; data: { cleared: boolean } };
    expect(clearResult).toMatchObject({ ok: true, data: { cleared: true } });

    // Bootstrap again — lastError should be null (error was cleared, and the live error
    // from absent offscreen still gets captured, but since we just cleared we simulate
    // the "acknowledged" state. A fresh bootstrap will re-capture the live error.)
    // To properly test the clear path, connect the host first so there's no live error.
    await bridge.ensureHost();
    const secondBootstrap = (await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "runtime.bootstrap",
    })) as { ok: boolean; data: { runtime: { lastError: unknown } } };
    expect(secondBootstrap.ok).toBe(true);
    expect(secondBootstrap.data.runtime.lastError).toBeNull();

    // Idempotent clear when no error
    const idempotentClear = (await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "runtime.clear_error",
    })) as { ok: boolean; data: { cleared: boolean } };
    expect(idempotentClear).toMatchObject({ ok: true, data: { cleared: false } });

    // Direct API also works
    expect(bridge.clearRuntimeError()).toEqual({ cleared: false });

    dispose();
    harness.cleanup();
  });

  it("routes site runtime invoke through the background, offscreen host, and page hook bridge", async () => {
    const harness = createIntegratedChromeHarness({
      activeTab: {
        id: 11,
        url: "https://fixture.test/demo",
      },
      host: {
        dispatch: vi.fn(async (request) => {
          if (request.kind === "invoke") {
            return {
              kind: "invoke_result",
              requestId: request.requestId,
              ok: true,
              result: {
                result: {
                  query: request.invocation.input.query,
                  tabUrl: request.invocation.ctx.tab.url,
                  installationCount: request.invocation.ctx.site.installations.length,
                },
                durationMs: 1,
              },
            };
          }
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0,
        })),
      },
    });
    const pageHookBridge = createPageHookBridge({
      chromeApi: harness.chromeApi,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      pageHookBridge,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "site.runtime.invoke",
        skillId: "fixture.page",
        action: "execute_fixture",
        tab: {
          tabId: 11,
          url: "https://fixture.test/demo",
          active: true,
        },
        input: {
          query: "hello runtime",
        },
        plan: {
          skillId: "fixture.page",
          action: "execute_fixture",
          steps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.fixture",
              jsPath: "src/page-hook.js",
              runAt: "document_idle",
            },
          ],
        },
        module: {
          id: "fixture.page.execute",
          source: `
            exports.default = async ({ ctx, input }) => ({
              query: input.query,
              tabUrl: ctx.tab.url,
              installationCount: ctx.site.installations.length
            });
          `,
        },
        verifier: "page_hook_ok",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        verified: true,
        result: {
          ok: true,
          action: "execute_fixture",
          input: {
            query: "hello runtime",
            tabUrl: "https://fixture.test/demo",
            installationCount: 1,
          },
          installationId: "bbl-next.page-hook.fixture:1",
          installedScriptId: "bbl-next.page-hook.fixture",
          tabUrl: "https://fixture.test/demo",
          installCount: 1,
        },
        trace: [
          "match:fixture.page",
          "plan:1_steps",
          "install:main:bbl-next.page-hook.fixture",
          "invoke:execute_fixture",
          "verify:page_hook_ok",
        ],
      },
    });

    expect(harness.tabsApi.query).toHaveBeenCalledWith({
      active: true,
      lastFocusedWindow: true,
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.diagnostics",
        tabId: 11,
        world: "main",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "healthy",
        bridge: {
          hostReady: true,
          offscreenPresent: true,
        },
        site: {
          status: "healthy",
          tabId: 11,
          world: "main",
          snapshot: {
            installs: [
              expect.objectContaining({
                installationId: "bbl-next.page-hook.fixture:1",
              }),
            ],
            invocations: [
              expect.objectContaining({
                action: "execute_fixture",
                installationId: "bbl-next.page-hook.fixture:1",
              }),
            ],
            verifications: [
              {
                action: "execute_fixture",
                verified: true,
              },
            ],
          },
        },
      },
    });

    dispose();
    harness.cleanup();
  });

  it("routes site runtime invoke through an explicit background lane target and tears the tab down", async () => {
    const harness = createIntegratedChromeHarness({
      activeTab: {
        id: 11,
        url: "https://fixture.test/home",
      },
      host: {
        dispatch: vi.fn(async (request) => {
          if (request.kind === "invoke") {
            return {
              kind: "invoke_result",
              requestId: request.requestId,
              ok: true,
              result: {
                result: {
                  query: request.invocation.input.query,
                  tabUrl: request.invocation.ctx.tab.url,
                  active: request.invocation.ctx.tab.active,
                  installationCount: request.invocation.ctx.site.installations.length,
                },
                durationMs: 1,
              },
            };
          }
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0,
        })),
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      pageHookBridge: createPageHookBridge({
        chromeApi: harness.chromeApi,
      }),
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "site.runtime.invoke",
        automationTarget: {
          lane: "background",
          url: "https://fixture.test/background",
          cleanup: "close-tab",
        },
        skillId: "fixture.page",
        action: "execute_fixture",
        input: {
          query: "background lane",
        },
        plan: {
          skillId: "fixture.page",
          action: "execute_fixture",
          steps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.fixture",
              jsPath: "src/page-hook.js",
            },
          ],
        },
        module: {
          id: "fixture.page.execute",
          source: `
            exports.default = async ({ ctx, input }) => ({
              query: input.query,
              tabUrl: ctx.tab.url,
              active: ctx.tab.active,
              installationCount: ctx.site.installations.length
            });
          `,
        },
        verifier: "page_hook_ok",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        verified: true,
        result: {
          ok: true,
          action: "execute_fixture",
          input: {
            query: "background lane",
            tabUrl: "https://fixture.test/background",
            active: false,
            installationCount: 1,
          },
          tabUrl: "https://fixture.test/background",
        },
      },
    });

    expect(harness.tabsApi.query).not.toHaveBeenCalled();
    expect(harness.tabsApi.create).toHaveBeenCalledWith({
      url: "https://fixture.test/background",
      active: false,
    });
    expect(harness.tabsApi.remove).toHaveBeenCalledWith(expect.any(Number));

    dispose();
    harness.cleanup();
  });

  it("routes site runtime press_key through an explicit background lane target and tears the tab down", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "invoke") {
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: true,
            result: {
              result: {
                key: request.invocation.input.key,
                tabUrl: request.invocation.ctx.tab.url,
                active: request.invocation.ctx.tab.active,
              },
              durationMs: 1,
            },
          };
        }
        return {
          kind: "health_result",
          requestId: request.requestId,
          ok: true,
          health: {
            status: "idle",
            inflightCount: 0,
            consecutiveFailures: 0,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createIntegratedChromeHarness({
      activeTab: {
        id: 11,
        url: "https://fixture.test/home",
      },
      host,
    });
    const pageHookBridge = createPageHookBridge({
      chromeApi: harness.chromeApi,
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      pageHookBridge,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "site.runtime.invoke",
        automationTarget: {
          lane: "background",
          url: "https://fixture.test/background-press",
          cleanup: "close-tab",
        },
        skillId: "fixture.page",
        action: "press_key",
        input: {
          key: "Enter",
        },
        plan: {
          skillId: "fixture.page",
          action: "press_key",
          steps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.page",
              jsPath: "src/page-hook.js",
              runAt: "document_idle",
            },
          ],
        },
        module: {
          id: "fixture.page.press_key",
          source: "exports.default = async ({ input }) => ({ key: input.key });",
        },
        verifier: "page_press_key",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        verified: true,
        result: {
          ok: true,
          action: "press_key",
          key: "Enter",
          dispatchCount: 2,
          tabUrl: "https://fixture.test/background-press",
        },
        trace: [
          "lane:background",
          "match:fixture.page",
          "plan:1_steps",
          "install:main:bbl-next.page-hook.page",
          "invoke:press_key",
          "verify:page_press_key",
        ],
      },
    });

    const createdTab = await harness.tabsApi.create.mock.results[0]?.value;
    const snapshot = (await pageHookBridge.snapshotState({
      tabId: createdTab.id,
      world: "main",
    })) as {
      keyEvents?: Array<{ type: string; key: string; tabUrl: string }>;
      verifications?: Array<{ action: string; verified: boolean }>;
    } | null;

    expect(host.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "invoke",
        invocation: expect.objectContaining({
          input: {
            key: "Enter",
          },
          ctx: expect.objectContaining({
            tab: expect.objectContaining({
              url: "https://fixture.test/background-press",
              active: false,
            }),
          }),
        }),
      }),
    );
    expect(snapshot?.keyEvents).toEqual([
      expect.objectContaining({
        type: "keydown",
        key: "Enter",
        tabUrl: "https://fixture.test/background-press",
      }),
      expect.objectContaining({
        type: "keyup",
        key: "Enter",
        tabUrl: "https://fixture.test/background-press",
      }),
    ]);
    expect(snapshot?.verifications).toEqual([
      {
        action: "press_key",
        verified: true,
      },
    ]);
    expect(harness.tabsApi.query).not.toHaveBeenCalled();
    expect(harness.tabsApi.create).toHaveBeenCalledWith({
      url: "https://fixture.test/background-press",
      active: false,
    });
    expect(harness.tabsApi.remove).toHaveBeenCalledWith(createdTab.id);

    dispose();
    harness.cleanup();
  });

  it("forwards stabilization policy through the background lane before treating DOM as blocked", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "invoke") {
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: true,
            result: {
              result: {
                ok: true,
                echoedInput: request.invocation.input,
              },
              durationMs: 1,
            },
          };
        }
        return {
          kind: "health_result",
          requestId: request.requestId,
          ok: true,
          health: {
            status: "idle",
            inflightCount: 0,
            consecutiveFailures: 0,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createIntegratedChromeHarness({
      activeTab: {
        id: 11,
        url: "https://fixture.test/home",
      },
      host,
    });
    let verifyCalls = 0;
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      pageHookBridge: {
        install: vi.fn(async (step) => ({
          installationId: `${step.scriptId}:1`,
        })),
        invoke: vi.fn(async ({ action, input, tab }) => ({
          ok: true,
          action,
          input,
          installationId: "bbl-next.page-hook.fixture:1",
          installedScriptId: "bbl-next.page-hook.fixture",
          tabUrl: tab.url,
          installCount: 1,
        })),
        verify: vi.fn(async () => {
          verifyCalls += 1;
          if (verifyCalls === 1) {
            return {
              status: "not_ready",
              reason: "selector:#late-ready",
            };
          }
          return true;
        }),
        snapshotState: vi.fn(async () => null),
      },
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "site.runtime.invoke",
        automationTarget: {
          lane: "background",
          url: "https://fixture.test/background-stabilize",
          cleanup: "close-tab",
        },
        skillId: "fixture.page",
        action: "execute_fixture",
        input: {
          query: "background stabilize",
        },
        plan: {
          skillId: "fixture.page",
          action: "execute_fixture",
          steps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.fixture",
              jsPath: "src/page-hook.js",
            },
          ],
        },
        module: {
          id: "fixture.page.execute",
          source: "exports.default = async ({ input }) => ({ query: input.query });",
        },
        verifier: "page_ready_selector",
        stabilization: {
          maxAttempts: 3,
          intervalMs: 0,
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        verified: true,
        trace: [
          "lane:background",
          "match:fixture.page",
          "plan:1_steps",
          "install:main:bbl-next.page-hook.fixture",
          "invoke:execute_fixture",
          "stabilize:not_ready:1",
          "verify:page_ready_selector",
        ],
      },
    });

    expect(verifyCalls).toBe(2);
    expect(harness.tabsApi.create).toHaveBeenCalledWith({
      url: "https://fixture.test/background-stabilize",
      active: false,
    });

    dispose();
    harness.cleanup();
  });

  it("persists intervention lifecycle through runtime services, diagnostics, bootstrap, and audit", async () => {
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "invoke") {
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: true,
            result: {
              result: {
                ok: true,
                echoedInput: request.invocation.input,
              },
              durationMs: 1,
            },
          };
        }
        return {
          kind: "health_result",
          requestId: request.requestId,
          ok: true,
          health: {
            status: "idle",
            inflightCount: 0,
            consecutiveFailures: 0,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const harness = createChromeHarness({
      host,
      activeTab: {
        id: 11,
        url: "https://fixture.test/login",
      },
    });
    const pageHookBridge = {
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
      verify: vi.fn(async () => false),
      snapshotState: vi.fn(async ({ tabId, world }: { tabId: number; world: string }) => ({
        tabId,
        world,
        installs: 1,
        invocations: 1,
        verifications: [{ action: "secure_login", verified: false }],
      })),
    };
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      pageHookBridge,
      interventionTimeoutMs: 10_000,
    });
    const dispose = bridge.registerRuntimeListener();

    await bridge.ensureHost();

    const firstInvoke = (await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "site.runtime.invoke",
      skillId: "fixture.page",
      action: "secure_login",
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
        action: "secure_login",
        steps: [
          {
            world: "main",
            scriptId: "bbl-next.page-hook.fixture",
          },
        ],
      },
      module: {
        id: "fixture.page.secure-login",
        source: `
          exports.default = async ({ input }) => ({
            username: input.username
          });
        `,
      },
      verifier: "page_hook_ok",
      intervention: {
        kind: "takeover",
        title: "Manual verify required",
        message: "Finish the verification flow manually.",
        trigger: "verify_failed",
      },
    })) as {
      ok: boolean;
      data: { intervention: { id: string; sessionId: string; status: string } };
    };

    expect(firstInvoke).toMatchObject({
      ok: true,
      data: {
        verified: false,
        intervention: {
          id: "ivr:fixture.page:secure_login:verify_failed:11:page_hook_ok",
          kind: "takeover",
          trigger: "verify_failed",
          status: "requested",
          sessionId: expect.any(String),
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.diagnostics",
        tabId: 11,
        world: "main",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        kernel: {
          interventions: {
            status: "requested",
            activeCount: 1,
            active: [
              expect.objectContaining({
                id: firstInvoke.data.intervention.id,
                status: "requested",
              }),
            ],
          },
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.bootstrap",
        world: "main",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        runtime: {
          interventions: {
            status: "requested",
            activeCount: 1,
            active: [
              expect.objectContaining({
                id: firstInvoke.data.intervention.id,
                status: "requested",
              }),
            ],
          },
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "audit.intervention",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: "audit.intervention",
        data: {
          entries: [
            expect.objectContaining({
              interventionId: firstInvoke.data.intervention.id,
              status: "requested",
            }),
          ],
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "intervention.resolve",
        interventionId: firstInvoke.data.intervention.id,
        resolution: {
          resolution: "resume",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        intervention: {
          id: firstInvoke.data.intervention.id,
          status: "resolved",
          resolution: {
            resolution: "resume",
          },
        },
      },
    });

    const secondInvoke = (await harness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "site.runtime.invoke",
      skillId: "fixture.page",
      action: "submit_code",
      tab: {
        tabId: 11,
        url: "https://fixture.test/login",
        active: true,
      },
      input: {
        code: "123456",
      },
      plan: {
        skillId: "fixture.page",
        action: "submit_code",
        steps: [
          {
            world: "main",
            scriptId: "bbl-next.page-hook.fixture",
          },
        ],
      },
      module: {
        id: "fixture.page.submit-code",
        source: `
          exports.default = async ({ input }) => ({
            code: input.code
          });
        `,
      },
      verifier: "page_hook_ok",
      intervention: {
        kind: "input",
        title: "Need code confirmation",
        message: "Cancel or provide a new code.",
        trigger: "verify_failed",
      },
    })) as {
      ok: boolean;
      data: { intervention: { id: string } };
    };

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "intervention.cancel",
        interventionId: secondInvoke.data.intervention.id,
        reason: "user_cancelled",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        intervention: {
          id: secondInvoke.data.intervention.id,
          status: "cancelled",
          resolution: {
            reason: "user_cancelled",
          },
        },
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
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
            id: firstInvoke.data.intervention.id,
            status: "resolved",
          }),
          expect.objectContaining({
            id: secondInvoke.data.intervention.id,
            status: "cancelled",
          }),
        ]),
      },
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "audit.intervention",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: "audit.intervention",
        data: {
          entries: expect.arrayContaining([
            expect.objectContaining({
              interventionId: firstInvoke.data.intervention.id,
              status: "requested",
            }),
            expect.objectContaining({
              interventionId: firstInvoke.data.intervention.id,
              status: "resolved",
            }),
            expect.objectContaining({
              interventionId: secondInvoke.data.intervention.id,
              status: "requested",
            }),
            expect.objectContaining({
              interventionId: secondInvoke.data.intervention.id,
              status: "cancelled",
            }),
          ]),
        },
      },
    });

    dispose();
    harness.cleanup();
  });

  it("delegates site runtime invoke through composed runtime services", async () => {
    const harness = createIntegratedChromeHarness({
      activeTab: {
        id: 11,
        url: "https://fixture.test/demo",
      },
      host: {
        dispatch: vi.fn(async () => ({
          kind: "health_result",
          ok: true,
          health: {
            status: "idle",
            inflightCount: 0,
            consecutiveFailures: 0,
          },
        })),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0,
        })),
      },
    });
    const runtimeServices = {
      getKernelRuntimeState: vi.fn(async () => ({
        session: { id: "kernel-session" },
        runState: { phase: "idle" },
      })),
      invokeSiteSkill: vi.fn(async () => ({
        result: { ok: true, via: "services" },
        verified: true,
        trace: ["match:fixture.page"],
      })),
    };
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      runtimeServices,
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "site.runtime.invoke",
        skillId: "fixture.page",
        action: "execute_fixture",
        tab: {
          tabId: 11,
          url: "https://fixture.test/demo",
          active: true,
        },
        input: {
          query: "hello runtime",
        },
        plan: {
          skillId: "fixture.page",
          action: "execute_fixture",
          steps: [],
        },
        module: {
          id: "fixture.page.execute",
          source: "exports.default = async () => ({ ok: true });",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        result: {
          ok: true,
          via: "services",
        },
        verified: true,
        trace: ["match:fixture.page"],
      },
    });

    expect(runtimeServices.invokeSiteSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: "fixture.page",
        action: "execute_fixture",
        tab: expect.objectContaining({
          tabId: 11,
          url: "https://fixture.test/demo",
          active: true,
        }),
      }),
    );

    dispose();
    harness.cleanup();
  });

  it("routes site.runtime.invoke through kernel-owned runner and site steps in runtime services", async () => {
    const harness = createIntegratedChromeHarness({
      activeTab: {
        id: 11,
        url: "https://fixture.test/demo",
      },
    });
    const invokeRunner = vi.fn(
      async (invocation: {
        input: { query: string };
        ctx: { tab: { url: string }; site: { installations: unknown[] } };
      }) => ({
        ok: true,
        data: {
          ok: true,
          result: {
            result: {
              query: invocation.input.query,
              tabUrl: invocation.ctx.tab.url,
              installationCount: invocation.ctx.site.installations.length,
            },
            durationMs: 1,
          },
        },
      }),
    );
    const services = createBackgroundRuntimeServices({
      chromeApi: harness.chromeApi,
      invokeRunner,
      pageHookBridge: createPageHookBridge({
        chromeApi: harness.chromeApi,
      }),
    });

    const result = await services.invokeSiteSkill({
      skillId: "fixture.page",
      action: "execute_fixture",
      tab: {
        tabId: 11,
        url: "https://fixture.test/demo",
        active: true,
      },
      input: {
        query: "hello runtime",
      },
      plan: {
        skillId: "fixture.page",
        action: "execute_fixture",
        steps: [
          {
            world: "main",
            scriptId: "bbl-next.page-hook.fixture",
            jsPath: "src/page-hook.js",
            runAt: "document_idle",
          },
        ],
      },
      module: {
        id: "fixture.page.execute",
        source: `
          exports.default = async ({ ctx, input }) => ({
            query: input.query,
            tabUrl: ctx.tab.url,
            installationCount: ctx.site.installations.length
          });
        `,
      },
      verifier: "page_hook_ok",
    });
    const [{ kernel }, session] = await Promise.all([
      services.ensureServices(),
      services.ensureSession(),
    ]);

    expect(result).toMatchObject({
      verified: true,
      result: {
        ok: true,
        action: "execute_fixture",
        input: {
          query: "hello runtime",
          tabUrl: "https://fixture.test/demo",
          installationCount: 1,
        },
        installationId: "bbl-next.page-hook.fixture:1",
        installedScriptId: "bbl-next.page-hook.fixture",
        tabUrl: "https://fixture.test/demo",
        installCount: 1,
      },
    });
    expect(invokeRunner).toHaveBeenCalledTimes(1);
    expect(kernel.getStepCount(session.id)).toBe(2);
    expect(kernel.getRunState(session.id).phase).toBe("paused");

    harness.cleanup();
  });

  it("rehydrates pending interventions across bridge restart with shared session storage", async () => {
    const sessionStorage = new InMemorySessionStorage();
    const host = {
      dispatch: vi.fn(async (request) => {
        if (request.kind === "invoke") {
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: true,
            result: {
              result: {
                ok: true,
                echoedInput: request.invocation.input,
              },
              durationMs: 1,
            },
          };
        }
        return {
          kind: "health_result",
          requestId: request.requestId,
          ok: true,
          health: {
            status: "idle",
            inflightCount: 0,
            consecutiveFailures: 0,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    };
    const createFixturePageHookBridge = () => ({
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
      verify: vi.fn(async () => false),
      snapshotState: vi.fn(async ({ tabId, world }: { tabId: number; world: string }) => ({
        tabId,
        world,
        installs: 1,
        invocations: 1,
        verifications: [{ action: "secure_login", verified: false }],
      })),
    });

    const firstHarness = createChromeHarness({
      host,
      activeTab: {
        id: 11,
        url: "https://fixture.test/login",
      },
    });
    const firstPageHookBridge = createFixturePageHookBridge();
    const firstRuntimeServices = createBackgroundRuntimeServices({
      chromeApi: firstHarness.chromeApi,
      invokeRunner: async (invocation: { input: unknown }) => ({
        ok: true,
        data: {
          ok: true,
          result: {
            result: invocation.input,
            durationMs: 1,
          },
        },
      }),
      pageHookBridge: firstPageHookBridge,
      sessionStorage,
      interventionTimeoutMs: 10_000,
    });
    const firstBridge = createBackgroundRunnerBridge({
      chromeApi: firstHarness.chromeApi,
      timeoutMs: 50,
      pageHookBridge: firstPageHookBridge,
      runtimeServices: firstRuntimeServices,
    });
    const disposeFirst = firstBridge.registerRuntimeListener();

    const firstInvoke = (await firstHarness.runtimeApi.sendMessage({
      target: RUNNER_BACKGROUND_TARGET,
      kind: "site.runtime.invoke",
      skillId: "fixture.page",
      action: "secure_login",
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
        action: "secure_login",
        steps: [
          {
            world: "main",
            scriptId: "bbl-next.page-hook.fixture",
          },
        ],
      },
      module: {
        id: "fixture.page.secure-login",
        source: `
          exports.default = async ({ input }) => ({
            username: input.username
          });
        `,
      },
      verifier: "page_hook_ok",
      intervention: {
        kind: "takeover",
        title: "Manual verify required",
        message: "Finish the verification flow manually.",
        trigger: "verify_failed",
      },
    })) as {
      ok: boolean;
      data: { intervention: { id: string; sessionId: string; status: string } };
    };

    disposeFirst();
    firstHarness.cleanup();

    const secondHarness = createChromeHarness({
      host,
      activeTab: {
        id: 11,
        url: "https://fixture.test/login",
      },
    });
    const secondPageHookBridge = createFixturePageHookBridge();
    const secondRuntimeServices = createBackgroundRuntimeServices({
      chromeApi: secondHarness.chromeApi,
      invokeRunner: async (invocation: { input: unknown }) => ({
        ok: true,
        data: {
          ok: true,
          result: {
            result: invocation.input,
            durationMs: 1,
          },
        },
      }),
      pageHookBridge: secondPageHookBridge,
      sessionStorage,
      interventionTimeoutMs: 10_000,
    });
    const secondBridge = createBackgroundRunnerBridge({
      chromeApi: secondHarness.chromeApi,
      timeoutMs: 50,
      pageHookBridge: secondPageHookBridge,
      runtimeServices: secondRuntimeServices,
    });
    const disposeSecond = secondBridge.registerRuntimeListener();

    await expect(
      secondHarness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.bootstrap",
        world: "main",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        runtime: {
          sessionId: firstInvoke.data.intervention.sessionId,
          interventions: {
            status: "requested",
            activeCount: 1,
            active: [
              expect.objectContaining({
                id: firstInvoke.data.intervention.id,
                status: "requested",
              }),
            ],
          },
        },
      },
    });

    await expect(
      secondHarness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.diagnostics",
        tabId: 11,
        world: "main",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        kernel: {
          interventions: {
            status: "requested",
            active: [
              expect.objectContaining({
                id: firstInvoke.data.intervention.id,
                status: "requested",
              }),
            ],
          },
        },
      },
    });

    await expect(
      secondHarness.runtimeApi.sendMessage({
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
            id: firstInvoke.data.intervention.id,
            status: "requested",
          }),
        ],
      },
    });

    await expect(
      secondHarness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "audit.intervention",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: "audit.intervention",
        data: {
          entries: [
            expect.objectContaining({
              interventionId: firstInvoke.data.intervention.id,
              status: "requested",
            }),
          ],
        },
      },
    });

    await expect(
      secondHarness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "intervention.resolve",
        interventionId: firstInvoke.data.intervention.id,
        resolution: {
          resolution: "resume",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        intervention: {
          id: firstInvoke.data.intervention.id,
          status: "resolved",
        },
      },
    });

    disposeSecond();
    secondHarness.cleanup();
  });

  it("rejects site runtime invoke when the target tab is not active", async () => {
    const harness = createIntegratedChromeHarness({
      activeTab: {
        id: 12,
        url: "https://fixture.test/other",
      },
      host: {
        dispatch: vi.fn(async () => ({
          kind: "health_result",
          ok: true,
          health: {
            status: "idle",
            inflightCount: 0,
            consecutiveFailures: 0,
          },
        })),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0,
        })),
      },
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      pageHookBridge: createPageHookBridge({
        chromeApi: harness.chromeApi,
      }),
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "site.runtime.invoke",
        skillId: "fixture.page",
        action: "execute_fixture",
        tab: {
          tabId: 11,
          url: "https://fixture.test/demo",
          active: true,
        },
        input: {},
        plan: {
          skillId: "fixture.page",
          action: "execute_fixture",
          steps: [],
        },
        module: {
          id: "fixture.page.execute",
          source: "exports.default = async () => ({ ok: true });",
        },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_BAD_INPUT",
        message: "Site runtime invoke target must be the active tab",
      },
    });

    expect(harness.tabsApi.query).toHaveBeenCalledWith({
      active: true,
      lastFocusedWindow: true,
    });
    expect(harness.offscreenApi.createDocument).not.toHaveBeenCalled();
    dispose();
    harness.cleanup();
  });

  it("returns a timeout error when the offscreen bridge does not respond", async () => {
    const bridge = createBackgroundRunnerBridge({
      chromeApi: createChromeHarness({
        host: {
          dispatch: vi.fn(),
          getHealth: vi.fn(() => ({
            status: "idle",
            inflightCount: 0,
            consecutiveFailures: 0,
          })),
        },
        autoRegisterOffscreen: false,
        hangOffscreen: true,
      }).chromeApi,
      timeoutMs: 5,
    });

    await expect(bridge.ensureHost()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_TIMEOUT",
      },
    });
  });

  it("recreates the offscreen document when the existing host stops responding", async () => {
    const createHost = vi.fn(() => ({
      dispatch: vi.fn(async (request) => {
        if (request.kind === "health") {
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0,
            },
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1,
          },
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      })),
    }));
    const harness = createChromeHarness({ createHost });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });

    await expect(bridge.ensureHost()).resolves.toMatchObject({
      ok: true,
      data: {
        bridge: {
          recovered: false,
          hostReady: true,
        },
      },
    });

    harness.dropOffscreenListener();

    await expect(bridge.ensureHost()).resolves.toMatchObject({
      ok: true,
      data: {
        ready: true,
        bridge: {
          recovered: true,
          recoveryReason: "ensure_failed",
          hostReady: true,
        },
      },
    });

    expect(harness.offscreenApi.closeDocument).toHaveBeenCalledTimes(1);
    expect(harness.offscreenApi.createDocument).toHaveBeenCalledTimes(2);
    expect(createHost).toHaveBeenCalledTimes(2);
    harness.cleanup();
  });

  it("recreates the offscreen document when the host reports degraded health", async () => {
    const createHost = vi
      .fn()
      .mockImplementationOnce(() => ({
        dispatch: vi.fn(async (request) => {
          if (request.kind === "health") {
            return {
              kind: "health_result",
              requestId: request.requestId,
              ok: true,
              health: {
                status: "degraded",
                inflightCount: 0,
                consecutiveFailures: 1,
              },
            };
          }
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: true,
            result: {
              result: "ok",
              durationMs: 1,
            },
          };
        }),
        getHealth: vi.fn(() => ({
          status: "degraded",
          inflightCount: 0,
          consecutiveFailures: 1,
        })),
      }))
      .mockImplementationOnce(() => ({
        dispatch: vi.fn(async (request) => {
          if (request.kind === "health") {
            return {
              kind: "health_result",
              requestId: request.requestId,
              ok: true,
              health: {
                status: "idle",
                inflightCount: 0,
                consecutiveFailures: 0,
              },
            };
          }
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: true,
            result: {
              result: "ok",
              durationMs: 1,
            },
          };
        }),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0,
        })),
      }));
    const harness = createChromeHarness({ createHost });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
    });

    await expect(bridge.ensureHost()).resolves.toMatchObject({
      ok: true,
      data: {
        health: {
          status: "idle",
        },
        bridge: {
          recovered: true,
          recoveryReason: "unhealthy_host",
          hostReady: true,
        },
      },
    });

    expect(harness.offscreenApi.closeDocument).toHaveBeenCalledTimes(1);
    expect(harness.offscreenApi.createDocument).toHaveBeenCalledTimes(2);
    expect(createHost).toHaveBeenCalledTimes(2);
    harness.cleanup();
  });

  it("injects, invokes, and verifies the page hook through chrome.scripting", async () => {
    const harness = createScriptingHarness();
    const bridge = createPageHookBridge({
      chromeApi: harness.chromeApi,
    });
    const step = {
      world: "main" as const,
      scriptId: "bbl-next.page-hook.fixture",
      jsPath: "src/page-hook.js",
      runAt: "document_idle" as const,
    };
    const activeTab = {
      tabId: 21,
      url: "https://fixture.test/demo",
      active: true,
    };

    const installation = await bridge.install(step, activeTab);
    const result = await bridge.invoke({
      installation: {
        step,
        result: installation,
      },
      action: "execute_fixture",
      input: {
        query: "bridge",
      },
      tab: activeTab,
      ctx: {
        tab: activeTab,
      },
    });
    const verified = await bridge.verify({
      installation: {
        step,
        result: installation,
      },
      action: "execute_fixture",
      result,
      tab: activeTab,
    });
    const state = await bridge.snapshotState({
      tabId: activeTab.tabId,
      world: "main",
    });

    expect((installation as { run?: unknown }).run).toBeUndefined();
    expect(installation).toEqual({
      installationId: "bbl-next.page-hook.fixture:1",
      installed: {
        installationId: "bbl-next.page-hook.fixture:1",
        world: "main",
        scriptId: "bbl-next.page-hook.fixture",
        jsPath: "src/page-hook.js",
        runAt: "document_idle",
        tabId: 21,
        url: "https://fixture.test/demo",
      },
    });
    expect(result).toMatchObject({
      ok: true,
      action: "execute_fixture",
      installationId: "bbl-next.page-hook.fixture:1",
      installedScriptId: "bbl-next.page-hook.fixture",
      input: {
        query: "bridge",
      },
    });
    expect(verified).toBe(true);
    expect(state).toMatchObject({
      installs: [
        expect.objectContaining({
          installationId: "bbl-next.page-hook.fixture:1",
          scriptId: "bbl-next.page-hook.fixture",
        }),
      ],
      invocations: [
        expect.objectContaining({
          installationId: "bbl-next.page-hook.fixture:1",
          action: "execute_fixture",
        }),
      ],
      verifications: [
        {
          action: "execute_fixture",
          verified: true,
        },
      ],
    });
    expect(harness.chromeApi.scripting.executeScript).toHaveBeenCalled();
  });
});
