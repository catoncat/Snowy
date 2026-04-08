import { createCompositeHostAdapter, createRunnerHostCore } from "@bbl-next/js-runner";
import { RUNNER_OFFSCREEN_TARGET } from "./background.js";
import { createLocalHostAdapter } from "./local-host-adapter.js";

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

export function createOffscreenRunnerBridge({
  runtimeApi = globalThis.chrome?.runtime,
  remoteHostAdapter,
  createHost = () => {
    const local = createLocalHostAdapter();
    const hostAdapter = remoteHostAdapter
      ? createCompositeHostAdapter({ local, remote: remoteHostAdapter })
      : local;
    return createRunnerHostCore({ hostAdapter });
  },
  target = RUNNER_OFFSCREEN_TARGET,
} = {}) {
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

export function startOffscreenRunnerBridge(options = {}) {
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
