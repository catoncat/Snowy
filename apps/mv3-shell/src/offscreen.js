import { RUNNER_OFFSCREEN_TARGET } from "./background.js";
import { createRunnerHostCore } from "./runner-host-core.js";

function toBridgeError(error, fallbackCode = "E_RUNTIME") {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return {
      code: error.code,
      message: error.message,
      details: "details" in error ? error.details : undefined
    };
  }
  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: error.message
    };
  }
  return {
    code: fallbackCode,
    message: "Unknown offscreen bridge error",
    details: error
  };
}

export function createOffscreenRunnerBridge({
  runtimeApi = globalThis.chrome?.runtime,
  createHost = () => createRunnerHostCore(),
  target = RUNNER_OFFSCREEN_TARGET
} = {}) {
  const host = createHost();

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
            health: typeof host.getHealth === "function" ? host.getHealth() : null
          }
        };
      case "runner.invoke":
        return {
          ok: true,
          data: await host.dispatch({
            kind: "invoke",
            requestId: message.requestId,
            invocation: message.invocation
          })
        };
      case "runner.cancel":
        return {
          ok: true,
          data: await host.dispatch({
            kind: "cancel",
            requestId: message.requestId,
            targetRequestId: message.targetRequestId
          })
        };
      case "runner.health":
        return {
          ok: true,
          data: await host.dispatch({
            kind: "health",
            requestId: message.requestId
          })
        };
      default:
        return {
          ok: false,
          error: {
            code: "E_RUNTIME",
            message: `Unknown offscreen runner message: ${message.kind}`
          }
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
            error: toBridgeError(error)
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
    registerRuntimeListener
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
    dispose
  };
}

if (globalThis.chrome?.runtime?.onMessage) {
  startOffscreenRunnerBridge();
}
