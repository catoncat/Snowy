export {
  BUILTIN_CAPABILITIES,
  CapabilityRegistry,
  FamilyProviderRegistry,
  SkillInvocationService,
  createSkillRuntimeContext,
  typedCapabilities,
  type BuiltinCapabilityMap,
  type SkillDefinition,
  type SkillInvocationResult,
  type SkillRuntimeContext
} from "@bbl-next/core";

import { typedCapabilities, type BuiltinCapabilityMap, type SkillDefinition, type SkillRuntimeContext } from "@bbl-next/core";

export type TypedSkillRuntimeContext = Omit<SkillRuntimeContext, "capabilities"> & {
  capabilities: BuiltinCapabilityMap;
};

export interface SkillDeclaration {
  id: string;
  permissions: string[];
  handler: (ctx: TypedSkillRuntimeContext, action: string, args: unknown) => Promise<unknown>;
}

function withTypedContext(ctx: SkillRuntimeContext): TypedSkillRuntimeContext {
  return {
    ...ctx,
    capabilities: typedCapabilities(ctx)
  };
}

export function defineSkill(declaration: SkillDeclaration): SkillDefinition {
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
    permissions: declaration.permissions,
    handler: (ctx, action, args) => declaration.handler(withTypedContext(ctx), action, args)
  };
}
