import {
  CapabilityError,
  type InterventionKind,
  type InterventionRequest,
  type InterventionTrigger,
  type ObservabilityTimelineEvent,
  type RawEventTailEntry,
} from "@bbl-next/contracts";
import type { JsRunnerHost, RunnerModule } from "@bbl-next/js-runner";

export type SiteWorld = "content" | "main";
export type SiteExecutionLane = "active" | "background";

export interface ActiveTabMetadata {
  tabId: number;
  url: string;
  active: boolean;
  title?: string;
}

export interface InjectionStep {
  world: SiteWorld;
  scriptId: string;
  jsPath?: string;
  runAt?: "document_start" | "document_idle" | "document_end";
}

export interface InjectionPlan {
  skillId: string;
  action: string;
  steps: InjectionStep[];
}

export interface SiteInstallation {
  step: InjectionStep;
  result?: unknown;
}

export interface SiteInvokeContext {
  plan: InjectionPlan;
  installations: SiteInstallation[];
}

export interface SiteSkillAction {
  name: string;
  module: RunnerModule;
  worlds?: SiteWorld[];
  injectionSteps?: InjectionStep[];
  verifier?: string;
  stabilization?: SiteActionStabilizationPolicy;
  intervention?: SiteActionInterventionPolicy;
}

export interface SiteSkillDefinition {
  skillId: string;
  matches: string[];
  actions: SiteSkillAction[];
}

export interface SiteScriptInstaller {
  install(step: InjectionStep, tab: ActiveTabMetadata): Promise<unknown>;
  invoke?(request: SiteScriptInvocationRequest): Promise<unknown>;
  verify?(request: SiteScriptVerificationRequest): Promise<SiteVerificationResult>;
}

export interface SiteScriptInvocationRequest {
  installation: SiteInstallation;
  action: string;
  input: unknown;
  tab: ActiveTabMetadata;
  ctx: Record<string, unknown>;
}

export interface SiteScriptVerificationRequest {
  installation: SiteInstallation;
  action: string;
  verifier: string;
  result: unknown;
  tab: ActiveTabMetadata;
}

export interface SiteActionVerifier {
  verify(request: {
    skillId: string;
    action: string;
    tab: ActiveTabMetadata;
    result: unknown;
    site: SiteInvokeContext;
  }): Promise<SiteVerificationResult>;
}

export interface SiteActionStabilizationPolicy {
  budgetMs?: number;
  intervalMs?: number;
  maxAttempts?: number;
}

export interface SiteVerificationSuccess {
  status: "verified";
}

export interface SiteVerificationPending {
  status: "not_ready";
  reason?: string;
  retryAfterMs?: number;
  payload?: Record<string, unknown>;
}

export interface SiteVerificationFailure {
  status: "failed";
  reason?: string;
  payload?: Record<string, unknown>;
}

export type SiteVerificationResult =
  | boolean
  | SiteVerificationSuccess
  | SiteVerificationPending
  | SiteVerificationFailure;

export interface SiteActionInterventionPolicy {
  kind: InterventionKind;
  title: string;
  message: string;
  trigger?: Extract<InterventionTrigger, "verify_failed" | "runtime_blocked">;
  payload?: Record<string, unknown>;
}

export interface SiteActionRunnerExecutionRequest {
  skillId: string;
  action: string;
  module: RunnerModule;
  input: unknown;
  ctx: Record<string, unknown>;
  tab: ActiveTabMetadata;
  site: SiteInvokeContext;
}

export type SiteActionRunnerExecutor = (
  request: SiteActionRunnerExecutionRequest,
) => Promise<unknown> | unknown;

export interface SiteInvocationSuccess {
  result: unknown;
  verified: boolean;
  trace: string[];
  timelineEvents: ObservabilityTimelineEvent[];
  rawEvents: RawEventTailEntry[];
  intervention?: undefined;
}

export interface SiteInvocationIntervention {
  result: unknown;
  verified: false;
  trace: string[];
  timelineEvents: ObservabilityTimelineEvent[];
  rawEvents: RawEventTailEntry[];
  intervention: InterventionRequest;
}

export type SiteInvocationResult = SiteInvocationSuccess | SiteInvocationIntervention;

export interface SiteFetchWithSessionInput {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface SiteFetchWithSessionResult {
  url: string;
  status: number;
  body: string;
  ok: boolean;
}

export interface SingleActionSiteSkillRequest {
  skillId: string;
  action: string;
  tab: ActiveTabMetadata;
  lane?: SiteExecutionLane;
  input?: unknown;
  ctx?: Record<string, unknown>;
  plan: InjectionPlan;
  module: RunnerModule;
  verifier?: string;
  stabilization?: SiteActionStabilizationPolicy;
  intervention?: SiteActionInterventionPolicy;
  executeRunner?: SiteActionRunnerExecutor;
}

type NormalizedSiteVerificationResult = {
  status: "verified" | "not_ready" | "failed";
  reason?: string;
  retryAfterMs?: number;
  payload?: Record<string, unknown>;
};

const DEFAULT_SITE_STABILIZATION_POLICY: Required<SiteActionStabilizationPolicy> = {
  budgetMs: 1_000,
  intervalMs: 100,
  maxAttempts: 5,
};

export function buildInjectionPlan(skillId: string, action: SiteSkillAction): InjectionPlan {
  if (action.injectionSteps && action.injectionSteps.length > 0) {
    return {
      skillId,
      action: action.name,
      steps: action.injectionSteps.map((s) => {
        const step: InjectionStep = { world: s.world, scriptId: s.scriptId };
        if (s.jsPath) step.jsPath = s.jsPath;
        if (s.runAt) step.runAt = s.runAt;
        return step;
      }),
    };
  }
  if (action.worlds && action.worlds.length > 0) {
    return {
      skillId,
      action: action.name,
      steps: action.worlds.map((world) => ({
        world,
        scriptId: `${skillId}:${action.name}:${world}`,
      })),
    };
  }
  return { skillId, action: action.name, steps: [] };
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function buildInterventionRequest(input: {
  policy: SiteActionInterventionPolicy;
  trigger: Extract<InterventionTrigger, "verify_failed" | "runtime_blocked">;
  skillId: string;
  action: string;
  tab: ActiveTabMetadata;
  payload?: Record<string, unknown>;
}): InterventionRequest {
  const counter =
    input.trigger === "verify_failed" && input.payload?.verifier
      ? input.payload.verifier
      : "request";

  return {
    id: `ivr:${input.skillId}:${input.action}:${input.trigger}:${input.tab.tabId}:${String(counter)}`,
    kind: input.policy.kind,
    trigger: input.trigger,
    status: "requested",
    title: input.policy.title,
    message: input.policy.message,
    skillId: input.skillId,
    action: input.action,
    tabId: input.tab.tabId,
    payload: {
      tabUrl: input.tab.url,
      ...(input.policy.payload ?? {}),
      ...(input.payload ?? {}),
    },
  };
}

function asInterventionPayload(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function createSingleActionSiteSkillDefinition(
  request: Pick<
    SingleActionSiteSkillRequest,
    "skillId" | "tab" | "action" | "plan" | "module" | "verifier" | "stabilization" | "intervention"
  >,
): SiteSkillDefinition {
  return {
    skillId: request.skillId,
    matches: [request.tab.url],
    actions: [
      {
        name: request.action,
        module: request.module,
        injectionSteps: request.plan.steps,
        ...(request.verifier ? { verifier: request.verifier } : {}),
        ...(request.stabilization ? { stabilization: request.stabilization } : {}),
        ...(request.intervention ? { intervention: request.intervention } : {}),
      },
    ],
  };
}

export async function invokeSingleActionSiteSkill(options: {
  request: SingleActionSiteSkillRequest;
  runnerHost: JsRunnerHost;
  installer?: SiteScriptInstaller;
  verifier?: SiteActionVerifier;
}): Promise<SiteInvocationResult> {
  const runtime = new SiteSkillRuntime({
    registry: new SiteSkillRegistry([createSingleActionSiteSkillDefinition(options.request)]),
    runnerHost: options.runnerHost,
    ...(options.installer ? { installer: options.installer } : {}),
    ...(options.verifier ? { verifier: options.verifier } : {}),
  });

  return runtime.invoke({
    skillId: options.request.skillId,
    action: options.request.action,
    tab: options.request.tab,
    lane: options.request.lane,
    input: options.request.input,
    ctx: options.request.ctx,
    executeRunner: options.request.executeRunner,
  });
}

function normalizeStabilizationPolicy(
  policy?: SiteActionStabilizationPolicy,
): Required<SiteActionStabilizationPolicy> {
  return {
    budgetMs:
      typeof policy?.budgetMs === "number" && policy.budgetMs >= 0
        ? policy.budgetMs
        : DEFAULT_SITE_STABILIZATION_POLICY.budgetMs,
    intervalMs:
      typeof policy?.intervalMs === "number" && policy.intervalMs >= 0
        ? policy.intervalMs
        : DEFAULT_SITE_STABILIZATION_POLICY.intervalMs,
    maxAttempts:
      typeof policy?.maxAttempts === "number" && policy.maxAttempts >= 1
        ? Math.floor(policy.maxAttempts)
        : DEFAULT_SITE_STABILIZATION_POLICY.maxAttempts,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        cloneValue(entry),
      ]),
    );
  }
  return value;
}

function createSiteRuntimeEventRecorder(input: {
  skillId: string;
  action: string;
  tab: ActiveTabMetadata;
  lane: SiteExecutionLane;
}) {
  const timelineEvents: ObservabilityTimelineEvent[] = [];
  const rawEvents: RawEventTailEntry[] = [];
  let index = 0;

  const record = (event: {
    eventType: string;
    status: ObservabilityTimelineEvent["status"];
    summary: string;
    details?: Record<string, unknown>;
  }): void => {
    index += 1;
    const timestamp = new Date().toISOString();
    const details = event.details
      ? (cloneValue(event.details) as Record<string, unknown>)
      : undefined;
    timelineEvents.push({
      id: `site:${input.skillId}:${input.action}:${String(index)}`,
      source: "site-runtime",
      eventType: event.eventType,
      status: event.status,
      timestamp,
      summary: event.summary,
      skillId: input.skillId,
      action: input.action,
      tabId: input.tab.tabId,
      details,
    });
    rawEvents.push({
      index,
      timestamp,
      source: "site-runtime",
      type: event.eventType,
      payload: {
        skillId: input.skillId,
        action: input.action,
        lane: input.lane,
        tabId: input.tab.tabId,
        status: event.status,
        summary: event.summary,
        ...(details ? { details } : {}),
      },
    });
  };

  return {
    timelineEvents,
    rawEvents,
    record,
  };
}

function normalizeVerificationResult(
  value: SiteVerificationResult,
): NormalizedSiteVerificationResult {
  if (value === true) {
    return { status: "verified" };
  }
  if (value === false) {
    return { status: "failed" };
  }
  const record = asRecord(value);
  if (!record || typeof record.status !== "string") {
    return { status: "failed" };
  }
  if (record.status === "verified") {
    return { status: "verified" };
  }
  if (record.status === "not_ready") {
    return {
      status: "not_ready",
      ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
      ...(typeof record.retryAfterMs === "number" ? { retryAfterMs: record.retryAfterMs } : {}),
      ...(asRecord(record.payload) ? { payload: record.payload as Record<string, unknown> } : {}),
    };
  }
  return {
    status: "failed",
    ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
    ...(asRecord(record.payload) ? { payload: record.payload as Record<string, unknown> } : {}),
  };
}

async function waitForStabilizationDelay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class SiteSkillRegistry {
  readonly #skills = new Map<string, SiteSkillDefinition>();

  constructor(skills: SiteSkillDefinition[]) {
    for (const skill of skills) {
      this.#skills.set(skill.skillId, skill);
    }
  }

  get(skillId: string): SiteSkillDefinition | undefined {
    return this.#skills.get(skillId);
  }

  matchTab(tab: ActiveTabMetadata): SiteSkillDefinition[] {
    return [...this.#skills.values()].filter((skill) =>
      skill.matches.some((pattern) => patternToRegExp(pattern).test(tab.url)),
    );
  }

  matchActiveTab(tab: ActiveTabMetadata): SiteSkillDefinition[] {
    if (!tab.active) {
      return [];
    }
    return this.matchTab(tab);
  }
}

export class SiteSkillRuntime {
  readonly #registry: SiteSkillRegistry;
  readonly #runnerHost: JsRunnerHost;
  readonly #installer?: SiteScriptInstaller;
  readonly #verifier?: SiteActionVerifier;

  constructor(options: {
    registry: SiteSkillRegistry;
    runnerHost: JsRunnerHost;
    installer?: SiteScriptInstaller;
    verifier?: SiteActionVerifier;
  }) {
    this.#registry = options.registry;
    this.#runnerHost = options.runnerHost;
    this.#installer = options.installer;
    this.#verifier = options.verifier;
  }

  async invoke(request: {
    skillId: string;
    action: string;
    tab: ActiveTabMetadata;
    lane?: SiteExecutionLane;
    input?: unknown;
    ctx?: Record<string, unknown>;
    executeRunner?: SiteActionRunnerExecutor;
  }): Promise<SiteInvocationResult> {
    const skill = this.#registry.get(request.skillId);
    if (!skill) {
      throw new CapabilityError("E_BAD_INPUT", `Unknown site skill: ${request.skillId}`);
    }
    const lane = request.lane ?? "active";
    const matches = (
      lane === "background"
        ? this.#registry.matchTab(request.tab)
        : this.#registry.matchActiveTab(request.tab)
    ).some((candidate) => candidate.skillId === request.skillId);
    if (!matches) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        lane === "background"
          ? `Background tab does not match ${request.skillId}`
          : `Active tab does not match ${request.skillId}`,
      );
    }
    const action = skill.actions.find((candidate) => candidate.name === request.action);
    if (!action) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        `Unknown site action: ${request.skillId}.${request.action}`,
      );
    }

    const trace =
      lane === "background"
        ? [`lane:${lane}`, `match:${request.skillId}`]
        : [`match:${request.skillId}`];
    const eventRecorder = createSiteRuntimeEventRecorder({
      skillId: request.skillId,
      action: request.action,
      tab: request.tab,
      lane,
    });
    eventRecorder.record({
      eventType: "site.match",
      status: "succeeded",
      summary: `Matched ${lane} tab for ${request.skillId}.${request.action}`,
      details: {
        lane,
        url: request.tab.url,
      },
    });

    // Phase 2: Plan & Install
    const plan = buildInjectionPlan(request.skillId, action);
    const site: SiteInvokeContext = {
      plan,
      installations: [],
    };
    if (plan.steps.length > 0) {
      trace.push(`plan:${plan.steps.length}_steps`);
      eventRecorder.record({
        eventType: "site.plan",
        status: "info",
        summary: `Prepared ${String(plan.steps.length)} injection step(s)`,
        details: {
          stepCount: plan.steps.length,
        },
      });
      for (const step of plan.steps) {
        const installation = this.#installer
          ? await this.#installer.install(step, request.tab)
          : undefined;
        site.installations.push({
          step,
          result: installation,
        });
        if (this.#installer) {
          trace.push(`install:${step.world}:${step.scriptId}`);
          eventRecorder.record({
            eventType: "site.install",
            status: "succeeded",
            summary: `Installed ${step.scriptId} in ${step.world} world`,
            details: {
              world: step.world,
              scriptId: step.scriptId,
              ...(step.jsPath ? { jsPath: step.jsPath } : {}),
            },
          });
        }
      }
    }

    // Phase 3: Run
    const runnerContext = {
      ...(request.ctx ?? {}),
      tab: request.tab,
      site,
    };
    const targetInstallation = site.installations[site.installations.length - 1];
    const toInterventionResult = (
      trigger: Extract<InterventionTrigger, "verify_failed" | "runtime_blocked">,
      payload?: Record<string, unknown>,
      result: unknown = null,
    ): SiteInvocationIntervention | null => {
      const policy = action.intervention;
      if (!policy || (policy.trigger ?? "verify_failed") !== trigger) {
        return null;
      }
      const intervention = buildInterventionRequest({
        policy,
        trigger,
        skillId: request.skillId,
        action: request.action,
        tab: request.tab,
        payload,
      });
      trace.push(`intervention:${policy.kind}:${trigger}`);
      eventRecorder.record({
        eventType: "site.intervention",
        status: "attention",
        summary: `Requested ${policy.kind} intervention for ${trigger}`,
        details: {
          kind: policy.kind,
          trigger,
          ...(payload ? { payload } : {}),
        },
      });
      return {
        result,
        verified: false,
        trace,
        timelineEvents: eventRecorder.timelineEvents,
        rawEvents: eventRecorder.rawEvents,
        intervention,
      };
    };

    try {
      const runnerResult = request.executeRunner
        ? await request.executeRunner({
            skillId: request.skillId,
            action: request.action,
            module: action.module,
            input: request.input ?? {},
            ctx: runnerContext,
            tab: request.tab,
            site,
          })
        : (
            await this.#runnerHost.invoke({
              module: action.module,
              input: request.input ?? {},
              ctx: runnerContext,
            })
          ).result;
      let result = runnerResult;
      if (targetInstallation && this.#installer?.invoke) {
        result = await this.#installer.invoke({
          installation: targetInstallation,
          action: request.action,
          input: runnerResult,
          tab: request.tab,
          ctx: runnerContext,
        });
      }
      trace.push(`invoke:${request.action}`);
      eventRecorder.record({
        eventType: "site.invoke",
        status: "succeeded",
        summary: `Invoked ${request.skillId}.${request.action}`,
        details: {
          lane,
          ...(targetInstallation ? { installationWorld: targetInstallation.step.world } : {}),
          result: cloneValue(result),
        },
      });

      // Phase 4: Verify
      let verified = true;
      if (action.verifier && (this.#verifier || (targetInstallation && this.#installer?.verify))) {
        const stabilizationPolicy = normalizeStabilizationPolicy(action.stabilization);
        const startedAt = Date.now();
        let attempt = 0;

        while (true) {
          attempt += 1;
          const verificationResult =
            targetInstallation && this.#installer?.verify
              ? await this.#installer.verify({
                  installation: targetInstallation,
                  action: request.action,
                  verifier: action.verifier,
                  result,
                  tab: request.tab,
                })
              : this.#verifier
                ? await this.#verifier.verify({
                    skillId: request.skillId,
                    action: request.action,
                    tab: request.tab,
                    result,
                    site,
                  })
                : true;
          const normalizedVerification = normalizeVerificationResult(verificationResult);
          if (normalizedVerification.status === "verified") {
            trace.push(`verify:${action.verifier}`);
            verified = true;
            eventRecorder.record({
              eventType: "site.verify",
              status: "succeeded",
              summary: `Verifier ${action.verifier} passed`,
              details: {
                verifier: action.verifier,
                attempts: attempt,
              },
            });
            break;
          }

          if (normalizedVerification.status === "not_ready") {
            trace.push(`stabilize:not_ready:${attempt}`);
            eventRecorder.record({
              eventType: "site.stabilize",
              status: "info",
              summary: `Verifier ${action.verifier} not ready on attempt ${String(attempt)}`,
              details: {
                verifier: action.verifier,
                attempts: attempt,
                ...(normalizedVerification.reason ? { reason: normalizedVerification.reason } : {}),
                ...(normalizedVerification.payload
                  ? { payload: normalizedVerification.payload }
                  : {}),
              },
            });
            const delayMs = Math.max(
              0,
              normalizedVerification.retryAfterMs ?? stabilizationPolicy.intervalMs,
            );
            const elapsedMs = Date.now() - startedAt;
            const exhausted =
              attempt >= stabilizationPolicy.maxAttempts ||
              elapsedMs + delayMs > stabilizationPolicy.budgetMs;
            if (exhausted) {
              trace.push("stabilize:exhausted");
              const stabilizationPayload: Record<string, unknown> = {
                verifier: action.verifier,
                attempts: attempt,
                elapsedMs,
                budgetMs: stabilizationPolicy.budgetMs,
                maxAttempts: stabilizationPolicy.maxAttempts,
                intervalMs: stabilizationPolicy.intervalMs,
                ...(normalizedVerification.reason ? { reason: normalizedVerification.reason } : {}),
                ...(normalizedVerification.payload
                  ? { payload: normalizedVerification.payload }
                  : {}),
              };
              eventRecorder.record({
                eventType: "site.stabilize",
                status: "failed",
                summary: `Stabilization exhausted for ${action.verifier}`,
                details: stabilizationPayload,
              });
              const intervention = toInterventionResult(
                "runtime_blocked",
                {
                  result,
                  stabilization: stabilizationPayload,
                },
                result,
              );
              if (intervention) {
                return intervention;
              }
              throw new CapabilityError(
                "E_RUNTIME",
                `Stabilization budget exhausted for ${request.skillId}.${request.action}`,
                stabilizationPayload,
              );
            }
            await waitForStabilizationDelay(delayMs);
            continue;
          }

          trace.push(`verify:${action.verifier}`);
          eventRecorder.record({
            eventType: "site.verify",
            status: "failed",
            summary: `Verifier ${action.verifier} failed`,
            details: {
              verifier: action.verifier,
              ...(normalizedVerification.reason ? { reason: normalizedVerification.reason } : {}),
              ...(normalizedVerification.payload
                ? { payload: normalizedVerification.payload }
                : {}),
            },
          });
          const intervention = toInterventionResult(
            "verify_failed",
            {
              result,
              ...(action.verifier ? { verifier: action.verifier } : {}),
              ...(normalizedVerification.reason ? { reason: normalizedVerification.reason } : {}),
              ...(normalizedVerification.payload
                ? { payload: normalizedVerification.payload }
                : {}),
            },
            result,
          );
          if (intervention) {
            return intervention;
          }
          throw new CapabilityError(
            "E_VERIFY_FAILED",
            `Verifier failed for ${request.skillId}.${request.action}`,
          );
        }
      }

      return {
        result,
        verified,
        trace,
        timelineEvents: eventRecorder.timelineEvents,
        rawEvents: eventRecorder.rawEvents,
      };
    } catch (error) {
      const runtimeBlockedPayload = {
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
              }
            : { message: String(error) },
        ...(asInterventionPayload(request.input)
          ? { input: request.input as Record<string, unknown> }
          : {}),
      };
      eventRecorder.record({
        eventType: "site.runtime_blocked",
        status: "failed",
        summary: `Runtime blocked while invoking ${request.skillId}.${request.action}`,
        details: runtimeBlockedPayload,
      });
      const intervention = toInterventionResult("runtime_blocked", runtimeBlockedPayload);
      if (intervention) {
        return intervention;
      }
      throw error;
    }
  }
}
