# Operating Rules

## Boundary

This workflow is a closeout workflow for the active local slice on `main` / `codex/runtime-debug-dogfood`.

Current facts captured at setup:

- branch: `main`
- local state: `main...origin/main [ahead 6]`
- active Mainline intent: `int_1d820b17`
- live queue: empty
- Mainline preflight: `block`, allowed boundary lowered to `inspect_or_stop`
- preflight blocker: proposed overlaps `int_feb220c2`, `int_4ea34682`, `int_a6221317`

## Allowed Writes

Orchestrator:

- `docs/workflows/2026-06-02-debug-bundle-closeout/**`
- Mainline append/seal metadata after verified closeout
- scoped Git commit after proof is complete and overlap classification is recorded

Execution sessions:

- their own handoff file under `docs/workflows/2026-06-02-debug-bundle-closeout/handoffs/`
- `.ml-cache/dogfood/**` for dogfood artifacts
- `.ml-cache/release-artifacts/**` only if a release command explicitly produces it

## Forbidden

- Do not push branches.
- Do not open PRs.
- Do not merge.
- Do not release or deploy.
- Do not push `main`.
- Do not change root config, dependencies, schemas, public contracts, or product code from execution sessions.
- Do not revert unknown dirty files.
- Do not perform external visible actions on X or other sites without explicit user confirmation for that action.

## Evidence Rules

- A session summary is not proof by itself.
- Proof must be command output, git/Mainline readback, dogfood artifact paths, screenshots/transcripts, or explicit handoff evidence.
- Ordinary chat context must remain compact; raw DOM/events/screenshots/network dumps belong in explicit debug bundle or artifacts.
- Existing-profile X dogfood requires the same real Chrome profile product sidepanel/chat/kernel path, not a temporary profile.

## Verification Commands

Use focused commands first:

```bash
bun test apps/mv3-shell/test/runtime-chat.spec.ts
bun test apps/mv3-shell/test/manifest.spec.ts
bun test packages/kernel/test/llm-message-model.spec.ts packages/kernel/test/loop-engine.spec.ts packages/kernel/test/loop-orchestrator.spec.ts packages/kernel/test/prompt-builder.spec.ts
./node_modules/.bin/biome check <changed files>
bun run typecheck
git diff --check
```

Final gates before commit/seal:

```bash
bun run check
bun run release:cutover:status
mainline preflight --json
```

## Stop Lines

Stop and report if:

- Mainline overlap classification becomes uncertain or contradictory.
- A session needs to edit product code or shared contracts.
- X dogfood would perform like/post/reply/follow/DM/form-submit or any external visible action.
- `bun run check` fails outside the current slice.
- the product sidepanel cannot be found in the existing Chrome profile.
- any command exposes or requests credentials.
