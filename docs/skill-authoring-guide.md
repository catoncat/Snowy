# Skill Authoring Guide

This guide walks you through creating a minimal skill package for Browser Brain Loop Next.

## Prerequisites

- Familiarity with TypeScript
- Understanding of the [Skill Package Convention](./skill-package-convention.md)

## Quick Start

### 1. Create the Skill File

```typescript
// my-skill/handler.ts
import { defineSkill } from "@bbl-next/skill-sdk";

export default defineSkill({
  id: "my-namespace.hello",
  permissions: ["memfs.read"],
  handler: async (ctx, action, args) => {
    if (action === "greet") {
      const data = await ctx.capabilities.memfs.read({ uri: "mem://workspace/name.txt" });
      return { greeting: `Hello, ${data}!` };
    }
    return { error: `Unknown action: ${action}` };
  }
});
```

### 2. Create the Manifest

```json
{
  "id": "my-namespace.hello",
  "version": 1,
  "permissions": ["memfs.read"],
  "description": "A simple greeting skill",
  "kind": "prompt",
  "entry": "handler.js"
}
```

### 3. Register and Invoke

```typescript
import { SkillInvocationService, CapabilityRegistry, FamilyProviderRegistry, BUILTIN_CAPABILITIES } from "@bbl-next/skill-sdk";
import mySkill from "./my-skill/handler";

const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
const providers = new FamilyProviderRegistry();
// ... register providers for each family ...

const service = new SkillInvocationService({ registry, providers });
service.register(mySkill);

const result = await service.invoke({
  sessionId: "session-1",
  skillId: "my-namespace.hello",
  action: "greet",
  args: {}
});
```

## Install-Time Setup Hooks

Skill setup hooks are install-time only. They are declared in `defineSkill({ setup })` and compiled into a setup plan through `runSkillSetupHooks()`; normal runtime invocation does not execute them.

```typescript
import { defineSkill, runSkillSetupHooks } from "@bbl-next/skill-sdk";

const skill = defineSkill({
  id: "my-namespace.hello",
  permissions: ["memfs.write"] as const,
  setup: {
    install(ctx) {
      ctx.writeFile("SKILL.md", "# My Skill\n");
      ctx.writeFile("scripts/bootstrap.js", "export const ready = true;\n");
      ctx.note("Generated default authoring files during install.");
    },
  },
  handler: async () => ({ ok: true }),
});

const plan = await runSkillSetupHooks(skill, {
  phase: "install",
});
```

### Setup Hook Contract

- Only the `install` phase is supported today.
- Setup hooks may only emit package-relative writes under `mem://skills/<skillId>/...`.
- `ctx.writeFile()` rejects absolute paths, `..`, backslashes, and any write outside the canonical skill package root.
- Setup hooks are for package scaffolding and metadata/bootstrap files; they are not runtime side-effect hooks.

The runtime skill-management bridge now preserves install metadata instead of
reducing `skills.install` to only a `skillId`: callers may pass a setup plan
through `ctx.call("skills.install", { skillId, setupPlan })`, or through the
typed helper's optional second argument. Core validates `skillId` and forwards
the complete input payload to the runtime manager. The shared MV3 runtime
materializes valid setup-plan writes into BrowserVFS under
`mem://skills/<skillId>/...` before updating lifecycle state; invalid plans
are rejected before a skill is recorded as installed. Restarted runtimes can
read those package files through the normal `memfs.*` capability path.
Restarted shared MV3 runtimes also discover valid `skill.json` manifests from
BrowserVFS and register enabled package handlers as executable skills, so
`skills.invoke` can load the package `entry` file through the existing JS runner
without a test-only `skillDefinitions` injection. Malformed manifests are
skipped during boot and fail invocation with a structured capability error.
Valid manifests are projected into `skills.summary` and `runtime.bootstrap` as
per-skill `items`, including action names, site matches, active-tab requirement,
entry, version, kind, description, permissions, and tags.
Normal skill invocation still never executes setup hooks.

The same shared management path now covers Studio authoring and updates. A
caller can submit `skills.install` with a setup plan that writes `SKILL.md`,
`skill.json`, and the package handler into `mem://skills/<skillId>/...`; the
runtime refreshes package discovery immediately, so the updated package can be
enabled and invoked without waiting for a restart. If the package root already
exists, the previous package files are snapshotted before the update and exposed
through `skills.summary.items[].versionSurface.rollbackTarget`; `skills.rollback`
can restore that snapshot and make the previous handler invokable again.

The sidepanel Skill surface consumes the same path: its package editor builds a
setup plan from manifest JSON, handler source, and `SKILL.md`, then sends
`skills.install` with `metadata.source = "sidepanel.studio"`. It does not keep a
private Studio registry.

### Recommended File Layout for Setup Writes

- `SKILL.md` — author-facing instructions or packaged behavior contract
- `skill.json` — manifest with `id`, `version`, `permissions`, and optional `entry`
- `handler.js` — packaged runtime entry loaded by the shared MV3 runtime
- `scripts/*.js` — helper scripts that ship with the skill package
- `assets/*` — static package assets needed after install

Avoid writing workspace-global files or host-side paths from setup hooks. If a workflow needs enable/disable/runtime callbacks, that is not part of the current contract and should be modeled elsewhere.

## Creating a Site Skill

Site skills bind to specific URLs and can inject scripts into web pages.

```typescript
// twitter-search/handler.ts
import { defineSkill } from "@bbl-next/skill-sdk";

export default defineSkill({
  id: "twitter.search",
  permissions: ["site.fetch_with_session"],
  handler: async (ctx, action, args) => {
    if (action === "search_posts") {
      return ctx.capabilities.site.fetchWithSession({
        url: `https://x.com/i/api/graphql/search?q=${args.query}`,
        method: "GET"
      });
    }
    return { error: `Unknown action: ${action}` };
  }
});
```

Site skill manifest with URL matching:

```json
{
  "id": "twitter.search",
  "version": 1,
  "permissions": ["site.fetch_with_session"],
  "description": "Search posts on Twitter/X",
  "kind": "site",
  "matches": ["https://x.com/*", "https://twitter.com/*"],
  "requiresActiveTab": true,
  "actions": [
    {
      "name": "search_posts",
      "injectionSteps": [
        { "world": "content", "scriptId": "twitter.dom-helper" }
      ],
      "verifier": "results_visible"
    }
  ]
}
```

## Using Typed Capabilities

The `ctx.capabilities` object provides typed access to all builtin namespaces:

```typescript
handler: async (ctx, action, args) => {
  // Direct typed access — IDE autocomplete works
  await ctx.capabilities.memfs.write({
    uri: "mem://workspace/output.json",
    content: JSON.stringify({ data: "hello" })
  });

  const files = await ctx.capabilities.memfs.list({ uri: "mem://workspace/" });

  // Or use ctx.call() for any capability by id
  const result = await ctx.call("page.click", { uid: "submit-btn" });

  return { files, result };
}
```

## Invoking Other Skills

Skills can invoke other skills via `ctx.skills.invoke()`:

```typescript
handler: async (ctx, action, args) => {
  // Invoke another skill — depth is tracked automatically
  const searchResult = await ctx.skills.invoke(
    "twitter.search",
    "search_posts",
    { query: args.topic }
  );
  return { searchResult };
}
```

Call depth is limited to `MAX_SKILL_CALL_DEPTH` (3). Exceeding it throws `E_REENTRANCY_BLOCKED`.

## Permission Best Practices

1. Request the minimum permissions your skill needs
2. Use specific permissions (`memfs.read`) over wildcards (`memfs.*`)
3. Avoid `*` (all permissions) unless your skill is a meta-orchestrator
4. High-risk capabilities (`host.exec`) require user confirmation at runtime

## Validation

`defineSkill()` validates your declaration at definition time:

- `id` — must be a non-empty string
- `permissions` — must be an array
- `setup` — only `install` is accepted, and every hook must be a function
- `handler` — must be a function

Invalid declarations throw immediately with a descriptive error message.

## Testing Your Skill

```typescript
import { describe, it, expect } from "vitest";
import { SkillInvocationService, CapabilityRegistry, FamilyProviderRegistry, BUILTIN_CAPABILITIES } from "@bbl-next/skill-sdk";
import mySkill from "./handler";

describe("my-skill", () => {
  it("handles greet action", async () => {
    const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "memfs",
      invoke: ({ binding }) => {
        if (binding.operation === "read") return "World";
        return null;
      }
    });

    const service = new SkillInvocationService({ registry, providers });
    service.register(mySkill);

    const result = await service.invoke({
      sessionId: "test",
      skillId: "my-namespace.hello",
      action: "greet",
      args: {}
    });

    expect(result.result).toEqual({ greeting: "Hello, World!" });
  });
});
```

## Next Steps

- Read the [Skill Package Convention](./skill-package-convention.md) for the full manifest spec
- Review [start-here.md](./start-here.md) for architecture context
- Check `packages/skill-sdk/src/index.ts` for the latest API surface
