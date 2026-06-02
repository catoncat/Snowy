# @bbl-next/skill-sdk

Thin SDK for skill authors — `defineSkill()` helper with typed capabilities based on declared permissions.

Also includes the install-only setup hook contract:

- `SKILL_SETUP_PHASES` (`["install"]`)
- `runSkillSetupHooks()`
- `ExecutableSkillDefinition.setupHooks`

## API Entry

```ts
import { defineSkill } from "@bbl-next/skill-sdk";

const mySkill = defineSkill({
  id: "my-skill",
  permissions: ["page.click_xy", "page.screenshot"] as const,
  handler: async (ctx, input) => {
    const result = await ctx.capabilities.page.click_xy(input);
    return result;
  },
});
```

## Install-Time Setup Hooks

```ts
import { defineSkill, runSkillSetupHooks } from "@bbl-next/skill-sdk";

const mySkill = defineSkill({
  id: "my-skill",
  permissions: ["memfs.write"] as const,
  setup: {
    install(ctx) {
      ctx.writeFile("SKILL.md", "# My Skill\n");
      ctx.writeFile("scripts/bootstrap.js", "export const ready = true;\n");
      ctx.note("Prepared package-local bootstrap files.");
    },
  },
  handler: async () => ({ ok: true }),
});

const plan = await runSkillSetupHooks(mySkill, { phase: "install" });
```

Setup contract:

- only the `install` phase is supported
- hooks produce a `SkillSetupPlan`; normal skill invocation does not run setup hooks
- writes are restricted to package-relative paths under `mem://skills/<skillId>/...`
- runtime / enable / disable phases are intentionally unsupported for now

## Key Exports

| Category | Examples |
|----------|---------|
| Skill definition | `defineSkill()`, `SkillDeclaration` |
| Setup hooks | `SKILL_SETUP_PHASES`, `runSkillSetupHooks()`, `SkillSetupPlan` |
| Typed context | `TypedSkillRuntimeContext<Permissions>` |
| Re-exports from core | `BUILTIN_CAPABILITIES`, `CapabilityRegistry`, `createSkillRuntimeContext`, `typedCapabilities` |

## Dependencies

- `@bbl-next/core`
