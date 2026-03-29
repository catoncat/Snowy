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
  "kind": "prompt"
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
