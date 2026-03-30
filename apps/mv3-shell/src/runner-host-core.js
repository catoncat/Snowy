function createRunnerError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function normalizeRunnerError(error) {
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

function createHostAdapterError(request, reason, message, code = "E_RUNTIME") {
  return {
    ok: false,
    error: {
      code,
      message,
      details: {
        kind: request.kind,
        hostId: request.hostId ?? null,
        reason
      }
    }
  };
}

export function createRunnerHostCore({ hostAdapter } = {}) {
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
    inflight.set(requestId, {
      requestId,
      controller,
      abort
    });

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

  async function dispatchHostOperation(request) {
    if (!hostAdapter) {
      return createHostAdapterError(
        request,
        "adapter_missing",
        `Execution host adapter is not configured for ${request.kind}`
      );
    }

    const handler = hostAdapter[request.kind];
    if (typeof handler !== "function") {
      return createHostAdapterError(
        request,
        "operation_not_supported",
        `Execution host adapter does not implement ${request.kind}`,
        "E_CAPABILITY_NOT_FOUND"
      );
    }

    try {
      return await handler(request);
    } catch (error) {
      return {
        ok: false,
        error: normalizeRunnerError(error)
      };
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
            error: normalizeRunnerError(error)
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
      case "read":
      case "write":
      case "edit":
      case "exec":
        return dispatchHostOperation(request);
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
