import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import manifest from "../manifest.json";
// @ts-ignore source JS module has no declaration file yet
import { RUNNER_BACKGROUND_TARGET, RUNNER_OFFSCREEN_DOCUMENT_PATH, RUNNER_OFFSCREEN_REASONS, createBackgroundRunnerBridge, createPageHookBridge } from "../src/background.js";
// @ts-ignore source JS module has no declaration file yet
import { createOffscreenRunnerBridge } from "../src/offscreen.js";
import { describe, expect, it, vi } from "vitest";

type MessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (value: unknown) => void
) => unknown;

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
    }
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
    sendMessage
  };
}

function createChromeHarness({
  host,
  createHost,
  autoRegisterOffscreen = true,
  hangOffscreen = false,
  activeTab
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
}) {
  const messageBus = createMessageBus();
  let hasOffscreen = false;
  let disposeOffscreen: null | (() => void) = null;
  const hostFactory = createHost ?? (() => {
    if (!host) {
      throw new Error("createChromeHarness requires host or createHost");
    }
    return host;
  });
  const runtimeApi = {
    ...messageBus,
    onInstalled: {
      addListener: vi.fn()
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
    }
  };

  if (hangOffscreen) {
    runtimeApi.sendMessage = vi.fn(() => new Promise(() => {}));
  } else {
    runtimeApi.sendMessage = vi.fn((message) => messageBus.sendMessage(message));
  }

  const tabsApi = {
    query: vi.fn(async () => (
      activeTab
        ? [
            {
              ...activeTab,
              active: activeTab.active ?? true
            }
          ]
        : []
    ))
  };

  const offscreenApi = {
    createDocument: vi.fn(async () => {
      hasOffscreen = true;
      if (autoRegisterOffscreen) {
        disposeOffscreen?.();
        disposeOffscreen = createOffscreenRunnerBridge({
          runtimeApi,
          createHost: () => hostFactory()
        }).registerRuntimeListener();
      }
    }),
    closeDocument: vi.fn(async () => {
      hasOffscreen = false;
      disposeOffscreen?.();
      disposeOffscreen = null;
    })
  };

  return {
    chromeApi: {
      runtime: runtimeApi,
      offscreen: offscreenApi,
      tabs: tabsApi
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
    }
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
      console
    };
    sandbox.globalThis = sandbox;
    worlds.set(key, sandbox);
    return sandbox;
  }

  return {
    chromeApi: {
      scripting: {
        executeScript: vi.fn(async (request: {
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
              const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
              runInNewContext(source, context, {
                filename: file
              });
            }
          }

          if (request.func) {
            context.__bblArgs = request.args ?? [];
            const result = await Promise.resolve(
              runInNewContext(`(${request.func.toString()})(...globalThis.__bblArgs)`, context, {
                filename: "executeScript.js"
              })
            );
            delete context.__bblArgs;
            return [{ result }];
          }

          return [];
        })
      }
    }
  };
}

function createIntegratedChromeHarness(options: {
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
} = {}) {
  const runtimeHarness = createChromeHarness(options);
  const scriptingHarness = createScriptingHarness();

  return {
    ...runtimeHarness,
    chromeApi: {
      ...runtimeHarness.chromeApi,
      scripting: scriptingHarness.chromeApi.scripting
    }
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
      type: "module"
    });
    expect(manifest.side_panel).toMatchObject({
      default_path: "src/sidepanel.html"
    });
  });

  it("keeps the offscreen entry free of TypeScript source imports", () => {
    const source = readFileSync(new URL("../src/offscreen.js", import.meta.url), "utf8");

    expect(source).not.toMatch(/\.ts["']/);
  });

  it("keeps the offscreen runner core synced with packages/js-runner", () => {
    const packageCore = readFileSync(
      new URL("../../../packages/js-runner/src/runner-host-core.js", import.meta.url),
      "utf8"
    );
    const appCore = readFileSync(new URL("../src/runner-host-core.js", import.meta.url), "utf8");

    expect(appCore).toBe(packageCore);
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
              consecutiveFailures: 0
            }
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1
          }
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0
      }))
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50
    });

    await expect(bridge.ensureHost()).resolves.toMatchObject({
      ok: true,
      data: {
        ready: true,
        bridge: {
          hostReady: true
        }
      }
    });
    await expect(bridge.ensureHost()).resolves.toMatchObject({
      ok: true
    });

    expect(harness.offscreenApi.createDocument).toHaveBeenCalledTimes(1);
    expect(harness.offscreenApi.createDocument).toHaveBeenCalledWith({
      url: RUNNER_OFFSCREEN_DOCUMENT_PATH,
      reasons: RUNNER_OFFSCREEN_REASONS,
      justification: expect.any(String)
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
              durationMs: 1
            }
          };
        }
        if (request.kind === "cancel") {
          return {
            kind: "cancel_result",
            requestId: request.requestId,
            ok: true,
            targetRequestId: request.targetRequestId,
            cancelled: true
          };
        }
        return {
          kind: "health_result",
          requestId: request.requestId,
          ok: true,
          health: {
            status: "idle",
            inflightCount: 0,
            consecutiveFailures: 0
          }
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0
      }))
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50
    });

    await expect(
      bridge.invoke({
        module: {
          id: "demo",
          source: "exports.default = async () => 'ok';"
        },
        ctx: {},
        input: "payload"
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        kind: "invoke_result",
        ok: true,
        result: {
          result: "payload"
        }
      }
    });
    await expect(bridge.cancel("req-123")).resolves.toMatchObject({
      ok: true,
      data: {
        kind: "cancel_result",
        cancelled: true,
        targetRequestId: "req-123"
      }
    });

    expect(host.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "invoke"
      })
    );
    expect(host.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "cancel",
        targetRequestId: "req-123"
      })
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
              consecutiveFailures: 0
            }
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1
          }
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0
      }))
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runner.health"
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        kind: "health_result",
        ok: true,
        health: {
          status: "idle",
          inflightCount: 0
        },
        bridge: {
          hostReady: true
        }
      }
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
              consecutiveFailures: 0
            }
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1
          }
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0
      }))
    };
    const harness = createChromeHarness({ host });
    const pageHookBridge = {
      snapshotState: vi.fn(async ({ tabId, world }: { tabId: number; world: string }) => ({
        tabId,
        world,
        installs: 1,
        invocations: 2
      }))
    };
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      pageHookBridge
    });
    const dispose = bridge.registerRuntimeListener();

    await bridge.ensureHost();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.diagnostics",
        tabId: 21,
        world: "main"
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "healthy",
        bridge: {
          hostReady: true,
          offscreenPresent: true
        },
        runner: {
          reachable: true,
          health: {
            status: "idle",
            inflightCount: 0
          }
        },
        site: {
          status: "healthy",
          tabId: 21,
          world: "main",
          snapshot: {
            installs: 1,
            invocations: 2
          }
        }
      }
    });

    expect(pageHookBridge.snapshotState).toHaveBeenCalledWith({
      tabId: 21,
      world: "main"
    });

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
              consecutiveFailures: 2
            }
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1
          }
        };
      }),
      getHealth: vi.fn(() => ({
        status: "degraded",
        inflightCount: 0,
        consecutiveFailures: 2
      }))
    };
    const harness = createChromeHarness({ host });
    const pageHookBridge = {
      snapshotState: vi.fn(async () => {
        throw new Error("page hook unavailable");
      })
    };
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      pageHookBridge
    });

    await bridge.ensureHost();
    const offscreenCreatesBeforeDiagnostics = harness.offscreenApi.createDocument.mock.calls.length;
    const offscreenClosesBeforeDiagnostics = harness.offscreenApi.closeDocument.mock.calls.length;

    await expect(
      bridge.diagnostics({
        tabId: 21,
        world: "main"
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "degraded",
        bridge: {
          hostReady: true,
          offscreenPresent: true
        },
        runner: {
          reachable: true,
          health: {
            status: "degraded",
            consecutiveFailures: 2
          }
        },
        site: {
          status: "degraded",
          error: {
            code: "E_RUNTIME",
            message: "page hook unavailable"
          }
        }
      }
    });

    expect(harness.offscreenApi.createDocument).toHaveBeenCalledTimes(
      offscreenCreatesBeforeDiagnostics
    );
    expect(harness.offscreenApi.closeDocument).toHaveBeenCalledTimes(
      offscreenClosesBeforeDiagnostics
    );
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
              consecutiveFailures: 0
            }
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1
          }
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0
      }))
    };
    const harness = createIntegratedChromeHarness({
      host
    });
    const pageHookBridge = createPageHookBridge({
      chromeApi: harness.chromeApi
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      pageHookBridge
    });

    await bridge.ensureHost();

    await expect(
      bridge.diagnostics({
        tabId: 21,
        world: "main"
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "healthy",
        site: {
          status: "empty",
          tabId: 21,
          world: "main",
          snapshot: null
        }
      }
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
              consecutiveFailures: 0
            }
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1
          }
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0
      }))
    };
    const harness = createChromeHarness({
      host,
      activeTab: {
        id: 21,
        url: "https://x.com/home",
        title: "Home"
      }
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
          recentChange: "skill.twitter enabled"
        },
        {
          id: "skill.notes",
          state: "disabled",
          trusted: false
        }
      ]
    });
    const dispose = bridge.registerRuntimeListener();

    await bridge.ensureHost();
    const offscreenCreatesBeforeBootstrap = harness.offscreenApi.createDocument.mock.calls.length;

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.bootstrap",
        world: "main"
      })
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
            world: "main"
          },
          loopState: "idle"
        },
        skills: {
          status: "healthy",
          installedCount: 2,
          enabledCount: 1,
          trustedCount: 1
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
              isDefault: false
            }
          ]
        },
        config: {
          status: "placeholder"
        }
      }
    });

    expect(harness.tabsApi.query).toHaveBeenCalledWith({
      active: true,
      lastFocusedWindow: true
    });
    expect(harness.offscreenApi.createDocument).toHaveBeenCalledTimes(
      offscreenCreatesBeforeBootstrap
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
              consecutiveFailures: 2
            }
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1
          }
        };
      }),
      getHealth: vi.fn(() => ({
        status: "degraded",
        inflightCount: 0,
        consecutiveFailures: 2
      }))
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50
    });
    const dispose = bridge.registerRuntimeListener();

    await bridge.ensureHost();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.bootstrap"
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "degraded",
        runtime: {
          status: "degraded",
          loopState: "degraded",
          lastError: null
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
              isDefault: false
            }
          ]
        }
      }
    });

    expect(harness.tabsApi.query).toHaveBeenCalledWith({
      active: true,
      lastFocusedWindow: true
    });
    dispose();
    harness.cleanup();
  });

  it("exposes an empty bootstrap summary bundle before runtime state exists", async () => {
    const harness = createChromeHarness({
      host: {
        dispatch: vi.fn(),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0
        }))
      }
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.bootstrap"
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "empty",
        resourceKeys: ["runtime", "config", "skills", "hosts"],
        runtime: {
          status: "empty",
          sessionId: null,
          loopState: null,
          activeTab: null
        },
        skills: {
          status: "empty",
          installedCount: 0
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
              isDefault: false
            }
          ]
        },
        config: {
          status: "placeholder"
        }
      }
    });

    expect(harness.tabsApi.query).toHaveBeenCalledWith({
      active: true,
      lastFocusedWindow: true
    });
    expect(harness.offscreenApi.createDocument).not.toHaveBeenCalled();
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
          consecutiveFailures: 0
        }))
      }
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.list"
      })
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
            isDefault: false
          }
        ]
      }
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.get",
        hostId: "local"
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "local",
        kind: "local",
        connected: false,
        state: "disconnected",
        isDefault: false
      }
    });

    expect(harness.offscreenApi.createDocument).not.toHaveBeenCalled();
    dispose();
    harness.cleanup();
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
              consecutiveFailures: 0
            }
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1
          }
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0
      }))
    };
    const harness = createChromeHarness({ host });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50
    });
    const dispose = bridge.registerRuntimeListener();

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.connect",
        hostId: "local"
      })
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
            status: "healthy"
          }
        }
      }
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.health",
        hostId: "local"
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        hostId: "local",
        connected: true,
        state: "connected",
        health: {
          status: "healthy"
        }
      }
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.set_default",
        hostId: "local"
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        defaultHostId: "local",
        host: {
          hostId: "local",
          isDefault: true
        }
      }
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "hosts.disconnect",
        hostId: "local"
      })
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
            status: "unknown"
          }
        }
      }
    });

    expect(harness.offscreenApi.createDocument).toHaveBeenCalledTimes(1);
    expect(harness.offscreenApi.closeDocument).toHaveBeenCalledTimes(1);
    dispose();
    harness.cleanup();
  });

  it("routes site runtime invoke through the background, offscreen host, and page hook bridge", async () => {
    const harness = createIntegratedChromeHarness({
      activeTab: {
        id: 11,
        url: "https://fixture.test/demo"
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
                  installationCount: request.invocation.ctx.site.installations.length
                },
                durationMs: 1
              }
            };
          }
          return {
            kind: "health_result",
            requestId: request.requestId,
            ok: true,
            health: {
              status: "idle",
              inflightCount: 0,
              consecutiveFailures: 0
            }
          };
        }),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0
        }))
      }
    });
    const pageHookBridge = createPageHookBridge({
      chromeApi: harness.chromeApi
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      pageHookBridge
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
          active: true
        },
        input: {
          query: "hello runtime"
        },
        plan: {
          skillId: "fixture.page",
          action: "execute_fixture",
          steps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.fixture",
              jsPath: "src/page-hook.js",
              runAt: "document_idle"
            }
          ]
        },
        module: {
          id: "fixture.page.execute",
          source: `
            exports.default = async ({ ctx, input }) => ({
              query: input.query,
              tabUrl: ctx.tab.url,
              installationCount: ctx.site.installations.length
            });
          `
        },
        verifier: "page_hook_ok"
      })
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
            installationCount: 1
          },
          installationId: "bbl-next.page-hook.fixture:1",
          installedScriptId: "bbl-next.page-hook.fixture",
          tabUrl: "https://fixture.test/demo",
          installCount: 1
        },
        trace: [
          "match:fixture.page",
          "plan:1_steps",
          "install:main:bbl-next.page-hook.fixture",
          "invoke:execute_fixture",
          "verify:page_hook_ok"
        ]
      }
    });

    expect(harness.tabsApi.query).toHaveBeenCalledWith({
      active: true,
      lastFocusedWindow: true
    });

    await expect(
      harness.runtimeApi.sendMessage({
        target: RUNNER_BACKGROUND_TARGET,
        kind: "runtime.diagnostics",
        tabId: 11,
        world: "main"
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "healthy",
        bridge: {
          hostReady: true,
          offscreenPresent: true
        },
        site: {
          status: "healthy",
          tabId: 11,
          world: "main",
          snapshot: {
            installs: [
              expect.objectContaining({
                installationId: "bbl-next.page-hook.fixture:1"
              })
            ],
            invocations: [
              expect.objectContaining({
                action: "execute_fixture",
                installationId: "bbl-next.page-hook.fixture:1"
              })
            ],
            verifications: [
              {
                action: "execute_fixture",
                verified: true
              }
            ]
          }
        }
      }
    });

    dispose();
    harness.cleanup();
  });

  it("rejects site runtime invoke when the target tab is not active", async () => {
    const harness = createIntegratedChromeHarness({
      activeTab: {
        id: 12,
        url: "https://fixture.test/other"
      },
      host: {
        dispatch: vi.fn(async () => ({
          kind: "health_result",
          ok: true,
          health: {
            status: "idle",
            inflightCount: 0,
            consecutiveFailures: 0
          }
        })),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0
        }))
      }
    });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50,
      pageHookBridge: createPageHookBridge({
        chromeApi: harness.chromeApi
      })
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
          active: true
        },
        input: {},
        plan: {
          skillId: "fixture.page",
          action: "execute_fixture",
          steps: []
        },
        module: {
          id: "fixture.page.execute",
          source: "exports.default = async () => ({ ok: true });"
        }
      })
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_BAD_INPUT",
        message: "Site runtime invoke target must be the active tab"
      }
    });

    expect(harness.tabsApi.query).toHaveBeenCalledWith({
      active: true,
      lastFocusedWindow: true
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
            consecutiveFailures: 0
          }))
        },
        autoRegisterOffscreen: false,
        hangOffscreen: true
      }).chromeApi,
      timeoutMs: 5
    });

    await expect(bridge.ensureHost()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_TIMEOUT"
      }
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
              consecutiveFailures: 0
            }
          };
        }
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: true,
          result: {
            result: "ok",
            durationMs: 1
          }
        };
      }),
      getHealth: vi.fn(() => ({
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0
      }))
    }));
    const harness = createChromeHarness({ createHost });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50
    });

    await expect(bridge.ensureHost()).resolves.toMatchObject({
      ok: true,
      data: {
        bridge: {
          recovered: false,
          hostReady: true
        }
      }
    });

    harness.dropOffscreenListener();

    await expect(bridge.ensureHost()).resolves.toMatchObject({
      ok: true,
      data: {
        ready: true,
        bridge: {
          recovered: true,
          recoveryReason: "ensure_failed",
          hostReady: true
        }
      }
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
                consecutiveFailures: 1
              }
            };
          }
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: true,
            result: {
              result: "ok",
              durationMs: 1
            }
          };
        }),
        getHealth: vi.fn(() => ({
          status: "degraded",
          inflightCount: 0,
          consecutiveFailures: 1
        }))
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
                consecutiveFailures: 0
              }
            };
          }
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: true,
            result: {
              result: "ok",
              durationMs: 1
            }
          };
        }),
        getHealth: vi.fn(() => ({
          status: "idle",
          inflightCount: 0,
          consecutiveFailures: 0
        }))
      }));
    const harness = createChromeHarness({ createHost });
    const bridge = createBackgroundRunnerBridge({
      chromeApi: harness.chromeApi,
      timeoutMs: 50
    });

    await expect(bridge.ensureHost()).resolves.toMatchObject({
      ok: true,
      data: {
        health: {
          status: "idle"
        },
        bridge: {
          recovered: true,
          recoveryReason: "unhealthy_host",
          hostReady: true
        }
      }
    });

    expect(harness.offscreenApi.closeDocument).toHaveBeenCalledTimes(1);
    expect(harness.offscreenApi.createDocument).toHaveBeenCalledTimes(2);
    expect(createHost).toHaveBeenCalledTimes(2);
    harness.cleanup();
  });

  it("injects, invokes, and verifies the page hook through chrome.scripting", async () => {
    const harness = createScriptingHarness();
    const bridge = createPageHookBridge({
      chromeApi: harness.chromeApi
    });
    const step = {
      world: "main" as const,
      scriptId: "bbl-next.page-hook.fixture",
      jsPath: "src/page-hook.js",
      runAt: "document_idle" as const
    };
    const activeTab = {
      tabId: 21,
      url: "https://fixture.test/demo",
      active: true
    };

    const installation = await bridge.install(step, activeTab);
    const result = await bridge.invoke({
      installation: {
        step,
        result: installation
      },
      action: "execute_fixture",
      input: {
        query: "bridge"
      },
      tab: activeTab,
      ctx: {
        tab: activeTab
      }
    });
    const verified = await bridge.verify({
      installation: {
        step,
        result: installation
      },
      action: "execute_fixture",
      result,
      tab: activeTab
    });
    const state = await bridge.snapshotState({
      tabId: activeTab.tabId,
      world: "main"
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
        url: "https://fixture.test/demo"
      }
    });
    expect(result).toMatchObject({
      ok: true,
      action: "execute_fixture",
      installationId: "bbl-next.page-hook.fixture:1",
      installedScriptId: "bbl-next.page-hook.fixture",
      input: {
        query: "bridge"
      }
    });
    expect(verified).toBe(true);
    expect(state).toMatchObject({
      installs: [
        expect.objectContaining({
          installationId: "bbl-next.page-hook.fixture:1",
          scriptId: "bbl-next.page-hook.fixture"
        })
      ],
      invocations: [
        expect.objectContaining({
          installationId: "bbl-next.page-hook.fixture:1",
          action: "execute_fixture"
        })
      ],
      verifications: [
        {
          action: "execute_fixture",
          verified: true
        }
      ]
    });
    expect(harness.chromeApi.scripting.executeScript).toHaveBeenCalled();
  });
});
