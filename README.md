[中文版](README.zh-CN.md)

# browser-brain-loop-next

Future mainline for the post-LIFO Browser Brain Loop runtime.

## Prerequisites

- [Bun](https://bun.sh/) ≥ 1.3

## Quick Start

```bash
git clone <repo-url> && cd browser-brain-loop-next
bun install
bun run check   # typecheck + lint + test
```

## Monorepo Structure

```
packages/
  contracts/      Canonical model — types, validation, state machines
  core/           Capability registry, provider dispatch, skill runtime context
  browser-vfs/    In-browser mem:// VFS with IndexedDB persistence
  js-runner/      Isolated JS execution host with RPC protocol
  site-runtime/   Active-tab site skill matching and injection
  skill-sdk/      Skill author SDK (defineSkill, typed capabilities)
  kernel/         Session store, run state machine, loop engine, compaction
apps/
  mv3-shell/      Minimal Chrome MV3 extension shell
```

## Packages

| Package | Description |
|---------|-------------|
| [`@bbl-next/contracts`](packages/contracts/) | Canonical descriptor model, errors, skill lifecycle, kernel session types |
| [`@bbl-next/core`](packages/core/) | Capability registry, family providers, tool projection, skill runtime context |
| [`@bbl-next/browser-vfs`](packages/browser-vfs/) | `mem://` VFS with `ephemeral/workspace/library` scopes, IndexedDB persistence |
| [`@bbl-next/js-runner`](packages/js-runner/) | Isolated JS runner host with invoke/cancel/health RPC |
| [`@bbl-next/site-runtime`](packages/site-runtime/) | Active-tab site skill activation, injection planning, verifier flow |
| [`@bbl-next/skill-sdk`](packages/skill-sdk/) | Skill-facing helpers — `defineSkill()`, typed capabilities |
| [`@bbl-next/kernel`](packages/kernel/) | Session management, run state machine, loop engine, compaction |
| [`mv3-shell`](apps/mv3-shell/) | Minimal Chrome MV3 shell (background worker, offscreen, page hook) |

## Commands

```bash
bun install          # install all workspace dependencies
bun run test         # run all tests (vitest)
bun run typecheck    # TypeScript type check
bun run check        # typecheck + lint + test
bun run lint         # biome check (requires biome installed)
bun run lint:fix     # biome auto-fix
```

## Docs

- [Start Here](docs/start-here.md) — repo purpose and mandatory reading order
- [Source Of Truth Map](docs/source-of-truth-map.md) — which docs actually drive implementation
- [Locked Decisions](docs/locked-decisions-2026-03-29.md) — architecture constraints that should not drift
- [Recovery Report](docs/reviews/2026-03-29-vnext-architecture-recovery-report.md) — why the mainline has been reclassified back to browser-side kernel
- [Kernel Skeleton Design](docs/kernel-skeleton-design.md) — current `packages/kernel` mainline shape and slice plan
- [Module Tracking Ledger](docs/module-tracking-ledger.json) — machine-readable module truth for workflow skills and planning
- [V0 Slice](docs/v0-slice.md) — what has already been implemented
- [AI-Native Surface Design](docs/ai-native-capability-surface-design.md) — how the product exposes itself to AI
- [AI Surface Index](docs/ai-surface-index.md) — compact map of current and target AI surface
- [Legacy Reference Map](docs/legacy-reference-map.md) — old repo and research repo lookup
- [Migration Matrix](docs/legacy-to-vnext-migration-matrix.md) — old repo feature areas to vNext targets
- [Parity Dashboard](docs/migration-parity-dashboard.md) — quick migration status view
- [Cutover Readiness](docs/cutover-readiness-criteria.md) — objective criteria for switching mainline

## Skill Authoring

- [Skill Package Convention](docs/skill-package-convention.md) — directory layout, manifest, ID rules
- [Skill Authoring Guide](docs/skill-authoring-guide.md) — quick start, examples, testing
