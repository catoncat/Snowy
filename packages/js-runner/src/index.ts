import { CapabilityError, type CapabilityErrorCode } from "@bbl-next/contracts";
import { createRunnerHostCore } from "./runner-host-core.js";

export { createRunnerHostCore } from "./runner-host-core.js";
export type { RunnerHostCore } from "./runner-host-core.js";

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

export interface RunnerHostReadRequest {
  kind: "read";
  requestId: RunnerRequestId;
  hostId: string;
  path: string;
}

export interface RunnerHostWriteRequest {
  kind: "write";
  requestId: RunnerRequestId;
  hostId: string;
  path: string;
  content: string;
}

export interface RunnerHostEditRequest {
  kind: "edit";
  requestId: RunnerRequestId;
  hostId: string;
  path: string;
  patch: string;
}

export interface RunnerHostExecRequest {
  kind: "exec";
  requestId: RunnerRequestId;
  hostId: string;
  command: string;
  timeoutMs?: number;
}

export type RunnerRpcRequest =
  | RunnerInvokeRpcRequest
  | RunnerCancelRpcRequest
  | RunnerHealthRpcRequest
  | RunnerHostReadRequest
  | RunnerHostWriteRequest
  | RunnerHostEditRequest
  | RunnerHostExecRequest;

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

export interface RunnerHostReadResponse {
  hostId: string;
  path: string;
  content: string | null;
}

export interface RunnerHostWriteResponse {
  hostId: string;
  path: string;
  content: string;
}

export interface RunnerHostEditResponse {
  hostId: string;
  path: string;
  content: string;
}

export interface RunnerHostExecResponse {
  hostId: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunnerHostErrorResponse {
  ok: false;
  error: {
    code: CapabilityErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface RunnerHostAdapter {
  read?: (
    request: RunnerHostReadRequest,
  ) =>
    | Promise<RunnerHostReadResponse | RunnerHostErrorResponse>
    | RunnerHostReadResponse
    | RunnerHostErrorResponse;
  write?: (
    request: RunnerHostWriteRequest,
  ) =>
    | Promise<RunnerHostWriteResponse | RunnerHostErrorResponse>
    | RunnerHostWriteResponse
    | RunnerHostErrorResponse;
  edit?: (
    request: RunnerHostEditRequest,
  ) =>
    | Promise<RunnerHostEditResponse | RunnerHostErrorResponse>
    | RunnerHostEditResponse
    | RunnerHostErrorResponse;
  exec?: (
    request: RunnerHostExecRequest,
  ) =>
    | Promise<RunnerHostExecResponse | RunnerHostErrorResponse>
    | RunnerHostExecResponse
    | RunnerHostErrorResponse;
}

export type RunnerRpcResponse =
  | RunnerInvokeSuccessResponse
  | RunnerInvokeErrorResponse
  | RunnerCancelResponse
  | RunnerHealthResponse
  | RunnerHostReadResponse
  | RunnerHostWriteResponse
  | RunnerHostEditResponse
  | RunnerHostExecResponse
  | RunnerHostErrorResponse;

export interface CompositeHostAdapterOptions {
  local?: RunnerHostAdapter;
  remote?: RunnerHostAdapter;
}

export function createCompositeHostAdapter(
  options: CompositeHostAdapterOptions,
): RunnerHostAdapter {
  const { local, remote } = options;

  return {
    read: local?.read ?? remote?.read,
    write: local?.write ?? remote?.write,
    edit: local?.edit ?? remote?.edit,
    exec: remote?.exec ?? local?.exec,
  };
}

export interface JsRunnerHostOptions {
  hostAdapter?: RunnerHostAdapter;
}

interface RunnerHostCoreLike {
  dispatch(request: RunnerRpcRequest): Promise<RunnerRpcResponse>;
  getHealth(): RunnerHostHealth;
}

export class JsRunnerHost {
  readonly #core: RunnerHostCoreLike;
  #requestSequence = 0;

  constructor(options: JsRunnerHostOptions = {}) {
    this.#core = createRunnerHostCore({
      hostAdapter: options.hostAdapter,
    }) as RunnerHostCoreLike;
  }

  async invoke(request: RunnerInvocation): Promise<RunnerInvocationResult> {
    const response = await this.dispatch({
      kind: "invoke",
      requestId: this.#nextRequestId(),
      invocation: request,
    });
    if (!("kind" in response) || response.kind !== "invoke_result") {
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
      targetRequestId,
    });
    if (!("kind" in response) || response.kind !== "cancel_result") {
      throw new CapabilityError("E_RUNTIME", "Unexpected RPC response for cancel");
    }
    return {
      cancelled: response.cancelled,
    };
  }

  #nextRequestId(): RunnerRequestId {
    this.#requestSequence += 1;
    return `runner-${this.#requestSequence}`;
  }
}
