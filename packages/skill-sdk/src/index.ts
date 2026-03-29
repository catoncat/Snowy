export {
  BUILTIN_CAPABILITIES,
  CapabilityRegistry,
  FamilyProviderRegistry,
  SkillInvocationService,
  createSkillRuntimeContext,
  type SkillDefinition,
  type SkillInvocationResult,
  type SkillRuntimeContext
} from "@bbl-next/core";

export function defineSkill<T>(factory: T): T {
  return factory;
}
