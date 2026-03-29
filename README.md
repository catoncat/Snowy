# browser-brain-loop-next

Future mainline for the post-LIFO Browser Brain Loop runtime.

## Docs

- [Source Of Truth Map](docs/source-of-truth-map.md) - which docs actually drive implementation
- [Start Here](docs/start-here.md) - repo purpose and mandatory reading order
- [Locked Decisions](docs/locked-decisions-2026-03-29.md) - architecture constraints that should not drift
- [V0 Slice](docs/v0-slice.md) - what has already been implemented
- [Legacy Reference Map](docs/legacy-reference-map.md) - old repo and research repo lookup

## Packages

- `@bbl-next/contracts`: canonical descriptor model, errors, lifecycle
- `@bbl-next/core`: capability registry, family providers, tool projection, skill ctx
- `@bbl-next/browser-vfs`: `mem://` VFS with `ephemeral/workspace/library`
- `@bbl-next/js-runner`: isolated JS runner host
- `@bbl-next/site-runtime`: active-tab site skill activation
- `@bbl-next/skill-sdk`: skill-facing helpers (`defineSkill`, typed capabilities)
- `mv3-shell`: minimal Chrome MV3 shell

## Skill Authoring

- [Skill Package Convention](docs/skill-package-convention.md) — directory layout, manifest, ID rules
- [Skill Authoring Guide](docs/skill-authoring-guide.md) — quick start, examples, testing

## Commands

- `bun install`
- `bun run test`
- `bun run typecheck`
- `bun run check`
