import { CapabilityError } from "@bbl-next/contracts";
import { JsRunnerHost, type RunnerModule } from "@bbl-next/js-runner";

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
      })
    };
  }
  if (action.worlds && action.worlds.length > 0) {
    return {
      skillId,
      action: action.name,
      steps: action.worlds.map((world) => ({
        world,
        scriptId: `${skillId}:${action.name}:${world}`
      }))
    };
  }
  return { skillId, action: action.name, steps: [] };
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
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
      skill.matches.some((pattern) => patternToRegExp(pattern).test(tab.url))
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
  }): Promise<{ result: unknown; verified: boolean; trace: string[] }> {
    const skill = this.#registry.get(request.skillId);
    if (!skill) {
      throw new CapabilityError("E_BAD_INPUT", `Unknown site skill: ${request.skillId}`);
    }
    const matches = this.#registry.matchActiveTab(request.tab).some(
      (candidate) => candidate.skillId === request.skillId
    );
    if (!matches) {
      throw new CapabilityError("E_BAD_INPUT", `Active tab does not match ${request.skillId}`);
    }
    const action = skill.actions.find((candidate) => candidate.name === request.action);
    if (!action) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        `Unknown site action: ${request.skillId}.${request.action}`
      );
    }

    const trace = [`match:${request.skillId}`];

    // Phase 2: Plan & Install
    const plan = buildInjectionPlan(request.skillId, action);
    const site: SiteInvokeContext = {
      plan,
      installations: []
    };
    if (plan.steps.length > 0) {
      trace.push(`plan:${plan.steps.length}_steps`);
      for (const step of plan.steps) {
        const installation = this.#installer
          ? await this.#installer.install(step, request.tab)
          : undefined;
        site.installations.push({
          step,
          result: installation
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
      site
    };
    const invocation = await this.#runnerHost.invoke({
      module: action.module,
      input: request.input ?? {},
      ctx: runnerContext
    });
    let result = invocation.result;
    const targetInstallation = site.installations[site.installations.length - 1];
    if (targetInstallation && this.#installer?.invoke) {
      result = await this.#installer.invoke({
        installation: targetInstallation,
        action: request.action,
        input: invocation.result,
        tab: request.tab,
        ctx: runnerContext
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
          tab: request.tab
        });
      } else if (this.#verifier) {
        verified = await this.#verifier.verify({
          skillId: request.skillId,
          action: request.action,
          tab: request.tab,
          result,
          site
        });
      }
      trace.push(`verify:${action.verifier}`);
      if (!verified) {
        throw new CapabilityError(
          "E_VERIFY_FAILED",
          `Verifier failed for ${request.skillId}.${request.action}`
        );
      }
    }

    return {
      result,
      verified,
      trace
    };
  }
}
