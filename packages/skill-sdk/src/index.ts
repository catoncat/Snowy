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

export interface SkillDeclaration {
  id: string;
  permissions: string[];
  handler: (ctx: import("@bbl-next/core").SkillRuntimeContext, action: string, args: unknown) => Promise<unknown>;
}

export function defineSkill(declaration: SkillDeclaration): import("@bbl-next/core").SkillDefinition {
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
    handler: declaration.handler
  };
}
