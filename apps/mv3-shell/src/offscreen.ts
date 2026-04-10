// @ts-nocheck
import { createRunnerHostCore } from "@bbl-next/js-runner";
import { RUNNER_BACKGROUND_TARGET, RUNNER_OFFSCREEN_TARGET } from "./background.js";
import { createLocalHostAdapter } from "./local-host-adapter.js";

const LOCAL_HOST_ID = "local";
const REMOTE_HOST_ID = "remote";

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

export function createDefaultOffscreenRunnerHost({
  runtimeApi = globalThis.chrome?.runtime,
  remoteHostAdapter,
}: any = {}) {
  const local = createLocalHostAdapter();
  const remote = remoteHostAdapter ?? createBackgroundRemoteExecAdapter({ runtimeApi });
  const hostAdapter = {
    read(request) {
      if (request.hostId === REMOTE_HOST_ID) {
        return remote?.read?.(request) ?? createOperationNotSupportedError(request, "read");
      }
      return local?.read?.(request) ?? createOperationNotSupportedError(request, "read");
    },
    write(request) {
      if (request.hostId === REMOTE_HOST_ID) {
        return remote?.write?.(request) ?? createOperationNotSupportedError(request, "write");
      }
      return local?.write?.(request) ?? createOperationNotSupportedError(request, "write");
    },
    edit(request) {
      if (request.hostId === REMOTE_HOST_ID) {
        return remote?.edit?.(request) ?? createOperationNotSupportedError(request, "edit");
      }
      return local?.edit?.(request) ?? createOperationNotSupportedError(request, "edit");
    },
    exec(request) {
      if (request.hostId === REMOTE_HOST_ID) {
        return remote?.exec?.(request) ?? createOperationNotSupportedError(request, "exec");
      }
      if (request.hostId === LOCAL_HOST_ID) {
        return local?.exec?.(request) ?? createOperationNotSupportedError(request, "exec");
      }
      return createOperationNotSupportedError(request, "exec");
    },
  };
  return createRunnerHostCore({ hostAdapter });
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
