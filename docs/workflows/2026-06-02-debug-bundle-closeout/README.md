# Debug Bundle Closeout Workflow

Status: active
Started: 2026-06-02
Orchestrator thread: 019e86e6-df2c-7e32-afc1-0695055be627
Mainline intent: int_1d820b17

## Objective

Close the Browser Harness debug bundle product slice without opening new backlog scope.

The target state is:

- real product dogfood proves the sidepanel/chat/kernel path can use compact browser primitives, call `runtime_capture_diagnostics`, explicitly call `debug_bundle`, and produce a final assistant response
- X existing-profile dogfood is either verified through the same Chrome profile product path or recorded as a precise blocker
- the dirty worktree is reviewed as one coherent debug bundle slice
- focused tests and release/cutover status evidence are current
- Mainline overlap proposals are classified before commit/seal
- no push, PR, merge, release, or deployment happens without a fresh user instruction

## Non-Goals

- Do not plan a new feature batch.
- Do not add new browser capabilities unless dogfood proves the current primitive set is insufficient.
- Do not revive UID ranking, code-owned scoring, hidden verify, or fallback trees.
- Do not count manual browser actions, fake-site smoke, or temporary-profile artifacts as product dogfood success.

## Source Pointers

- `docs/agent-task-index.md`
- `docs/browser-automation-first-principles.md`
- `docs/browser-automation-dogfood-todo.md`
- `docs/release-cutover-decision-packet-2026-05-27.md`
- `docs/workflow/live-queue.json`
- `mainline show int_1d820b17 --json`
- `mainline show int_feb220c2 --json`
- `mainline show int_4ea34682 --json`
- `mainline show int_a6221317 --json`
