import { CapabilityError } from "@bbl-next/contracts";
import type {
  CompactionDraft,
  CompactionReason,
  KernelLlmAdapter,
  LoopTurn,
  MessagePayload,
  QueuedPrompt,
  RunState,
  SessionContext,
  SessionEntry,
  SessionHeader,
  SessionStorage,
} from "@bbl-next/contracts";
import {
  type CapabilityDispatchOptions,
  type CapabilityRegistry,
  type FamilyProviderRegistry,
  dispatchCapabilityCall,
} from "@bbl-next/core";
import { CompactionManager, type CompactionOptions } from "./compaction-manager.js";
import {
  LoopEngine,
  type LoopEngineOptions,
  type StepRequest,
  type StepResult,
} from "./loop-engine.js";
import { RunController } from "./run-controller.js";
import { SessionStore } from "./session-store.js";

type KernelDispatchConfig = Pick<
  CapabilityDispatchOptions,
  "confirm" | "invokeSkill" | "listSkills" | "permissions" | "skillId"
>;

export interface KernelRunnerHostLike {
  invoke(request: {
    module: {
      id: string;
      source: string;
      exportName?: string;
    };
    input: unknown;
    ctx: Record<string, unknown>;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<{
    result: unknown;
    durationMs: number;
  }>;
}

export interface KernelSiteRuntimeLike {
  invoke(request: {
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
  }): Promise<{
    result: unknown;
    verified: boolean;
    trace: string[];
  }>;
}

export interface KernelOptions {
  storage: SessionStorage;
  llm: KernelLlmAdapter;
  registry?: CapabilityRegistry;
  providers?: FamilyProviderRegistry;
  dispatch?: KernelDispatchConfig;
  runnerHost?: KernelRunnerHostLike;
  siteRuntime?: KernelSiteRuntimeLike;
  loop?: LoopEngineOptions;
  compaction?: CompactionOptions;
}

export interface Kernel {
  // Session
  createSession(opts?: {
    parentSessionId?: string;
    title?: string;
    model?: string;
  }): Promise<SessionHeader>;
  listSessions(): Promise<SessionHeader[]>;
  deleteSession(sessionId: string): Promise<void>;
  buildContext(sessionId: string): Promise<SessionContext>;
  appendEntry(
    sessionId: string,
    type: SessionEntry["type"],
    payload: unknown,
  ): Promise<SessionEntry>;
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
  executeStep(
    sessionId: string,
    step: StepRequest,
  ): Promise<{ turn: LoopTurn; result: StepResult }>;
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
  const compaction = new CompactionManager(sessions, opts.llm, opts.compaction);

  const executeLoopStep = async ({ sessionId, step }: {
    sessionId: string;
    turn: LoopTurn;
    step: StepRequest;
  }): Promise<StepResult> => {
    try {
      switch (step.kind) {
        case "runner": {
          if (!opts.runnerHost) {
            return {
              ok: false,
              error: "Kernel is not wired with runner host",
            };
          }
          const invocation = await opts.runnerHost.invoke({
            module: step.module,
            input: step.input,
            ctx: step.ctx ?? {},
            timeoutMs: step.timeoutMs,
          });
          return {
            ok: true,
            data: invocation.result,
          };
        }

        case "site": {
          if (!opts.siteRuntime) {
            return {
              ok: false,
              error: "Kernel is not wired with site runtime",
            };
          }
          const invocation = await opts.siteRuntime.invoke({
            skillId: step.skillId,
            action: step.action,
            tab: step.tab,
            input: step.input,
            ctx: step.ctx,
          });
          return {
            ok: true,
            data: invocation,
            verified: invocation.verified,
          };
        }

        default: {
          if (!step.capabilityId) {
            return {
              ok: false,
              error: "Kernel step requires capabilityId",
            };
          }

          if (!opts.registry || !opts.providers) {
            return {
              ok: false,
              error: "Kernel is not wired with capability registry/providers",
            };
          }

          const data = await dispatchCapabilityCall({
            registry: opts.registry,
            providers: opts.providers,
            sessionId,
            capabilityId: step.capabilityId,
            input: step.input,
            skillId: opts.dispatch?.skillId ?? "kernel.loop",
            permissions: opts.dispatch?.permissions ?? ["*"],
            confirm: opts.dispatch?.confirm,
            invokeSkill: opts.dispatch?.invokeSkill,
            listSkills: opts.dispatch?.listSkills,
          });
          return {
            ok: true,
            data,
          };
        }
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        retryable: error instanceof CapabilityError && error.code === "E_RUNTIME",
      };
    }
  };

  const loop = new LoopEngine({
    ...opts.loop,
    executor: executeLoopStep,
  });

  const executeStep = async (
    sessionId: string,
    step: StepRequest,
  ): Promise<{ turn: LoopTurn; result: StepResult }> => loop.executeTurn(sessionId, step);

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
    executeStep,
    getStepCount: (id) => loop.getStepCount(id),

    // Compaction
    shouldCompact: (id, cw, ct) => compaction.shouldCompact(id, cw, ct),
    async triggerCompaction(sessionId, reason) {
      runs.transition(sessionId, "compact");
      try {
        const prep = await compaction.prepare(sessionId, reason);
        const draft = await compaction.execute(prep);

        const shouldPersist =
          prep.messagesToSummarize.length > 0 && draft.summary.trim().length > 0;
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
    compaction,
  };
}
