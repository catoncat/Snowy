# @bbl-next/core

Capability registry, family provider dispatch, builtin descriptor catalog, skill runtime context, and bootstrap summary builder.

## API Entry

```ts
import {
  CapabilityRegistry,
  FamilyProviderRegistry,
  createSkillRuntimeContext,
  BUILTIN_CAPABILITIES,
} from "@bbl-next/core";
```

## Key Exports

| Category | Examples |
|----------|---------|
| Registry | `CapabilityRegistry`, `FamilyProviderRegistry` |
| Builtin catalog | `BUILTIN_CAPABILITIES`, `BUILTIN_CATALOG`, `BUILTIN_EXPORT_HANDOFFS` |
| Skill context | `createSkillRuntimeContext()`, `SkillRuntimeContext` |
| Invocation | `SkillInvocationService`, `SkillInvocationResult` |
| Bootstrap | `createBootstrapSummary()`, `createHostControlPlaneSnapshot()` |
| Host control | `connectExecutionHost()`, `disconnectExecutionHost()`, `resolveHostSubstrateTarget()` |
| Typed facades | `typedCapabilities()`, `typedCapabilitiesForPermissions()` |

## Dependencies

- `@bbl-next/contracts`
