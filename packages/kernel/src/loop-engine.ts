import type { LoopTerminalStatus, LoopTurn, NoProgressReason } from "@bbl-next/contracts";

export interface CapabilityStepRequest {
  kind?: "capability";
  capabilityId?: string;
  input?: unknown;
}

export interface RunnerStepRequest {
  kind: "runner";
  capabilityId?: string;
  module: {
    id: string;
    source: string;
    exportName?: string;
  };
  input?: unknown;
  ctx?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface SiteStepRequest {
  kind: "site";
  capabilityId?: string;
  skillId: string;
  action: string;
  tab: {
    tabId: number;
    url: string;
    active: boolean;
    title?: string;
  };
  input?: unknown;
  ctx?: Record<string, unknown>;
}

export type StepRequest = CapabilityStepRequest | RunnerStepRequest | SiteStepRequest;

export interface StepResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  retryable?: boolean;
  verified?: boolean;
  timeout?: boolean;
}

export type StepExecutor = (request: {
  sessionId: string;
  turn: LoopTurn;
  step: StepRequest;
}) => Promise<StepResult> | StepResult;

export interface LoopEngineOptions {
  maxSteps?: number;
  noProgressSignatureHistoryLimit?: number;
  noProgressRepeatSignatureThreshold?: number;
  executor?: StepExecutor;
}

const DEFAULT_MAX_STEPS = 50;
const DEFAULT_SIGNATURE_HISTORY_LIMIT = 6;
const DEFAULT_REPEAT_SIGNATURE_THRESHOLD = 2;
function generateTurnId(): string {
  return `t-${crypto.randomUUID()}`;
}

export class LoopEngine {
  readonly #maxSteps: number;
  readonly #signatureHistoryLimit: number;
  readonly #repeatSignatureThreshold: number;
  readonly #executor?: StepExecutor;
  readonly #stepCounts = new Map<string, number>();
  readonly #signatureHistory = new Map<string, string[]>();

  constructor(opts?: LoopEngineOptions) {
    this.#maxSteps = opts?.maxSteps ?? DEFAULT_MAX_STEPS;
    this.#signatureHistoryLimit =
      opts?.noProgressSignatureHistoryLimit ?? DEFAULT_SIGNATURE_HISTORY_LIMIT;
    this.#repeatSignatureThreshold = Math.max(
      2,
      opts?.noProgressRepeatSignatureThreshold ?? DEFAULT_REPEAT_SIGNATURE_THRESHOLD,
    );
    this.#executor = opts?.executor;
  }

  createTurn(sessionId: string, step: StepRequest): LoopTurn {
    const stepIndex = this.#stepCounts.get(sessionId) ?? 0;
    this.#stepCounts.set(sessionId, stepIndex + 1);
    return {
      turnId: generateTurnId(),
      sessionId,
      stepIndex,
      capabilityId: this.#resolveCapabilityId(step),
      status: "pending",
      startedAt: new Date().toISOString(),
    };
  }

  async executeTurn(
    sessionId: string,
    step: StepRequest,
  ): Promise<{ turn: LoopTurn; result: StepResult }> {
    const turn = this.createTurn(sessionId, step);

    if (!this.#executor) {
      const result: StepResult = {
        ok: false,
        error: "LoopEngine has no step executor configured",
      };
      return {
        turn: this.recordTurnResult(turn, result),
        result,
      };
    }

    try {
      const result = await this.#executor({
        sessionId,
        turn,
        step,
      });
      return {
        turn: this.recordTurnResult(turn, result),
        result,
      };
    } catch (error) {
      const result: StepResult = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
      return {
        turn: this.recordTurnResult(turn, result),
        result,
      };
    }
  }

  recordTurnResult(turn: LoopTurn, result: StepResult): LoopTurn {
    const timedOut = result.timeout ?? /timeout/i.test(result.error ?? "");
    const updated: LoopTurn = {
      ...turn,
      status: result.ok ? "succeeded" : "failed",
      retryable: result.retryable,
      verified: result.verified,
      lastError: result.error,
      timedOut,
      endedAt: new Date().toISOString(),
    };

    // Track signature for no-progress detection
    if (result.ok && turn.capabilityId) {
      const sig = `${turn.capabilityId}:${JSON.stringify(result.data ?? null)}`;
      const history = this.#signatureHistory.get(turn.sessionId) ?? [];
      history.push(sig);
      if (history.length > this.#signatureHistoryLimit) {
        history.splice(0, history.length - this.#signatureHistoryLimit);
      }
      this.#signatureHistory.set(turn.sessionId, history);
    }

    return updated;
  }

  checkTerminal(
    sessionId: string,
    turn: LoopTurn,
    opts?: { stopped?: boolean },
  ): LoopTerminalStatus | null {
    if (opts?.stopped) {
      return "stopped";
    }

    // Failed and not retryable
    if (turn.status === "failed") {
      if (turn.retryable) {
        return null;
      }
      if (turn.timedOut) {
        return "timeout";
      }
      return "failed_execute";
    }

    if (turn.status === "succeeded") {
      if (turn.verified === false) {
        return "failed_verify";
      }
      if (turn.verified === true) {
        return "done";
      }
    }

    // Max steps reached
    const stepCount = this.#stepCounts.get(sessionId) ?? 0;
    if (stepCount >= this.#maxSteps) {
      return "max_steps";
    }

    return null;
  }

  checkNoProgress(sessionId: string): NoProgressReason | null {
    const history = this.#signatureHistory.get(sessionId);
    if (!history || history.length < 2) return null;

    // Check ping_pong: alternating pattern A-B-A-B
    if (history.length >= 4) {
      const len = history.length;
      if (
        history[len - 1] === history[len - 3] &&
        history[len - 2] === history[len - 4] &&
        history[len - 1] !== history[len - 2]
      ) {
        return "ping_pong";
      }
    }

    // Check repeat_signature: the trailing signatures are all the same
    const last = history[history.length - 1];
    let repeatCount = 1;
    for (let index = history.length - 2; index >= 0; index -= 1) {
      if (history[index] !== last) {
        break;
      }
      repeatCount += 1;
    }
    if (repeatCount >= this.#repeatSignatureThreshold) {
      return "repeat_signature";
    }

    return null;
  }

  getStepCount(sessionId: string): number {
    return this.#stepCounts.get(sessionId) ?? 0;
  }

  getMaxSteps(): number {
    return this.#maxSteps;
  }

  resetSession(sessionId: string): void {
    this.#stepCounts.delete(sessionId);
    this.#signatureHistory.delete(sessionId);
  }

  #resolveCapabilityId(step: StepRequest): string | undefined {
    if (step.capabilityId) {
      return step.capabilityId;
    }

    switch (step.kind) {
      case "runner":
        return "runner.invoke";
      case "site":
        return `site.invoke:${step.skillId}.${step.action}`;
      default:
        return undefined;
    }
  }
}
