export {
  BUILTIN_CAPABILITIES,
  CapabilityRegistry,
  FamilyProviderRegistry,
  SkillInvocationService,
  createSkillRuntimeContext,
  typedCapabilities,
  typedCapabilitiesForPermissions,
  type BuiltinCapabilityMap,
  type CapabilityMapForPermissions,
  type SkillDefinition,
  type SkillInvocationResult,
  type SkillRuntimeContext,
} from "@bbl-next/core";

import {
  type CapabilityMapForPermissions,
  type SkillDefinition,
  type SkillRuntimeContext,
  typedCapabilitiesForPermissions,
} from "@bbl-next/core";

export type TypedSkillRuntimeContext<Permissions extends readonly string[]> = Omit<
  SkillRuntimeContext,
  "capabilities"
> & {
  capabilities: CapabilityMapForPermissions<Permissions>;
};

export const SKILL_SETUP_PHASES = ["install"] as const;
export type SkillSetupPhase = (typeof SKILL_SETUP_PHASES)[number];

export interface SkillSetupFileWrite {
  uri: string;
  content: string;
}

export interface SkillSetupPlan {
  skillId: string;
  phase: SkillSetupPhase;
  baseUri: string;
  writes: SkillSetupFileWrite[];
  notes: string[];
}

export interface SkillSetupRequest {
  phase: SkillSetupPhase;
  input?: unknown;
}

export interface SkillSetupContext {
  skillId: string;
  phase: SkillSetupPhase;
  baseUri: string;
  permissions: readonly string[];
  input: unknown;
  writeFile(relativePath: string, content: string): void;
  note(message: string): void;
}

export type SkillSetupHook = (ctx: SkillSetupContext) => Promise<void> | void;

export type SkillSetupHookRegistry = Partial<Record<SkillSetupPhase, SkillSetupHook[]>>;

export type SkillSetupDeclaration = Partial<
  Record<SkillSetupPhase, SkillSetupHook | SkillSetupHook[]>
>;

export interface ExecutableSkillDefinition extends SkillDefinition {
  setupHooks: SkillSetupHookRegistry;
}

export interface SkillDeclaration<Permissions extends readonly string[] = string[]> {
  id: string;
  permissions: Permissions;
  setup?: SkillSetupDeclaration;
  handler: (
    ctx: TypedSkillRuntimeContext<Permissions>,
    action: string,
    args: unknown,
  ) => Promise<unknown>;
}

/**
 * Skill SDK intentionally stays thin.
 *
 * Lifecycle/version engine contracts live in `@bbl-next/contracts`, while
 * BrowserVFS owns snapshot storage and rollback primitives. A future Skill
 * Studio UI should consume those engine boundaries instead of redefining them
 * inside the SDK.
 */

function withTypedContext<Permissions extends readonly string[]>(
  ctx: SkillRuntimeContext,
  permissions: Permissions,
): TypedSkillRuntimeContext<Permissions> {
  return {
    ...ctx,
    capabilities: typedCapabilitiesForPermissions(ctx, permissions),
  };
}

function isSkillSetupPhase(value: string): value is SkillSetupPhase {
  return (SKILL_SETUP_PHASES as readonly string[]).includes(value);
}

function normalizeSetupHooks(setup: SkillSetupDeclaration | undefined): SkillSetupHookRegistry {
  const normalized: SkillSetupHookRegistry = {};
  if (!setup) {
    return normalized;
  }

  for (const [phase, rawHooks] of Object.entries(setup)) {
    if (!isSkillSetupPhase(phase)) {
      throw new Error(`defineSkill: unsupported setup phase ${phase}`);
    }
    const hooks = Array.isArray(rawHooks) ? rawHooks : [rawHooks];
    if (hooks.some((hook) => typeof hook !== "function")) {
      throw new Error(`defineSkill: setup hooks for ${phase} must be functions`);
    }
    normalized[phase] = [...hooks];
  }

  return normalized;
}

function skillPackageBaseUri(skillId: string): string {
  return `mem://skills/${skillId}`;
}

function normalizeRelativeSetupPath(relativePath: string): string {
  const trimmed = String(relativePath || "").trim();
  if (!trimmed) {
    throw new Error("runSkillSetupHooks: relative path must be a non-empty string");
  }
  if (trimmed.startsWith("mem://") || trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    throw new Error("runSkillSetupHooks: setup hooks must write package-relative paths");
  }
  if (trimmed.includes("\\")) {
    throw new Error("runSkillSetupHooks: setup hooks must use forward-slash relative paths");
  }

  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("runSkillSetupHooks: setup hooks must stay within the skill package root");
  }

  return segments.join("/");
}

export function defineSkill<const Permissions extends readonly string[]>(
  declaration: SkillDeclaration<Permissions>,
): ExecutableSkillDefinition {
  if (!declaration.id || typeof declaration.id !== "string") {
    throw new Error("defineSkill: id must be a non-empty string");
  }
  if (!Array.isArray(declaration.permissions)) {
    throw new Error("defineSkill: permissions must be an array");
  }
  if (typeof declaration.handler !== "function") {
    throw new Error("defineSkill: handler must be a function");
  }
  const setupHooks = normalizeSetupHooks(declaration.setup);
  return {
    id: declaration.id,
    permissions: [...declaration.permissions],
    setupHooks,
    handler: (ctx, action, args) =>
      declaration.handler(withTypedContext(ctx, declaration.permissions), action, args),
  };
}

export async function runSkillSetupHooks(
  skill: Pick<ExecutableSkillDefinition, "id" | "permissions" | "setupHooks">,
  request: SkillSetupRequest,
): Promise<SkillSetupPlan> {
  const hooks = skill.setupHooks[request.phase] ?? [];
  const baseUri = skillPackageBaseUri(skill.id);
  const writes: SkillSetupFileWrite[] = [];
  const notes: string[] = [];
  const ctx: SkillSetupContext = {
    skillId: skill.id,
    phase: request.phase,
    baseUri,
    permissions: [...skill.permissions],
    input: request.input,
    writeFile(relativePath, content) {
      writes.push({
        uri: `${baseUri}/${normalizeRelativeSetupPath(relativePath)}`,
        content,
      });
    },
    note(message) {
      notes.push(String(message));
    },
  };

  for (const hook of hooks) {
    await hook(ctx);
  }

  return {
    skillId: skill.id,
    phase: request.phase,
    baseUri,
    writes,
    notes,
  };
}
