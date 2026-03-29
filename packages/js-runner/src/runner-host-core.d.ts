import type {
  RunnerHostAdapter,
  RunnerHostHealth,
  RunnerRpcRequest,
  RunnerRpcResponse
} from "./index.js";

export interface RunnerHostCore {
  dispatch(request: RunnerRpcRequest): Promise<RunnerRpcResponse>;
  getHealth(): RunnerHostHealth;
}

export function createRunnerHostCore(
  options?: {
    hostAdapter?: RunnerHostAdapter;
  }
): RunnerHostCore;
