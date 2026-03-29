import { RUNNER_OFFSCREEN_TARGET } from "./background.js";

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

function createRunnerError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function createLocalJsRunnerHost() {
  const inflight = new Map();
  const health = {
    lastRequestAt: undefined,
    lastSuccessAt: undefined,
    lastFailureAt: undefined,
    consecutiveFailures: 0
  };

  function currentStatus() {
    if (health.consecutiveFailures > 0) {
      return "degraded";
    }
    if (inflight.size > 0) {
      return "busy";
    }
    return "idle";
  }

  function getHealth() {
    return {
      status: currentStatus(),
      inflightCount: inflight.size,
      ...health
    };
  }

  function loadModule(module) {
    const exportsObject = {};
    const moduleObject = { exports: exportsObject };
    const factory = new Function(
      "exports",
      "module",
      `"use strict";\n${module.source}\nreturn module.exports;`
    );
    return factory(exportsObject, moduleObject);
  }

  function normalizeError(error) {
    if (error && typeof error === "object" && "code" in error && "message" in error) {
      return {
        code: error.code,
        message: error.message,
        details: "details" in error ? error.details : undefined
      };
    }
    if (error instanceof Error) {
      return {
        code: "E_RUNTIME",
        message: error.message
      };
    }
    return {
      code: "E_RUNTIME",
      message: "Unknown runner error",
      details: error
    };
  }

  function abortPromise(signal, getAbortReason) {
    return new Promise((_, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          const reason = getAbortReason() ?? "cancelled";
          reject(
            createRunnerError(
              "E_TIMEOUT",
              reason === "deadline_exceeded"
                ? "Runner invocation timed out"
                : "Runner invocation cancelled",
              { reason }
            )
          );
        },
        { once: true }
      );
    });
  }

  async function executeInvocation(requestId, invocation) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutMs = invocation.timeoutMs ?? 30_000;
    let abortReason;
    const abort = (reason) => {
      if (controller.signal.aborted) {
        return;
      }
      abortReason = reason;
      controller.abort(reason);
    };
    const record = {
      requestId,
      controller,
      abort
    };
    inflight.set(requestId, record);
    const timeoutId = setTimeout(() => {
      abort("deadline_exceeded");
    }, timeoutMs);
    const onAbort = () => {
      abort("cancelled");
    };
    invocation.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const loaded = loadModule(invocation.module);
      const exportName = invocation.module.exportName ?? "default";
      const handler = loaded[exportName];
      if (typeof handler !== "function") {
        throw createRunnerError(
          "E_RUNTIME",
          `Runner export is not callable: ${invocation.module.id}#${exportName}`
        );
      }
      const result = await Promise.race([
        Promise.resolve(
          handler({
            ctx: invocation.ctx,
            input: invocation.input,
            signal: controller.signal
          })
        ),
        abortPromise(controller.signal, () => abortReason)
      ]);
      return {
        result,
        durationMs: Date.now() - startedAt
      };
    } finally {
      clearTimeout(timeoutId);
      invocation.signal?.removeEventListener("abort", onAbort);
      inflight.delete(requestId);
    }
  }

  async function dispatch(request) {
    switch (request.kind) {
      case "invoke":
        health.lastRequestAt = new Date().toISOString();
        try {
          const result = await executeInvocation(request.requestId, request.invocation);
          health.lastSuccessAt = new Date().toISOString();
          health.consecutiveFailures = 0;
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: true,
            result
          };
        } catch (error) {
          health.lastFailureAt = new Date().toISOString();
          health.consecutiveFailures += 1;
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: false,
            error: normalizeError(error)
          };
        }
      case "cancel": {
        const target = inflight.get(request.targetRequestId);
        if (target) {
          target.abort("cancelled");
        }
        return {
          kind: "cancel_result",
          requestId: request.requestId,
          ok: true,
          targetRequestId: request.targetRequestId,
          cancelled: target != null
        };
      }
      case "health":
        return {
          kind: "health_result",
          requestId: request.requestId,
          ok: true,
          health: getHealth()
        };
      default:
        return {
          kind: "invoke_result",
          requestId: request.requestId,
          ok: false,
          error: {
            code: "E_RUNTIME",
            message: `Unknown runner request: ${request.kind}`
          }
        };
    }
  }

  return {
    dispatch,
    getHealth
  };
}

export function createOffscreenRunnerBridge({
  runtimeApi = globalThis.chrome?.runtime,
  createHost = () => createLocalJsRunnerHost(),
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
