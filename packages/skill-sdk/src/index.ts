export {
  BUILTIN_CAPABILITIES,
  CapabilityRegistry,
  FamilyProviderRegistry,
  createSkillRuntimeContext,
  type SkillRuntimeContext
} from "@bbl-next/core";

export function defineSkill<T>(factory: T): T {
  return factory;
}
