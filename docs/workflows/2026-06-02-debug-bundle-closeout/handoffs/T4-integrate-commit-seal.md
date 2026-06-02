# T4 Handoff: Integrate, Commit, And Seal Preparation

Status: prepared-no-commit
Generated: 2026-06-02T07:15:00Z
Owner: orchestrator
Mainline intent: `int_1d820b17`

## Conclusion

The closeout evidence is ready for a scoped commit/seal pass, but this T4 pass did not stage, commit, seal, push, open a PR, merge, release, or deploy.

Why no commit/seal happened here:

- Mainline preflight still returns `level=block`, `ok_to_continue=false`, and `allowed_boundary=inspect_or_stop` because three proposed overlaps remain visible.
- The worktree has 61 tracked dirty files and 3 untracked entries, including this workflow directory.
- The correct next step is a deliberate integrator commit/seal pass that stages coherent groups, records the overlap classification, and then re-runs preflight.

## Evidence Integrated

### T1: real product dogfood

Handoff: `docs/workflows/2026-06-02-debug-bundle-closeout/handoffs/T1-real-product-dogfood.md`

Verified artifact:

`.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-rs1/`

Key proof:

- product sidepanel/chat/kernel path completed `page_info -> runtime_capture_diagnostics -> debug_bundle -> final assistant response`
- `report.md`: `Timed out: false`, `Completion reason: assistant_text`, network failures `0`
- `chat-bootstrap.json`: final assistant text present and complete
- `debug-bundle.json`: `toolCallCount: 8`, `laneCount: 4`
- lane map marks `tabs_get_active`, `page_info`, `runtime_capture_diagnostics`, and `debug_bundle` as `productPath: true`
- `runtime_capture_diagnostics` and `debug_bundle` tool calls succeeded

Boundary:

- default `rs` provider returned HTTP 403 before browser tool calls; final proof used configured provider `rs1`
- this is MDN read-only product proof, not X existing-profile proof

### T2: dirty diff and Mainline overlap audit

Handoff: `docs/workflows/2026-06-02-debug-bundle-closeout/handoffs/T2-dirty-diff-mainline.md`

Key conclusion:

- no confirmed unrelated dirty file found
- dirty diff is broad but related to debug bundle / Browser Harness closeout
- backlog `mcp` -> `external` files should be staged as delete/replacement pairs
- proposed overlaps are real overlaps but not semantic conflicts:
  - `int_a6221317`: direct predecessor for conversation observability
  - `int_4ea34682`: earlier product/X dogfood proof, now historical/diagnostic predecessor; current closeout remains read-only for X
  - `int_feb220c2`: broader Browser Harness debug predecessor/adjacent closeout

### T3: verification gate

Handoff: `docs/workflows/2026-06-02-debug-bundle-closeout/handoffs/T3-verification-gate.md`

Green commands:

- `bun test apps/mv3-shell/test/runtime-chat.spec.ts`
- `bun test apps/mv3-shell/test/manifest.spec.ts`
- `bun test packages/kernel/test/llm-message-model.spec.ts packages/kernel/test/loop-engine.spec.ts packages/kernel/test/loop-orchestrator.spec.ts packages/kernel/test/prompt-builder.spec.ts`
- `bun run typecheck`
- `git diff --check`
- `bun run check`

Cutover gate:

- `bun run release:cutover:status` exits 1, but nested acceptance/build/smoke/check are green
- failure is delivery state only: dirty worktree, local `main` ahead `origin/main` by 6 commits, and no PR/main-push path chosen

## Current Readback

`git status --short --branch`:

- `main...origin/main [ahead 6]`
- 61 tracked dirty files
- 3 untracked entries:
  - `docs/backlog/2026-03-29-bridge-side-external-export-is-still-descriptor-only.md`
  - `docs/backlog/2026-04-15-external-export-handoff-projection-is-typed-but-not-routed.md`
  - `docs/workflows/`

`mainline preflight --json`:

- `level`: `block`
- `ok_to_continue`: `false`
- `allowed_boundary`: `inspect_or_stop`
- proposed overlaps:
  - `int_feb220c2`, block, score 26
  - `int_4ea34682`, block, score 5
  - `int_a6221317`, block, score 5
  - `int_feb220c2`, warn, score 2

## Recommended Commit Scope

Stage deliberately. Do not use broad `git add .` unless the integrator has rechecked every group.

Recommended coherent groups:

1. Product/runtime/debug bundle code and tests
   - `apps/mv3-shell/src/background.ts`
   - `apps/mv3-shell/src/page-hook.ts`
   - `apps/mv3-shell/src/runtime-services.ts`
   - `apps/mv3-shell/src/sidepanel/state.ts`
   - `apps/mv3-shell/test/manifest.spec.ts`
   - `apps/mv3-shell/test/runtime-chat.spec.ts`
   - `apps/mv3-shell/test/sidepanel-app.spec.ts`
   - `apps/mv3-shell/test/sidepanel-state.spec.ts`
   - `packages/contracts/test/contracts.spec.ts`
   - `packages/core/src/index.ts`
   - `packages/core/test/core.spec.ts`
   - `packages/kernel/src/loop-orchestrator.ts`
   - `packages/kernel/src/prompt-builder.ts`
   - `packages/kernel/test/llm-message-model.spec.ts`
   - `packages/kernel/test/loop-engine.spec.ts`
   - `packages/kernel/test/loop-orchestrator.spec.ts`
   - `packages/kernel/test/prompt-builder.spec.ts`
   - `packages/kernel/test/session-store.spec.ts`
   - `packages/site-runtime/test/site-runtime.spec.ts`
   - `scripts/dogfood-existing-chrome-tab.js`
   - `scripts/dogfood-real-browser-network.ts`

2. Browser Harness / cutover / document freshness docs
   - all modified docs listed in `git status`, after rechecking broad doc scope
   - pair both backlog deletes with their `external` replacement files

3. Workflow control plane
   - `docs/workflows/2026-06-02-debug-bundle-closeout/**`

Do not stage `.ml-cache/dogfood/**` unless the project intentionally tracks dogfood artifacts. Current repo pattern appears to treat `.ml-cache` as local evidence, not source.

## Suggested Commit Message

```text
feat(browser): 收口 debug bundle 产品链路
```

## Mainline Append / Seal Notes

Before seal, append a concise Chinese summary that includes:

- T1 MDN product dogfood artifact path and result
- T2 overlap classification: same actor / same `codex/runtime-debug-dogfood` lane, predecessor/adjacent, no external semantic conflict
- T3 verification: focused tests, `bun run typecheck`, `git diff --check`, `bun run check` green
- cutover status still blocked only by dirty/ahead delivery state before commit

Then re-run:

```bash
mainline preflight --json
```

If it still blocks on the same proposed overlaps after the classification is appended, use `mainline seal --prepare --json` only if repository policy allows proceeding from classified same-thread overlap. Otherwise stop and ask for human judgment.

## Stop Lines

Do not cross these without fresh user instruction:

- push branch
- push `main`
- open or update PR
- merge
- release/deploy
- perform X visible actions
- count X existing-profile dogfood as passed

## Remaining Work

1. Run a final integrator readback.
2. Stage the intended file groups deliberately.
3. Commit the scoped closeout.
4. Append Mainline evidence.
5. Re-run preflight.
6. Prepare and submit Mainline seal if allowed.
7. Stop before push/PR/release.
