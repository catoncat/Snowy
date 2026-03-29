import { CapabilityError, type CapabilityErrorCode } from "@bbl-next/contracts";
import { createRunnerHostCore } from "./runner-host-core.js";

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

interface RunnerHostCore {
  dispatch(request: RunnerRpcRequest): Promise<RunnerRpcResponse>;
  getHealth(): RunnerHostHealth;
}

export class JsRunnerHost {
  readonly #core: RunnerHostCore;
  #requestSequence = 0;

  constructor() {
    this.#core = createRunnerHostCore() as RunnerHostCore;
  }

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
    return this.#core.dispatch(request);
  }

  getHealth(): RunnerHostHealth {
    return this.#core.getHealth();
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

  #nextRequestId(): RunnerRequestId {
    this.#requestSequence += 1;
    return `runner-${this.#requestSequence}`;
  }
}
