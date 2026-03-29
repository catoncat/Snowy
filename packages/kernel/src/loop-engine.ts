import type {
  LoopTurn,
  LoopTerminalStatus,
  NoProgressReason
} from "@bbl-next/contracts";

export interface StepRequest {
  capabilityId?: string;
  input?: unknown;
}

export interface StepResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  retryable?: boolean;
  verified?: boolean;
  timeout?: boolean;
}

export interface LoopEngineOptions {
  maxSteps?: number;
  noProgressSignatureHistoryLimit?: number;
  noProgressContinueBudget?: Partial<Record<NoProgressReason, number>>;
}

const DEFAULT_MAX_STEPS = 50;
const DEFAULT_SIGNATURE_HISTORY_LIMIT = 6;
const DEFAULT_NO_PROGRESS_BUDGET: Record<NoProgressReason, number> = {
  repeat_signature: 1,
  ping_pong: 0
};

function generateTurnId(): string {
  return `t-${crypto.randomUUID()}`;
}

export class LoopEngine {
  readonly #maxSteps: number;
  readonly #signatureHistoryLimit: number;
  readonly #noProgressBudget: Record<NoProgressReason, number>;
  readonly #noProgressCounts = new Map<string, Record<NoProgressReason, number>>();
  readonly #stepCounts = new Map<string, number>();
  readonly #signatureHistory = new Map<string, string[]>();

  constructor(opts?: LoopEngineOptions) {
    this.#maxSteps = opts?.maxSteps ?? DEFAULT_MAX_STEPS;
    this.#signatureHistoryLimit = opts?.noProgressSignatureHistoryLimit ?? DEFAULT_SIGNATURE_HISTORY_LIMIT;
    this.#noProgressBudget = {
      ...DEFAULT_NO_PROGRESS_BUDGET,
      ...opts?.noProgressContinueBudget
    };
  }

  createTurn(sessionId: string, step: StepRequest): LoopTurn {
    const stepIndex = this.#stepCounts.get(sessionId) ?? 0;
    this.#stepCounts.set(sessionId, stepIndex + 1);
    return {
      turnId: generateTurnId(),
      sessionId,
      stepIndex,
      capabilityId: step.capabilityId,
      status: "pending",
      startedAt: new Date().toISOString()
    };
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
      endedAt: new Date().toISOString()
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
    opts?: { stopped?: boolean }
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

    const noProgress = this.checkNoProgress(sessionId);
    if (noProgress) {
      return "progress_uncertain";
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
        return this.#applyBudget(sessionId, "ping_pong");
      }
    }

    // Check repeat_signature: last N signatures are all the same
    const last = history[history.length - 1];
    const repeatCount = history.filter((s) => s === last).length;
    if (repeatCount >= 3) {
      return this.#applyBudget(sessionId, "repeat_signature");
    }

    return null;
  }

  getStepCount(sessionId: string): number {
    return this.#stepCounts.get(sessionId) ?? 0;
  }

  resetSession(sessionId: string): void {
    this.#stepCounts.delete(sessionId);
    this.#signatureHistory.delete(sessionId);
    this.#noProgressCounts.delete(sessionId);
  }

  #applyBudget(sessionId: string, reason: NoProgressReason): NoProgressReason | null {
    const counts = this.#noProgressCounts.get(sessionId) ?? {
      repeat_signature: 0,
      ping_pong: 0
    };
    if (counts[reason] < this.#noProgressBudget[reason]) {
      counts[reason] += 1;
      this.#noProgressCounts.set(sessionId, counts);
      return null; // budget not exhausted, continue
    }
    return reason;
  }
}
