# @bbl-next/site-runtime

Active-tab site skill matching, injection planning, content/main world install, action invocation, and verifier flow.

## API Entry

```ts
import { SiteSkillRegistry, SiteSkillRuntime, buildInjectionPlan } from "@bbl-next/site-runtime";
```

## Key Exports

| Category | Examples |
|----------|---------|
| Registry | `SiteSkillRegistry` — `get()`, `matchActiveTab()` |
| Runtime | `SiteSkillRuntime` — `invoke()` (match → plan → install → run → verify) |
| Planning | `buildInjectionPlan()` — create injection plan from action definition |
| Types | `ActiveTabMetadata`, `InjectionPlan`, `SiteSkillDefinition`, `SiteSkillAction` |
| Interfaces | `SiteScriptInstaller`, `SiteActionVerifier`, `SiteInvokeContext` |

## Dependencies

- `@bbl-next/contracts`
- `@bbl-next/js-runner`
