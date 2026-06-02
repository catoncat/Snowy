# T2: Audit Dirty Diff And Mainline Overlaps

## Objective

Classify the current dirty worktree and proposed Mainline overlaps so the orchestrator can stage/commit/seal only a coherent debug bundle slice.

## Read

- `docs/workflows/2026-06-02-debug-bundle-closeout/README.md`
- `docs/workflows/2026-06-02-debug-bundle-closeout/operating-rules.md`
- `docs/workflows/2026-06-02-debug-bundle-closeout/milestone-plan.md`
- `mainline preflight --json`
- `mainline show int_1d820b17 --json`
- `mainline show int_feb220c2 --json`
- `mainline show int_4ea34682 --json`
- `mainline show int_a6221317 --json`
- `git status --short --branch`
- `git diff --stat`

## Allowed Writes

- `docs/workflows/2026-06-02-debug-bundle-closeout/handoffs/T2-dirty-diff-mainline.md`

## Forbidden

- No product or docs edits outside the handoff.
- No staging, commit, seal, push, PR, merge, or release.
- No revert of unknown dirty files.

## Required Proof

Handoff must include:

- dirty files grouped by subsystem and likely purpose
- suspicious/unrelated files if any
- deleted/untracked rename pairs, especially `mcp` -> `external` backlog files
- proposed overlap classification for `int_feb220c2`, `int_4ea34682`, `int_a6221317`
- recommendation: safe to proceed, needs human decision, or blocked

## Escalation

Stop if any dirty file appears unrelated to the debug bundle closeout or if a proposed overlap looks semantically contradictory.
