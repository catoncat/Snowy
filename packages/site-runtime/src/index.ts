import { CapabilityError } from "@bbl-next/contracts";
import { JsRunnerHost, type RunnerModule } from "@bbl-next/js-runner";

export type SiteWorld = "content" | "main";

export interface ActiveTabMetadata {
  tabId: number;
  url: string;
  active: boolean;
  title?: string;
}

export interface SiteSkillAction {
  name: string;
  module: RunnerModule;
  worlds?: SiteWorld[];
  verifier?: string;
}

export interface SiteSkillDefinition {
  skillId: string;
  matches: string[];
  requiresActiveTab?: boolean;
  actions: SiteSkillAction[];
}

export interface SiteScriptInstaller {
  install(skillId: string, world: SiteWorld, tab: ActiveTabMetadata): Promise<void>;
}

export interface SiteActionVerifier {
  verify(request: {
    skillId: string;
    action: string;
    tab: ActiveTabMetadata;
    result: unknown;
  }): Promise<boolean>;
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
    if (skill.requiresActiveTab !== false && !matches) {
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
    for (const world of action.worlds ?? []) {
      await this.#installer?.install(request.skillId, world, request.tab);
      trace.push(`install:${world}`);
    }

    const invocation = await this.#runnerHost.invoke({
      module: action.module,
      input: request.input ?? {},
      ctx: {
        ...(request.ctx ?? {}),
        tab: request.tab
      }
    });
    trace.push(`invoke:${request.action}`);

    let verified = true;
    if (action.verifier && this.#verifier) {
      verified = await this.#verifier.verify({
        skillId: request.skillId,
        action: request.action,
        tab: request.tab,
        result: invocation.result
      });
      trace.push(`verify:${action.verifier}`);
      if (!verified) {
        throw new CapabilityError(
          "E_VERIFY_FAILED",
          `Verifier failed for ${request.skillId}.${request.action}`
        );
      }
    }

    return {
      result: invocation.result,
      verified,
      trace
    };
  }
}
