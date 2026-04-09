import { CapabilityError } from "@bbl-next/contracts";
import type {
  CompactionDraft,
  CompactionReason,
  InterventionRequest,
  KernelLlmAdapter,
  LlmProfileConfig,
  LoopTerminalStatus,
  LoopTurn,
  MessagePayload,
  NoProgressReason,
  QueuedPrompt,
  ResolveLlmRouteResult,
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
  InterventionController,
  type KernelInterventionEvent,
  type KernelInterventionRecord,
  type KernelInterventionSummary,
} from "./intervention-controller.js";
import { resolveLlmRoute } from "./llm-profile-resolver.js";
import type { LlmProviderRegistry } from "./llm-provider-registry.js";
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

export interface KernelOptions {
  storage: SessionStorage;
  llm: KernelLlmAdapter;
  registry?: CapabilityRegistry;
  providers?: FamilyProviderRegistry;
  providerRegistry?: LlmProviderRegistry;
  profileConfig?: LlmProfileConfig;
  dispatch?: KernelDispatchConfig;
  executeRunnerStep?: (request: {
    sessionId: string;
    turn: LoopTurn;
    step: Extract<StepRequest, { kind: "runner" }>;
  }) => Promise<StepResult> | StepResult;
  executeSiteStep?: (request: {
    sessionId: string;
    turn: LoopTurn;
    step: Extract<StepRequest, { kind: "site" }>;
  }) => Promise<StepResult> | StepResult;
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
  checkTerminal(
    sessionId: string,
    turn: LoopTurn,
    opts?: { stopped?: boolean },
  ): LoopTerminalStatus | null;
  checkNoProgress(sessionId: string): NoProgressReason | null;
  getMaxSteps(): number;
  resetLoopState(sessionId: string): void;

  // Compaction
  shouldCompact(sessionId: string, contextWindow: number, currentTokens?: number): Promise<boolean>;
  triggerCompaction(sessionId: string, reason: CompactionReason): Promise<CompactionDraft>;

  // Provider/profile management
  getActiveProfile(): ResolveLlmRouteResult | null;
  setProfileConfig(config: LlmProfileConfig): void;
  getProviderRegistry(): LlmProviderRegistry | null;

  // Intervention lifecycle
  requestIntervention(
    sessionId: string,
    request: InterventionRequest,
    opts?: { timeoutMs?: number; now?: number },
  ): KernelInterventionRecord;
  resolveIntervention(
    interventionId: string,
    resolution?: Record<string, unknown>,
    opts?: { now?: number },
  ): KernelInterventionRecord;
  cancelIntervention(
    interventionId: string,
    details?: Record<string, unknown>,
    opts?: { now?: number },
  ): KernelInterventionRecord;
  listInterventions(opts?: {
    sessionId?: string | null;
    status?: KernelInterventionRecord["status"];
    now?: number;
  }): KernelInterventionRecord[];
  readInterventionAudit(opts?: {
    sessionId?: string | null;
    limit?: number;
    now?: number;
  }): KernelInterventionEvent[];
  getInterventionSummary(opts?: {
    sessionId?: string | null;
    auditLimit?: number;
    now?: number;
  }): KernelInterventionSummary;
  persistInterventions(sessionId: string, opts?: { now?: number }): Promise<void>;
  rehydrateInterventions(sessionId: string, opts?: { now?: number }): Promise<void>;

  // Subsystem access (for advanced usage)
  readonly sessions: SessionStore;
  readonly runs: RunController;
  readonly loop: LoopEngine;
  readonly compaction: CompactionManager;
  readonly interventions: InterventionController;
}

export function createKernel(opts: KernelOptions): Kernel {
  const sessions = new SessionStore(opts.storage);
  const runs = new RunController();
  const loop = new LoopEngine(opts.loop);
  const compaction = new CompactionManager(sessions, opts.llm, opts.compaction);
  const interventions = new InterventionController();
  const providerRegistry = opts.providerRegistry ?? null;
  let profileConfig = opts.profileConfig;

  const executeStep = async (
    sessionId: string,
    step: StepRequest,
  ): Promise<{ turn: LoopTurn; result: StepResult }> => {
    const turn = loop.createTurn(sessionId, step);

    const record = (result: StepResult) => ({
      turn: loop.recordTurnResult(turn, result),
      result,
    });

    if (step.kind === "runner") {
      if (!opts.executeRunnerStep) {
        return record({
          ok: false,
          error: "Kernel is not wired with a runner step executor",
        });
      }

      try {
        return record(
          await opts.executeRunnerStep({
            sessionId,
            turn,
            step,
          }),
        );
      } catch (error) {
        return record({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          retryable: error instanceof CapabilityError && error.code === "E_RUNTIME",
        });
      }
    }

    if (step.kind === "site") {
      if (!opts.executeSiteStep) {
        return record({
          ok: false,
          error: "Kernel is not wired with a site step executor",
        });
      }

      try {
        return record(
          await opts.executeSiteStep({
            sessionId,
            turn,
            step,
          }),
        );
      } catch (error) {
        return record({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          retryable: error instanceof CapabilityError && error.code === "E_RUNTIME",
        });
      }
    }

    if (!step.capabilityId) {
      return record({
        ok: false,
        error: "Kernel step requires capabilityId",
      });
    }

    if (!opts.registry || !opts.providers) {
      return record({
        ok: false,
        error: "Kernel is not wired with capability registry/providers",
      });
    }

    try {
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
      return record({ ok: true, data });
    } catch (error) {
      return record({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        retryable: error instanceof CapabilityError && error.code === "E_RUNTIME",
      });
    }
  };

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
    checkTerminal: (id, turn, checkOpts) => loop.checkTerminal(id, turn, checkOpts),
    checkNoProgress: (id) => loop.checkNoProgress(id),
    getMaxSteps: () => loop.getMaxSteps(),
    resetLoopState: (id) => loop.resetSession(id),

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

    // Provider/profile management
    getActiveProfile: () => (profileConfig ? resolveLlmRoute(profileConfig) : null),
    setProfileConfig(config) {
      profileConfig = config;
    },
    getProviderRegistry: () => providerRegistry,

    // Intervention lifecycle
    requestIntervention: (sessionId, request, requestOpts) =>
      interventions.request(sessionId, request, requestOpts),
    resolveIntervention: (interventionId, resolution, requestOpts) =>
      interventions.resolve(interventionId, resolution, requestOpts),
    cancelIntervention: (interventionId, details, requestOpts) =>
      interventions.cancel(interventionId, details, requestOpts),
    listInterventions: (requestOpts) => interventions.list(requestOpts),
    readInterventionAudit: (requestOpts) => interventions.readAudit(requestOpts),
    getInterventionSummary: (requestOpts) => interventions.getSummary(requestOpts),
    async persistInterventions(sessionId, requestOpts) {
      const current = (await opts.storage.readKernelSnapshot(sessionId)) ?? {};
      await opts.storage.writeKernelSnapshot(sessionId, {
        ...current,
        interventions: interventions.snapshot({
          sessionId,
          now: requestOpts?.now,
        }),
      });
    },
    async rehydrateInterventions(sessionId, requestOpts) {
      const snapshot = await opts.storage.readKernelSnapshot(sessionId);
      interventions.replaceSession(sessionId, snapshot?.interventions, {
        now: requestOpts?.now,
      });
    },

    // Subsystem access
    sessions,
    runs,
    loop,
    compaction,
    interventions,
  };
}
