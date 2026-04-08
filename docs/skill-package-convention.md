# Skill Package Convention

## Directory Layout

A minimal skill package follows this structure:

```
my-skill/
├── skill.json        # manifest: id, permissions, matches, metadata
├── handler.ts        # skill handler entry point
├── SKILL.md          # packaged authoring/behavior notes (optional, setup-generated is OK)
├── scripts/          # install-time generated helpers (optional)
└── README.md         # human-readable description (optional)
```

A site skill with injection adds:

```
my-site-skill/
├── skill.json
├── handler.ts
├── content.ts        # content-world injection script (optional)
├── main.ts           # main-world injection script (optional)
└── README.md
```

## skill.json

The manifest declares identity, permissions, and optional site bindings.

```json
{
  "id": "my-namespace.my-skill",
  "version": 1,
  "permissions": ["memfs.read", "memfs.write"],
  "description": "A brief description of what this skill does",
  "kind": "prompt",
  "tags": ["utility"]
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique skill identifier. Convention: `namespace.name` |
| `version` | `number` | Package version (integer) |
| `permissions` | `string[]` | Capability permissions the skill requires |
| `description` | `string` | One-line description for discovery |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `kind` | `"prompt" \| "site" \| "mcp" \| "hybrid"` | Skill type. Default: `"prompt"` |
| `tags` | `string[]` | Discovery tags |
| `matches` | `string[]` | URL patterns for site skills |
| `requiresActiveTab` | `boolean` | Whether the skill needs an active tab match |
| `actions` | `ActionEntry[]` | Named actions the skill exposes |

### Action Entry

```json
{
  "actions": [
    {
      "name": "search_posts",
      "injectionSteps": [
        { "world": "content", "scriptId": "twitter.dom-helper" },
        { "world": "main", "scriptId": "twitter.api-bridge", "runAt": "document_idle" }
      ],
      "verifier": "results_visible"
    }
  ]
}
```

## handler.ts

The handler is the skill's entry point. Use `defineSkill()` from `@bbl-next/skill-sdk`:

```typescript
import { defineSkill } from "@bbl-next/skill-sdk";

export default defineSkill({
  id: "my-namespace.my-skill",
  permissions: ["memfs.read", "memfs.write"],
  handler: async (ctx, action, args) => {
    // ctx.capabilities provides typed access to builtin capabilities
    const content = await ctx.capabilities.memfs.read({ uri: "mem://workspace/data.json" });
    return { action, content };
  }
});
```

### Install-Only Setup Hooks

Skill packages may declare setup hooks in `handler.ts`:

```typescript
import { defineSkill } from "@bbl-next/skill-sdk";

export default defineSkill({
  id: "my-namespace.my-skill",
  permissions: ["memfs.write"],
  setup: {
    install(ctx) {
      ctx.writeFile("SKILL.md", "# My Skill\n");
      ctx.writeFile("scripts/bootstrap.js", "export const ready = true;\n");
      ctx.note("Scaffolded default package files.");
    },
  },
  handler: async () => ({ ok: true }),
});
```

Current contract:

- Only `install` is supported.
- Hooks are executed through `runSkillSetupHooks()`, not through normal runtime invocation.
- Writes must stay inside the canonical package root: `mem://skills/<skillId>/...`.
- `writeFile()` only accepts forward-slash relative paths; absolute paths, `..`, and cross-package writes are rejected.

This means setup hooks may scaffold package-local files, but they must not behave like runtime lifecycle hooks or app-global extension points.

### SkillRuntimeContext

The `ctx` object provides:

| Member | Description |
|--------|-------------|
| `ctx.call(capabilityId, input)` | Call any permitted capability by id |
| `ctx.capabilities.*` | Typed namespace accessors for builtin capabilities |
| `ctx.skills.invoke(skillId, action, args)` | Invoke another skill |
| `ctx.runtime.listCapabilities()` | List all capabilities the skill can access |
| `ctx.runtime.getCapability(id)` | Get a specific capability descriptor |
| `ctx.sessionId` | Current session identifier |
| `ctx.skillId` | This skill's identifier |
| `ctx.depth` | Current call depth (for nested invocations) |
| `ctx.permissions` | Permission set granted to this skill |
| `ctx.trace` | Capability call trace entries |

### Builtin Capability Namespaces

| Namespace | Examples | Description |
|-----------|----------|-------------|
| `memfs` | `read`, `write`, `list`, `mkdir`, `rm`, `mv`, `copy`, `snapshot`, `rehydrate` | Virtual filesystem |
| `page` | `query`, `click`, `fill` | Active page DOM operations |
| `site` | `fetchWithSession` | Site-scoped network with session cookies |
| `tabs` | `list`, `getActive` | Browser tab management |
| `runner` | `invoke` | Isolated JS module execution |
| `skills` | `invoke`, `list` | Cross-skill invocation |
| `runtime` | `listCapabilities`, `getCapability` | Runtime introspection |
| `host` | `exec` | Host machine command execution (high risk) |

## Permission Model

Permissions use a dot-separated namespace:

- `memfs.read` — specific capability
- `memfs.*` — entire namespace
- `*` — all capabilities (discouraged)

Skills only see capabilities matching their declared permissions. Undeclared calls throw `E_PERMISSION_DENIED`.

## Lifecycle

Skills follow this lifecycle:

```
draft → staged → installed → enabled ↔ disabled → archived
```

- `trusted` is a flag on the `enabled` state, not a separate state
- Only `enabled` skills can be invoked by the runtime
- setup hooks currently run before that lifecycle during install planning only; there is no `enable` / `disable` / `runtime` setup phase yet

## ID Convention

Skill IDs use `namespace.name` format:

- `twitter.search` — site skill for Twitter search
- `utils.json-formatter` — utility skill
- `github.pr-review` — site skill for GitHub PRs

Reserved namespace prefixes:
- `builtin.` — reserved for system skills
- `bbl.` — reserved for first-party skills
