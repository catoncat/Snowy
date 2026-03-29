# @bbl-next/skill-sdk

Thin SDK for skill authors — `defineSkill()` helper with typed capabilities based on declared permissions.

## API Entry

```ts
import { defineSkill } from "@bbl-next/skill-sdk";

const mySkill = defineSkill({
  id: "my-skill",
  permissions: ["page.click", "page.snapshot"] as const,
  handler: async (ctx, input) => {
    const result = await ctx.capabilities.page.click(input);
    return result;
  },
});
```

## Key Exports

| Category | Examples |
|----------|---------|
| Skill definition | `defineSkill()`, `SkillDeclaration` |
| Typed context | `TypedSkillRuntimeContext<Permissions>` |
| Re-exports from core | `BUILTIN_CAPABILITIES`, `CapabilityRegistry`, `createSkillRuntimeContext`, `typedCapabilities` |

## Dependencies

- `@bbl-next/core`
