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
  type SkillRuntimeContext
} from "@bbl-next/core";

import {
  typedCapabilitiesForPermissions,
  type CapabilityMapForPermissions,
  type SkillDefinition,
  type SkillRuntimeContext
} from "@bbl-next/core";

export type TypedSkillRuntimeContext<Permissions extends readonly string[]> = Omit<
  SkillRuntimeContext,
  "capabilities"
> & {
  capabilities: CapabilityMapForPermissions<Permissions>;
};

export interface SkillDeclaration<Permissions extends readonly string[] = string[]> {
  id: string;
  permissions: Permissions;
  handler: (
    ctx: TypedSkillRuntimeContext<Permissions>,
    action: string,
    args: unknown
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
  permissions: Permissions
): TypedSkillRuntimeContext<Permissions> {
  return {
    ...ctx,
    capabilities: typedCapabilitiesForPermissions(ctx, permissions)
  };
}

export function defineSkill<const Permissions extends readonly string[]>(
  declaration: SkillDeclaration<Permissions>
): SkillDefinition {
  if (!declaration.id || typeof declaration.id !== "string") {
    throw new Error("defineSkill: id must be a non-empty string");
  }
  if (!Array.isArray(declaration.permissions)) {
    throw new Error("defineSkill: permissions must be an array");
  }
  if (typeof declaration.handler !== "function") {
    throw new Error("defineSkill: handler must be a function");
  }
  return {
    id: declaration.id,
    permissions: [...declaration.permissions],
    handler: (ctx, action, args) =>
      declaration.handler(withTypedContext(ctx, declaration.permissions), action, args)
  };
}
