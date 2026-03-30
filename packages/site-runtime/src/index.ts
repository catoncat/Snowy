import {
  CapabilityError,
  type InterventionKind,
  type InterventionRequest,
  type InterventionTrigger,
} from "@bbl-next/contracts";
import type { JsRunnerHost, RunnerModule } from "@bbl-next/js-runner";

export type SiteWorld = "content" | "main";

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
  verify?(request: SiteScriptVerificationRequest): Promise<boolean>;
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
  }): Promise<boolean>;
}

export interface SiteActionInterventionPolicy {
  kind: InterventionKind;
  title: string;
  message: string;
  trigger?: Extract<InterventionTrigger, "verify_failed" | "runtime_blocked">;
  payload?: Record<string, unknown>;
}

export interface SiteInvocationSuccess {
  result: unknown;
  verified: boolean;
  trace: string[];
  intervention?: undefined;
}

export interface SiteInvocationIntervention {
  result: unknown;
  verified: false;
  trace: string[];
  intervention: InterventionRequest;
}

export type SiteInvocationResult = SiteInvocationSuccess | SiteInvocationIntervention;

export interface SingleActionSiteSkillRequest {
  skillId: string;
  action: string;
  tab: ActiveTabMetadata;
  input?: unknown;
  ctx?: Record<string, unknown>;
  plan: InjectionPlan;
  module: RunnerModule;
  verifier?: string;
  intervention?: SiteActionInterventionPolicy;
}

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
    "skillId" | "tab" | "action" | "plan" | "module" | "verifier" | "intervention"
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
    input: options.request.input,
    ctx: options.request.ctx,
  });
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

  matchActiveTab(tab: ActiveTabMetadata): SiteSkillDefinition[] {
    if (!tab.active) {
      return [];
    }
    return [...this.#skills.values()].filter((skill) =>
      skill.matches.some((pattern) => patternToRegExp(pattern).test(tab.url)),
    );
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
    input?: unknown;
    ctx?: Record<string, unknown>;
  }): Promise<SiteInvocationResult> {
    const skill = this.#registry.get(request.skillId);
    if (!skill) {
      throw new CapabilityError("E_BAD_INPUT", `Unknown site skill: ${request.skillId}`);
    }
    const matches = this.#registry
      .matchActiveTab(request.tab)
      .some((candidate) => candidate.skillId === request.skillId);
    if (!matches) {
      throw new CapabilityError("E_BAD_INPUT", `Active tab does not match ${request.skillId}`);
    }
    const action = skill.actions.find((candidate) => candidate.name === request.action);
    if (!action) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        `Unknown site action: ${request.skillId}.${request.action}`,
      );
    }

    const trace = [`match:${request.skillId}`];

    // Phase 2: Plan & Install
    const plan = buildInjectionPlan(request.skillId, action);
    const site: SiteInvokeContext = {
      plan,
      installations: [],
    };
    if (plan.steps.length > 0) {
      trace.push(`plan:${plan.steps.length}_steps`);
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
      return {
        result,
        verified: false,
        trace,
        intervention,
      };
    };

    try {
      const invocation = await this.#runnerHost.invoke({
        module: action.module,
        input: request.input ?? {},
        ctx: runnerContext,
      });
      let result = invocation.result;
      if (targetInstallation && this.#installer?.invoke) {
        result = await this.#installer.invoke({
          installation: targetInstallation,
          action: request.action,
          input: invocation.result,
          tab: request.tab,
          ctx: runnerContext,
        });
      }
      trace.push(`invoke:${request.action}`);

      // Phase 4: Verify
      let verified = true;
      if (action.verifier && (this.#verifier || (targetInstallation && this.#installer?.verify))) {
        if (targetInstallation && this.#installer?.verify) {
          verified = await this.#installer.verify({
            installation: targetInstallation,
            action: request.action,
            verifier: action.verifier,
            result,
            tab: request.tab,
          });
        } else if (this.#verifier) {
          verified = await this.#verifier.verify({
            skillId: request.skillId,
            action: request.action,
            tab: request.tab,
            result,
            site,
          });
        }
        trace.push(`verify:${action.verifier}`);
        if (!verified) {
          const intervention = toInterventionResult(
            "verify_failed",
            {
              result,
              ...(action.verifier ? { verifier: action.verifier } : {}),
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
      };
    } catch (error) {
      const intervention = toInterventionResult("runtime_blocked", {
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
      });
      if (intervention) {
        return intervention;
      }
      throw error;
    }
  }
}
