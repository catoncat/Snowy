// @ts-nocheck
import { createRunnerHostCore } from "@bbl-next/js-runner";
import { RUNNER_BACKGROUND_TARGET, RUNNER_OFFSCREEN_TARGET } from "./background.js";
import { createLocalHostAdapter } from "./local-host-adapter.js";

const LOCAL_HOST_ID = "local";
const RUNNER_SANDBOX_TARGET = "bbl-next.runner.sandbox";
const RUNNER_SANDBOX_RESULT_TARGET = "bbl-next.runner.sandbox.result";
const RUNNER_SANDBOX_PAGE_PATH = "runner-sandbox.html";

function isRemoteHostId(hostId) {
  return typeof hostId === "string" && hostId.trim().length > 0 && hostId !== LOCAL_HOST_ID;
}

function toBridgeError(error, fallbackCode = "E_RUNTIME") {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return {
      code: error.code,
      message: error.message,
      details: "details" in error ? error.details : undefined,
    };
  }
  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: error.message,
    };
  }
  return {
    code: fallbackCode,
    message: "Unknown offscreen bridge error",
    details: error,
  };
}

function createOperationNotSupportedError(request, kind = "exec") {
  return {
    ok: false,
    error: {
      code: "E_CAPABILITY_NOT_FOUND",
      message: `Execution host adapter does not implement ${kind}`,
      details: {
        kind,
        hostId: request.hostId ?? null,
        reason: "operation_not_supported",
      },
    },
  };
}

function createBackgroundRemoteExecAdapter({ runtimeApi, target = RUNNER_BACKGROUND_TARGET } = {}) {
  return {
    async exec(request) {
      if (!runtimeApi?.sendMessage) {
        return createOperationNotSupportedError(request);
      }
      try {
        const response = await runtimeApi.sendMessage({
          target,
          kind: "runner.remote_exec",
          requestId: request.requestId,
          hostId: request.hostId,
          command: request.command,
          timeoutMs: request.timeoutMs,
        });
        if (response?.ok === true) {
          return response.data;
        }
        return (
          response ?? {
            ok: false,
            error: {
              code: "E_RUNTIME",
              message: "Remote exec bridge unavailable",
              details: {
                kind: "exec",
                hostId: request.hostId ?? null,
                reason: "remote_exec_failed",
              },
            },
          }
        );
      } catch (error) {
        return {
          ok: false,
          error: {
            ...toBridgeError(error),
            details: {
              kind: "exec",
              hostId: request.hostId ?? null,
              reason: "remote_exec_failed",
            },
          },
        };
      }
    },
  };
}

function canUseSandboxedRunner() {
  return (
    typeof globalThis.document?.createElement === "function" &&
    typeof globalThis.window?.addEventListener === "function" &&
    typeof globalThis.location?.href === "string"
  );
}

function toSandboxValue(value, seen = new WeakSet()) {
  if (value == null || typeof value !== "object") {
    return typeof value === "function" ? undefined : value;
  }
  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => toSandboxValue(item, seen));
  }
  const next = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "function") {
      continue;
    }
    const normalized = toSandboxValue(item, seen);
    if (normalized !== undefined) {
      next[key] = normalized;
    }
  }
  return next;
}

function createSandboxedModuleRunner({
  runtimeApi = globalThis.chrome?.runtime,
  sandboxPath = RUNNER_SANDBOX_PAGE_PATH,
  backgroundTarget = RUNNER_BACKGROUND_TARGET,
} = {}) {
  if (!canUseSandboxedRunner()) {
    return null;
  }

  let iframePromise = null;
  const pendingInvocations = new Map();

  function sandboxUrl() {
    return new URL(sandboxPath, globalThis.location.href).toString();
  }

  function resolvePending(message) {
    const pending = pendingInvocations.get(message.requestId);
    if (!pending) {
      return;
    }
    pendingInvocations.delete(message.requestId);
    if (message.ok === true) {
      pending.resolve(message);
      return;
    }
    pending.resolve(message);
  }

  async function routeCapabilityCall(message, source) {
    let response = null;
    try {
      if (!runtimeApi?.sendMessage) {
        response = {
          ok: false,
          error: {
            code: "E_RUNTIME",
            message: "Runtime messaging is unavailable for sandbox capability calls",
          },
        };
      } else {
        response = await runtimeApi.sendMessage({
          target: backgroundTarget,
          kind: "runner.capability_call",
          gatewayId: message.gatewayId,
          capabilityId: message.capabilityId,
          input: message.input,
        });
      }
    } catch (error) {
      response = {
        ok: false,
        error: toBridgeError(error),
      };
    }
    source?.postMessage(
      {
        target: RUNNER_SANDBOX_TARGET,
        kind: "runner.capability_result",
        callId: message.callId,
        response,
      },
      "*",
    );
  }

  function handleSandboxMessage(event) {
    const message = event.data;
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.target === RUNNER_SANDBOX_RESULT_TARGET) {
      resolvePending(message);
      return;
    }
    if (message.target === RUNNER_OFFSCREEN_TARGET && message.kind === "runner.capability_call") {
      void routeCapabilityCall(message, event.source);
    }
  }

  globalThis.window.addEventListener("message", handleSandboxMessage);

  function ensureIframe() {
    if (!iframePromise) {
      iframePromise = new Promise((resolve, reject) => {
        const iframe = globalThis.document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = sandboxUrl();
        iframe.addEventListener("load", () => resolve(iframe), { once: true });
        iframe.addEventListener("error", () => reject(new Error("Runner sandbox failed to load")), {
          once: true,
        });
        globalThis.document.body.appendChild(iframe);
      });
    }
    return iframePromise;
  }

  async function invoke(requestId, invocation) {
    const iframe = await ensureIframe();
    if (!iframe.contentWindow) {
      return {
        ok: false,
        error: {
          code: "E_RUNTIME",
          message: "Runner sandbox iframe is not ready",
        },
      };
    }
    const sandboxedInvocation = {
      module: invocation.module,
      input: toSandboxValue(invocation.input),
      ctx: toSandboxValue(invocation.ctx ?? {}),
    };
    const response = new Promise((resolve) => {
      pendingInvocations.set(requestId, { resolve });
    });
    iframe.contentWindow.postMessage(
      {
        target: RUNNER_SANDBOX_TARGET,
        kind: "runner.invoke",
        requestId,
        invocation: sandboxedInvocation,
        gatewayId: invocation.gatewayId ?? null,
      },
      "*",
    );
    return response;
  }

  return {
    invoke,
  };
}

export function createDefaultOffscreenRunnerHost({
  runtimeApi = globalThis.chrome?.runtime,
  remoteHostAdapter,
}: any = {}) {
  const local = createLocalHostAdapter();
  const remote = remoteHostAdapter ?? createBackgroundRemoteExecAdapter({ runtimeApi });
  const hostAdapter = {
    read(request) {
      if (isRemoteHostId(request.hostId)) {
        return remote?.read?.(request) ?? createOperationNotSupportedError(request, "read");
      }
      return local?.read?.(request) ?? createOperationNotSupportedError(request, "read");
    },
    write(request) {
      if (isRemoteHostId(request.hostId)) {
        return remote?.write?.(request) ?? createOperationNotSupportedError(request, "write");
      }
      return local?.write?.(request) ?? createOperationNotSupportedError(request, "write");
    },
    edit(request) {
      if (isRemoteHostId(request.hostId)) {
        return remote?.edit?.(request) ?? createOperationNotSupportedError(request, "edit");
      }
      return local?.edit?.(request) ?? createOperationNotSupportedError(request, "edit");
    },
    exec(request) {
      if (isRemoteHostId(request.hostId)) {
        return remote?.exec?.(request) ?? createOperationNotSupportedError(request, "exec");
      }
      if (request.hostId === LOCAL_HOST_ID) {
        return local?.exec?.(request) ?? createOperationNotSupportedError(request, "exec");
      }
      return createOperationNotSupportedError(request, "exec");
    },
  };
  const core = createRunnerHostCore({ hostAdapter });
  const sandboxedRunner = createSandboxedModuleRunner({ runtimeApi });
  return {
    async dispatch(request) {
      if (request.kind === "invoke" && sandboxedRunner) {
        try {
          const response = await sandboxedRunner.invoke(request.requestId, request.invocation);
          if (response?.ok === true) {
            return {
              kind: "invoke_result",
              requestId: request.requestId,
              ok: true,
              result: response.result,
            };
          }
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: false,
            error: response?.error ?? {
              code: "E_RUNTIME",
              message: "Runner sandbox invocation failed",
            },
          };
        } catch (error) {
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: false,
            error: toBridgeError(error),
          };
        }
      }
      return core.dispatch(request);
    },
    getHealth() {
      return core.getHealth();
    },
  };
}

export function createOffscreenRunnerBridge({
  runtimeApi = globalThis.chrome?.runtime,
  remoteHostAdapter,
  createHost = () => createDefaultOffscreenRunnerHost({ runtimeApi, remoteHostAdapter }),
  target = RUNNER_OFFSCREEN_TARGET,
}: any = {}): any {
  const host = createHost();

  async function dispatchHostOperation(kind, message) {
    const operation = kind.replace("host.", "");
    const response = await host.dispatch({
      kind: operation,
      requestId: message.requestId,
      hostId: message.hostId,
      path: message.path,
      content: message.content,
      patch: message.patch,
      command: message.command,
      timeoutMs: message.timeoutMs,
    });
    if (response && typeof response === "object" && response.ok === false) {
      return {
        ok: false,
        error: response.error ?? {
          code: "E_RUNTIME",
          message: `Execution host operation failed: ${kind}`,
        },
      };
    }
    return {
      ok: true,
      data: response,
    };
  }

  async function handleMessage(message) {
    if (!message || message.target !== target) {
      return undefined;
    }
    switch (message.kind) {
      case "runner.ensure_host":
        return {
          ok: true,
          data: {
            ready: true,
            health: typeof host.getHealth === "function" ? host.getHealth() : null,
          },
        };
      case "runner.diagnostics":
        return {
          ok: true,
          data: {
            ready: true,
            health: typeof host.getHealth === "function" ? host.getHealth() : null,
          },
        };
      case "runner.invoke":
        return {
          ok: true,
          data: await host.dispatch({
            kind: "invoke",
            requestId: message.requestId,
            invocation: message.invocation,
          }),
        };
      case "runner.cancel":
        return {
          ok: true,
          data: await host.dispatch({
            kind: "cancel",
            requestId: message.requestId,
            targetRequestId: message.targetRequestId,
          }),
        };
      case "runner.health":
        return {
          ok: true,
          data: await host.dispatch({
            kind: "health",
            requestId: message.requestId,
          }),
        };
      case "host.read":
      case "host.write":
      case "host.edit":
      case "host.exec":
        return dispatchHostOperation(message.kind, message);
      default:
        return {
          ok: false,
          error: {
            code: "E_RUNTIME",
            message: `Unknown offscreen runner message: ${message.kind}`,
          },
        };
    }
  }

  function registerRuntimeListener() {
    if (!runtimeApi?.onMessage?.addListener) {
      return () => {};
    }
    const listener = (message, _sender, sendResponse) => {
      if (!message || message.target !== target) {
        return undefined;
      }
      Promise.resolve(handleMessage(message))
        .then((response) => {
          sendResponse(response);
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: toBridgeError(error),
          });
        });
      return true;
    };
    runtimeApi.onMessage.addListener(listener);
    return () => {
      runtimeApi.onMessage.removeListener(listener);
    };
  }

  return {
    host,
    handleMessage,
    registerRuntimeListener,
  };
}

export function startOffscreenRunnerBridge(options: any = {}): any {
  const runtimeApi = options.runtimeApi ?? globalThis.chrome?.runtime;
  if (!runtimeApi?.onMessage?.addListener) {
    return null;
  }
  const bridge = createOffscreenRunnerBridge({ runtimeApi, ...options });
  const dispose = bridge.registerRuntimeListener();
  return {
    bridge,
    dispose,
  };
}

if (globalThis.chrome?.runtime?.onMessage) {
  startOffscreenRunnerBridge();
}
