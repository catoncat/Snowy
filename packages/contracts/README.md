# @bbl-next/contracts

Canonical model for the entire Browser Brain Loop system — shared types, constants, validation functions, and state machines.

## API Entry

```ts
import {
  CapabilityDescriptor,
  ToolContract,
  CapabilityError,
  descriptorToToolContract,
  canTransitionSkillState,
  transitionSkillState,
} from "@bbl-next/contracts";
```

## Key Exports

| Category | Examples |
|----------|---------|
| Capability model | `CapabilityDescriptor`, `ExecutionBinding`, `ToolContract`, `CapabilityError` |
| Projection | `descriptorToToolContract()`, `descriptorToCapabilityExportHandoff()` |
| Validation | `assertCapabilityDescriptor()`, `isPublicCapabilityNamespace()` |
| Skill lifecycle | `SkillStatus`, `transitionSkillState()`, `canActorTransitionSkillState()` |
| Skill versioning | `skillVersionUri()`, `selectLatestTrustedSkillVersion()`, `createSkillVersionPolicy()` |
| Kernel / session | `SessionHeader`, `SessionEntry`, `RunPhase`, `LoopTurn`, `CompactionDraft` |
| Adapter interfaces | `KernelLlmAdapter`, `SessionStorage` |

## Dependencies

None — this is the leaf contract package.
