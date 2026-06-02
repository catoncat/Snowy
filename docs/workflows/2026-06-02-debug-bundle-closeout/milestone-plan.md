# Milestone Plan

## M1: Setup

Proof required:

- Orchestrator Goal exists.
- Workflow directory and task files exist.
- Mainline preflight state and overlap candidates are recorded.

## M2: Product Dogfood Truth

Proof required:

- product path shows diagnostics -> debug_bundle -> final assistant response, or
- handoff records exact blocker and artifact path.

Required artifacts:

- task page screenshot or equivalent UI evidence
- product UI screenshot or transcript
- observability timeline or raw tail reference
- debug bundle reference
- network/artifact path when available

## M3: Dirty Diff And Mainline Classification

Proof required:

- dirty files grouped by purpose
- deleted/renamed backlog files explained
- proposed overlaps classified with `mainline show` evidence
- no unknown unrelated write set is included

## M4: Verification Gate

Proof required:

- focused tests run with command names and results
- `bun run check` result recorded
- `bun run release:cutover:status` result recorded
- blockers are separated into current-slice vs unrelated

## M5: Commit And Seal Handoff

Proof required:

- status readback immediately before staging
- only intended files staged
- commit created with scoped Chinese commit message
- Mainline append records proof and overlap classification
- Mainline seal submitted if preflight allows

Do not push or open a PR unless the user explicitly asks.
