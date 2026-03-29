import { CapabilityError, type CapabilityErrorCode } from "@bbl-next/contracts";

export interface RunnerModule {
  id: string;
  source: string;
  exportName?: string;
}

export type RunnerRequestId = string;
export type RunnerInvocationState = "running" | "succeeded" | "failed";
export type RunnerHostStatus = "idle" | "busy" | "degraded";
export type RunnerAbortReason = "deadline_exceeded" | "cancelled";

export interface RunnerInvocation {
  module: RunnerModule;
  input: unknown;
  ctx: Record<string, unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RunnerInvocationResult {
  result: unknown;
  durationMs: number;
}

export interface RunnerHostHealth {
  status: RunnerHostStatus;
  inflightCount: number;
  lastRequestAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  consecutiveFailures: number;
}

export interface RunnerInvokeRpcRequest {
  kind: "invoke";
  requestId: RunnerRequestId;
  invocation: RunnerInvocation;
}

export interface RunnerCancelRpcRequest {
  kind: "cancel";
  requestId: RunnerRequestId;
  targetRequestId: RunnerRequestId;
}

export interface RunnerHealthRpcRequest {
  kind: "health";
  requestId: RunnerRequestId;
}

export type RunnerRpcRequest =
  | RunnerInvokeRpcRequest
  | RunnerCancelRpcRequest
  | RunnerHealthRpcRequest;

export interface RunnerInvokeSuccessResponse {
  kind: "invoke_result";
  requestId: RunnerRequestId;
  ok: true;
  result: RunnerInvocationResult;
}

export interface RunnerInvokeErrorResponse {
  kind: "invoke_result";
  requestId: RunnerRequestId;
  ok: false;
  error: {
    code: CapabilityErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface RunnerCancelResponse {
  kind: "cancel_result";
  requestId: RunnerRequestId;
  ok: true;
  targetRequestId: RunnerRequestId;
  cancelled: boolean;
}

export interface RunnerHealthResponse {
  kind: "health_result";
  requestId: RunnerRequestId;
  ok: true;
  health: RunnerHostHealth;
}

export type RunnerRpcResponse =
  | RunnerInvokeSuccessResponse
  | RunnerInvokeErrorResponse
  | RunnerCancelResponse
  | RunnerHealthResponse;

interface InflightInvocationRecord {
  requestId: RunnerRequestId;
  controller: AbortController;
  moduleId: string;
  timeoutMs: number;
  startedAt: string;
  state: RunnerInvocationState;
  abort(reason: RunnerAbortReason): void;
}

function abortPromise(
  signal: AbortSignal,
  getAbortReason: () => RunnerAbortReason | undefined
): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        const reason = getAbortReason() ?? "cancelled";
        reject(
          new CapabilityError(
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

export class JsRunnerHost {
  readonly #inflight = new Map<RunnerRequestId, InflightInvocationRecord>();
  #requestSequence = 0;
  readonly #health: Omit<RunnerHostHealth, "status" | "inflightCount"> = {
    lastRequestAt: undefined,
    lastSuccessAt: undefined,
    lastFailureAt: undefined,
    consecutiveFailures: 0
  };

  async invoke(request: RunnerInvocation): Promise<RunnerInvocationResult> {
    const response = await this.dispatch({
      kind: "invoke",
      requestId: this.#nextRequestId(),
      invocation: request
    });
    if (response.kind !== "invoke_result") {
      throw new CapabilityError("E_RUNTIME", "Unexpected RPC response for invoke");
    }
    if (response.ok) {
      return response.result;
    }
    throw new CapabilityError(response.error.code, response.error.message, response.error.details);
  }

  async dispatch(request: RunnerRpcRequest): Promise<RunnerRpcResponse> {
    switch (request.kind) {
      case "invoke":
        return this.#dispatchInvoke(request);
      case "cancel":
        return this.#dispatchCancel(request);
      case "health":
        return {
          kind: "health_result",
          requestId: request.requestId,
          ok: true,
          health: this.getHealth()
        };
    }
  }

  getHealth(): RunnerHostHealth {
    return {
      status: this.#currentStatus(),
      inflightCount: this.#inflight.size,
      ...this.#health
    };
  }

  async cancel(targetRequestId: RunnerRequestId): Promise<{ cancelled: boolean }> {
    const response = await this.dispatch({
      kind: "cancel",
      requestId: this.#nextRequestId(),
      targetRequestId
    });
    if (response.kind !== "cancel_result") {
      throw new CapabilityError("E_RUNTIME", "Unexpected RPC response for cancel");
    }
    return {
      cancelled: response.cancelled
    };
  }

  #loadModule(module: RunnerModule): Record<string, unknown> {
    const exportsObject: Record<string, unknown> = {};
    const moduleObject: { exports: Record<string, unknown> } = {
      exports: exportsObject
    };
    const factory = new Function(
      "exports",
      "module",
      `"use strict";\n${module.source}\nreturn module.exports;`
    ) as (
      exportsObject: Record<string, unknown>,
      moduleObject: { exports: Record<string, unknown> }
    ) => Record<string, unknown>;
    return factory(exportsObject, moduleObject);
  }

  async #dispatchInvoke(request: RunnerInvokeRpcRequest): Promise<RunnerRpcResponse> {
    this.#health.lastRequestAt = new Date().toISOString();
    try {
      const result = await this.#executeInvocation(request.requestId, request.invocation);
      this.#health.lastSuccessAt = new Date().toISOString();
      this.#health.consecutiveFailures = 0;
      return {
        kind: "invoke_result",
        requestId: request.requestId,
        ok: true,
        result
      };
    } catch (error) {
      const normalized = this.#normalizeError(error);
      this.#health.lastFailureAt = new Date().toISOString();
      this.#health.consecutiveFailures += 1;
      return {
        kind: "invoke_result",
        requestId: request.requestId,
        ok: false,
        error: normalized
      };
    }
  }

  async #dispatchCancel(request: RunnerCancelRpcRequest): Promise<RunnerCancelResponse> {
    const target = this.#inflight.get(request.targetRequestId);
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

  async #executeInvocation(
    requestId: RunnerRequestId,
    request: RunnerInvocation
  ): Promise<RunnerInvocationResult> {
    const startedAt = Date.now();
    const startedAtIso = new Date(startedAt).toISOString();
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? 30_000;
    let abortReason: RunnerAbortReason | undefined;
    const abort = (reason: RunnerAbortReason) => {
      if (controller.signal.aborted) {
        return;
      }
      abortReason = reason;
      controller.abort(reason);
    };
    const record: InflightInvocationRecord = {
      requestId,
      controller,
      moduleId: request.module.id,
      timeoutMs,
      startedAt: startedAtIso,
      state: "running",
      abort
    };
    this.#inflight.set(requestId, record);

    const timeout = setTimeout(() => {
      abort("deadline_exceeded");
    }, timeoutMs);
    const onAbort = () => {
      abort("cancelled");
    };
    request.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const module = this.#loadModule(request.module);
      const exportName = request.module.exportName ?? "default";
      const handler = module[exportName];
      if (typeof handler !== "function") {
        throw new CapabilityError(
          "E_RUNTIME",
          `Runner export is not callable: ${request.module.id}#${exportName}`
        );
      }
      const result = await Promise.race([
        Promise.resolve(handler({ ctx: request.ctx, input: request.input, signal: controller.signal })),
        abortPromise(controller.signal, () => abortReason)
      ]);
      record.state = "succeeded";
      return {
        result,
        durationMs: Date.now() - startedAt
      };
    } catch (error) {
      record.state = "failed";
      throw error;
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", onAbort);
      this.#inflight.delete(requestId);
    }
  }

  #normalizeError(error: unknown): {
    code: CapabilityErrorCode;
    message: string;
    details?: unknown;
  } {
    if (error instanceof CapabilityError) {
      return {
        code: error.code,
        message: error.message,
        details: error.details
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

  #currentStatus(): RunnerHostStatus {
    if (this.#health.consecutiveFailures > 0) {
      return "degraded";
    }
    if (this.#inflight.size > 0) {
      return "busy";
    }
    return "idle";
  }

  #nextRequestId(): RunnerRequestId {
    this.#requestSequence += 1;
    return `runner-${this.#requestSequence}`;
  }
}
