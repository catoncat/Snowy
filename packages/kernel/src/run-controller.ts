import {
  CapabilityError,
  type QueuedPrompt,
  type RunPhase,
  type RunState,
  canTransitionRunPhase,
} from "@bbl-next/contracts";

export type RunEvent =
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "compact"
  | "compact_done_retry"
  | "compact_done_idle"
  | "done"
  | "reset";

const EVENT_TARGET_PHASE: Record<RunEvent, RunPhase> = {
  start: "running",
  pause: "paused",
  resume: "running",
  stop: "stopped",
  compact: "compacting",
  compact_done_retry: "running",
  compact_done_idle: "idle",
  done: "stopped",
  reset: "idle",
};

const DEFAULT_MAX_RETRY_ATTEMPTS = 2;

function createDefaultRunState(sessionId: string): RunState {
  return {
    sessionId,
    phase: "idle",
    retry: { active: false, attempt: 0, maxAttempts: DEFAULT_MAX_RETRY_ATTEMPTS },
    queue: { steer: [], followUp: [] },
  };
}

function generatePromptId(): string {
  return `qp-${crypto.randomUUID()}`;
}

export class RunController {
  readonly #states = new Map<string, RunState>();

  #requireState(sessionId: string): RunState {
    const state = this.#states.get(sessionId);
    if (!state) {
      throw new CapabilityError("E_RUNTIME", `Run state not found: ${sessionId}`);
    }
    return state;
  }

  getState(sessionId: string): RunState {
    return this.#states.get(sessionId) ?? createDefaultRunState(sessionId);
  }

  transition(sessionId: string, event: RunEvent): RunState {
    let current = this.#states.get(sessionId);
    if (!current) {
      if (event !== "start") {
        throw new CapabilityError("E_RUNTIME", `Run state not found: ${sessionId}`);
      }

      current = createDefaultRunState(sessionId);
      this.#states.set(sessionId, current);
    }

    const targetPhase = EVENT_TARGET_PHASE[event];

    if (!canTransitionRunPhase(current.phase, targetPhase)) {
      throw new CapabilityError(
        "E_RUNTIME",
        `Illegal run phase transition: ${current.phase} → ${targetPhase} (event: ${event})`,
      );
    }

    const updated: RunState = { ...current, phase: targetPhase };

    // Reset retry state on done/stop/reset
    if (event === "done" || event === "stop" || event === "reset") {
      updated.retry = { active: false, attempt: 0, maxAttempts: current.retry.maxAttempts };
    }

    this.#states.set(sessionId, updated);
    return updated;
  }

  enqueue(sessionId: string, behavior: "steer" | "followUp", text: string): QueuedPrompt {
    const state = this.#requireState(sessionId);
    const prompt: QueuedPrompt = {
      id: generatePromptId(),
      text,
      enqueuedAt: new Date().toISOString(),
    };
    state.queue[behavior].push(prompt);
    return prompt;
  }

  dequeue(sessionId: string, behavior: "steer" | "followUp"): QueuedPrompt[] {
    const state = this.#requireState(sessionId);
    const items = state.queue[behavior].splice(0);
    return items;
  }

  shouldRetry(sessionId: string): boolean {
    const state = this.#states.get(sessionId);
    if (!state) {
      return false;
    }
    return state.retry.active && state.retry.attempt < state.retry.maxAttempts;
  }

  recordRetryAttempt(sessionId: string): void {
    const state = this.#requireState(sessionId);
    state.retry = {
      ...state.retry,
      active: true,
      attempt: state.retry.attempt + 1,
    };
  }

  activateRetry(sessionId: string): void {
    const state = this.#requireState(sessionId);
    state.retry = { ...state.retry, active: true };
  }

  resetRetry(sessionId: string): void {
    const state = this.#requireState(sessionId);
    state.retry = { active: false, attempt: 0, maxAttempts: state.retry.maxAttempts };
  }
}
