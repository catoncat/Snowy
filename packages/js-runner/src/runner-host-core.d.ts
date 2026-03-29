export interface RunnerHostCore {
  dispatch(request: unknown): Promise<unknown>;
  getHealth(): unknown;
}

export function createRunnerHostCore(): RunnerHostCore;
