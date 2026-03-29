import type {
  SessionHeader,
  SessionEntry,
  SessionContext,
  SessionStorage,
  RunState,
  QueuedPrompt,
  CompactionDraft,
  CompactionReason,
  KernelLlmAdapter,
  LoopTurn,
  MessagePayload
} from "@bbl-next/contracts";
import { SessionStore } from "./session-store.js";
import { RunController } from "./run-controller.js";
import { LoopEngine, type StepRequest, type StepResult, type LoopEngineOptions } from "./loop-engine.js";
import { CompactionManager, type CompactionOptions } from "./compaction-manager.js";

export interface KernelOptions {
  storage: SessionStorage;
  llm: KernelLlmAdapter;
  loop?: LoopEngineOptions;
  compaction?: CompactionOptions;
}

export interface Kernel {
  // Session
  createSession(opts?: { parentSessionId?: string; title?: string; model?: string }): Promise<SessionHeader>;
  listSessions(): Promise<SessionHeader[]>;
  deleteSession(sessionId: string): Promise<void>;
  buildContext(sessionId: string): Promise<SessionContext>;
  appendEntry(sessionId: string, type: SessionEntry["type"], payload: unknown): Promise<SessionEntry>;
  appendMessage(sessionId: string, payload: MessagePayload): Promise<SessionEntry>;

  // Run lifecycle
  startRun(sessionId: string): RunState;
  pause(sessionId: string): RunState;
  resume(sessionId: string): RunState;
  stop(sessionId: string): RunState;
  getRunState(sessionId: string): RunState;

  // Queue
  enqueue(sessionId: string, behavior: "steer" | "followUp", text: string): QueuedPrompt;
  dequeue(sessionId: string, behavior: "steer" | "followUp"): QueuedPrompt[];

  // Loop
  createTurn(sessionId: string, step: StepRequest): LoopTurn;
  recordTurnResult(turn: LoopTurn, result: StepResult): LoopTurn;
  getStepCount(sessionId: string): number;

  // Compaction
  shouldCompact(sessionId: string, contextWindow: number, currentTokens?: number): Promise<boolean>;
  triggerCompaction(sessionId: string, reason: CompactionReason): Promise<CompactionDraft>;

  // Subsystem access (for advanced usage)
  readonly sessions: SessionStore;
  readonly runs: RunController;
  readonly loop: LoopEngine;
  readonly compaction: CompactionManager;
}

export function createKernel(opts: KernelOptions): Kernel {
  const sessions = new SessionStore(opts.storage);
  const runs = new RunController();
  const loop = new LoopEngine(opts.loop);
  const compaction = new CompactionManager(sessions, opts.llm, opts.compaction);

  return {
    // Session
    createSession: (o) => sessions.createSession(o),
    listSessions: () => sessions.listSessions(),
    deleteSession: (id) => sessions.deleteSession(id),
    buildContext: (id) => sessions.buildContext(id),
    appendEntry: (sessionId, type, payload) => sessions.appendEntry(sessionId, type, payload),
    async appendMessage(sessionId, payload) {
      return sessions.appendEntry(sessionId, "message", payload);
    },

    // Run lifecycle
    startRun: (id) => runs.transition(id, "start"),
    pause: (id) => runs.transition(id, "pause"),
    resume: (id) => runs.transition(id, "resume"),
    stop: (id) => runs.transition(id, "stop"),
    getRunState: (id) => runs.getState(id),

    // Queue
    enqueue: (id, behavior, text) => runs.enqueue(id, behavior, text),
    dequeue: (id, behavior) => runs.dequeue(id, behavior),

    // Loop
    createTurn: (id, step) => loop.createTurn(id, step),
    recordTurnResult: (turn, result) => loop.recordTurnResult(turn, result),
    getStepCount: (id) => loop.getStepCount(id),

    // Compaction
    shouldCompact: (id, cw, ct) => compaction.shouldCompact(id, cw, ct),
    async triggerCompaction(sessionId, reason) {
      runs.transition(sessionId, "compact");
      try {
        const prep = await compaction.prepare(sessionId, reason);
        const draft = await compaction.execute(prep);

        const shouldPersist = prep.messagesToSummarize.length > 0 && draft.summary.trim().length > 0;
        if (shouldPersist) {
          await compaction.apply(sessionId, draft);
        }

        runs.transition(sessionId, "compact_done_retry");
        return draft;
      } catch (error) {
        runs.transition(sessionId, "compact_done_idle");
        throw error;
      }
    },

    // Subsystem access
    sessions,
    runs,
    loop,
    compaction
  };
}
