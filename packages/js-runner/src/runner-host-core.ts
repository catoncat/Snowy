import type { CapabilityErrorCode } from "@bbl-next/contracts";
import type {
  RunnerAbortReason,
  RunnerHostAdapter,
  RunnerHostHealth,
  RunnerInvocation,
  RunnerInvocationResult,
  RunnerRpcRequest,
  RunnerRpcResponse,
} from "./index.js";

type RunnerError = Error & {
  code: CapabilityErrorCode;
  details?: unknown;
};

type InflightInvocation = {
  requestId: string;
  controller: AbortController;
  abort: (reason: RunnerAbortReason) => void;
};

type NormalizedRunnerError = {
  code: CapabilityErrorCode;
  message: string;
  details?: unknown;
};

type RunnerModuleHandlerInput = {
  ctx: RunnerInvocation["ctx"];
  input: RunnerInvocation["input"];
  signal: AbortSignal;
};

type RunnerModuleHandler = (input: RunnerModuleHandlerInput) => unknown;

const CAPABILITY_ERROR_CODES = new Set<CapabilityErrorCode>([
  "E_BAD_INPUT",
  "E_CAPABILITY_NOT_FOUND",
  "E_INTERVENTION_REQUIRED",
  "E_PERMISSION_DENIED",
  "E_REENTRANCY_BLOCKED",
  "E_RUNTIME",
  "E_TIMEOUT",
  "E_VERIFY_FAILED",
  "E_VFS_QUOTA_EXCEEDED",
]);

export interface RunnerHostCore {
  dispatch(request: RunnerRpcRequest): Promise<RunnerRpcResponse>;
  getHealth(): RunnerHostHealth;
}

function toCapabilityErrorCode(
  code: unknown,
  fallback: CapabilityErrorCode = "E_RUNTIME",
): CapabilityErrorCode {
  return typeof code === "string" && CAPABILITY_ERROR_CODES.has(code as CapabilityErrorCode)
    ? (code as CapabilityErrorCode)
    : fallback;
}

function createRunnerError(
  code: CapabilityErrorCode,
  message: string,
  details?: unknown,
): RunnerError {
  const error = new Error(message);
  return Object.assign(error, { code, details });
}

function normalizeRunnerError(error: unknown): NormalizedRunnerError {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return {
      code: toCapabilityErrorCode(error.code),
      message: String(error.message),
      details: "details" in error ? error.details : undefined,
    };
  }
  if (error instanceof Error) {
    return {
      code: "E_RUNTIME",
      message: error.message,
    };
  }
  return {
    code: "E_RUNTIME",
    message: "Unknown runner error",
    details: error,
  };
}

function abortPromise(signal: AbortSignal, getAbortReason: () => RunnerAbortReason | undefined) {
  return new Promise<never>((_, reject) => {
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
            { reason },
          ),
        );
      },
      { once: true },
    );
  });
}

function loadModule(module: { source: string }): Record<string, unknown> {
  const exportsObject: Record<string, unknown> = {};
  const moduleObject = { exports: exportsObject };
  const factory = new Function(
    "exports",
    "module",
    `"use strict";\n${module.source}\nreturn module.exports;`,
  );
  return factory(exportsObject, moduleObject);
}

function createHostAdapterError(
  request: Extract<RunnerRpcRequest, { kind: "read" | "write" | "edit" | "exec" }>,
  reason: string,
  message: string,
  code: CapabilityErrorCode = "E_RUNTIME",
) {
  return {
    ok: false as const,
    error: {
      code,
      message,
      details: {
        kind: request.kind,
        hostId: request.hostId ?? null,
        reason,
      },
    },
  };
}

export function createRunnerHostCore({
  hostAdapter,
}: {
  hostAdapter?: RunnerHostAdapter;
} = {}): RunnerHostCore {
  const inflight = new Map<string, InflightInvocation>();
  const health: Pick<
    RunnerHostHealth,
    "lastRequestAt" | "lastSuccessAt" | "lastFailureAt" | "consecutiveFailures"
  > = {
    lastRequestAt: undefined,
    lastSuccessAt: undefined,
    lastFailureAt: undefined,
    consecutiveFailures: 0,
  };

  function currentStatus(): RunnerHostHealth["status"] {
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
      ...health,
    };
  }

  async function executeInvocation(
    requestId: string,
    invocation: RunnerInvocation,
  ): Promise<RunnerInvocationResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutMs = invocation.timeoutMs ?? 30_000;
    let abortReason: RunnerAbortReason | undefined;
    const abort = (reason: RunnerAbortReason) => {
      if (controller.signal.aborted) {
        return;
      }
      abortReason = reason;
      controller.abort(reason);
    };
    inflight.set(requestId, {
      requestId,
      controller,
      abort,
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
          `Runner export is not callable: ${invocation.module.id}#${exportName}`,
        );
      }
      const callableHandler = handler as RunnerModuleHandler;
      const result = await Promise.race<unknown>([
        Promise.resolve(
          callableHandler({
            ctx: invocation.ctx,
            input: invocation.input,
            signal: controller.signal,
          }),
        ),
        abortPromise(controller.signal, () => abortReason),
      ]);
      return {
        result,
        durationMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(timeoutId);
      invocation.signal?.removeEventListener("abort", onAbort);
      inflight.delete(requestId);
    }
  }

  async function dispatchHostOperation(
    request: Extract<RunnerRpcRequest, { kind: "read" | "write" | "edit" | "exec" }>,
  ) {
    if (!hostAdapter) {
      return createHostAdapterError(
        request,
        "adapter_missing",
        `Execution host adapter is not configured for ${request.kind}`,
      );
    }

    try {
      switch (request.kind) {
        case "read":
          if (typeof hostAdapter.read !== "function") {
            return createHostAdapterError(
              request,
              "operation_not_supported",
              `Execution host adapter does not implement ${request.kind}`,
              "E_CAPABILITY_NOT_FOUND",
            );
          }
          return await hostAdapter.read(request);
        case "write":
          if (typeof hostAdapter.write !== "function") {
            return createHostAdapterError(
              request,
              "operation_not_supported",
              `Execution host adapter does not implement ${request.kind}`,
              "E_CAPABILITY_NOT_FOUND",
            );
          }
          return await hostAdapter.write(request);
        case "edit":
          if (typeof hostAdapter.edit !== "function") {
            return createHostAdapterError(
              request,
              "operation_not_supported",
              `Execution host adapter does not implement ${request.kind}`,
              "E_CAPABILITY_NOT_FOUND",
            );
          }
          return await hostAdapter.edit(request);
        case "exec":
          if (typeof hostAdapter.exec !== "function") {
            return createHostAdapterError(
              request,
              "operation_not_supported",
              `Execution host adapter does not implement ${request.kind}`,
              "E_CAPABILITY_NOT_FOUND",
            );
          }
          return await hostAdapter.exec(request);
      }
    } catch (error) {
      return {
        ok: false as const,
        error: normalizeRunnerError(error),
      };
    }
  }

  async function dispatch(request: RunnerRpcRequest): Promise<RunnerRpcResponse> {
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
            result,
          };
        } catch (error) {
          health.lastFailureAt = new Date().toISOString();
          health.consecutiveFailures += 1;
          return {
            kind: "invoke_result",
            requestId: request.requestId,
            ok: false,
            error: normalizeRunnerError(error),
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
          cancelled: target != null,
        };
      }
      case "health":
        return {
          kind: "health_result",
          requestId: request.requestId,
          ok: true,
          health: getHealth(),
        };
      case "read":
      case "write":
      case "edit":
      case "exec":
        return dispatchHostOperation(request);
      default: {
        const unknownRequest = request as never as { kind: string; requestId: string };
        return {
          kind: "invoke_result",
          requestId: unknownRequest.requestId,
          ok: false,
          error: {
            code: "E_RUNTIME",
            message: `Unknown runner request: ${unknownRequest.kind}`,
          },
        };
      }
    }
  }

  return {
    dispatch,
    getHealth,
  };
}
