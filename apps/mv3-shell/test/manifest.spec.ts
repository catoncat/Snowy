import { readFileSync } from "node:fs";
import manifest from "../manifest.json";
// @ts-ignore source JS module has no declaration file yet
import { RUNNER_BACKGROUND_TARGET, RUNNER_OFFSCREEN_DOCUMENT_PATH, RUNNER_OFFSCREEN_REASONS, createBackgroundRunnerBridge } from "../src/background.js";
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
  autoRegisterOffscreen = true,
  hangOffscreen = false
}: {
  host: {
    dispatch: (request: unknown) => Promise<unknown>;
    getHealth: () => unknown;
  };
  autoRegisterOffscreen?: boolean;
  hangOffscreen?: boolean;
}) {
  const messageBus = createMessageBus();
  let hasOffscreen = false;
  let disposeOffscreen: null | (() => void) = null;
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

  const offscreenApi = {
    createDocument: vi.fn(async () => {
      hasOffscreen = true;
      if (autoRegisterOffscreen) {
        disposeOffscreen?.();
        disposeOffscreen = createOffscreenRunnerBridge({
          runtimeApi,
          createHost: () => host
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
      offscreen: offscreenApi
    },
    runtimeApi,
    offscreenApi,
    cleanup() {
      disposeOffscreen?.();
    }
  };
}

describe("mv3-shell manifest", () => {
  it("declares the MV3 offscreen-ready shell", () => {
    const hostPermissions = (manifest as { host_permissions?: string[] }).host_permissions ?? [];

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe("116");
    expect(manifest.permissions).toContain("offscreen");
    expect(hostPermissions).toEqual([]);
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
});
