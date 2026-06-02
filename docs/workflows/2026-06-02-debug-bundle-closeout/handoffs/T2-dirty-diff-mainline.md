# T2 Handoff: Dirty Diff And Mainline Overlaps

Status: complete
Audited at: 2026-06-02

## Conclusion

Recommendation: safe for T4 integrator to proceed with closeout after recording this classification in Mainline and re-running preflight. I found no dirty file that is clearly unrelated to the debug bundle / Browser Harness closeout, and no proposed Mainline overlap that looks semantically contradictory.

Important boundary: `mainline preflight --json` still returns `block` with `allowed_boundary=inspect_or_stop` because the proposed overlaps remain unsealed/unresolved from Mainline's point of view. This handoff is the classification evidence; it does not itself clear preflight.

## Dirty Worktree Summary

Command evidence:

- `git status --short --branch`: `## main...origin/main [ahead 6]`; 61 tracked diff files, 2 deleted backlog files, 2 untracked backlog replacement files, and untracked `docs/workflows/2026-06-02-debug-bundle-closeout/**`.
- `git diff --stat`: 61 files changed, 2344 insertions, 1165 deletions.
- `git log --oneline --decorate --max-count=10 --left-right origin/main...HEAD`: local HEAD contains 6 commits on `main` / `codex/runtime-debug-dogfood`: `46f7880`, `2ff633e`, `801d0a7`, `2e5e2eb`, `4cd9559`, `527b576`.

## Grouped Dirty Files

### Product runtime and Browser Harness actions

Files:

- `apps/mv3-shell/src/background.ts`
- `apps/mv3-shell/src/page-hook.ts`
- `apps/mv3-shell/src/runtime-services.ts`
- `packages/core/src/index.ts`
- `packages/kernel/src/loop-orchestrator.ts`
- `packages/kernel/src/prompt-builder.ts`

Classification: coherent with debug bundle closeout. Diff evidence includes `runtime.capture_diagnostics`, `debug.bundle`, `browserActionEvidence`, `laneMap`, `observability.timeline`, `observability.rawEventTail`, and Browser Harness primitive guidance (`page_info`, `page_click_xy`, `page_type_text`, `page_scroll`, `page_screenshot`). The ordinary chat path is kept compact while full evidence is routed through explicit debug/artifact/observability reads.

### Sidepanel projection and stopped-state UX

Files:

- `apps/mv3-shell/src/sidepanel/state.ts`
- `apps/mv3-shell/test/sidepanel-app.spec.ts`
- `apps/mv3-shell/test/sidepanel-state.spec.ts`

Classification: coherent adjacent fix for the same product path. Diff evidence adds `terminalStatus` / `stepCount` handling so blank non-`done` `assistant.done` events render as stopped/failed instead of normal success. This matches active intent turn text about product smoke stopping after repeated diagnostics without final assistant text.

### Tests for compact context, debug bundle, and primitive rename

Files:

- `apps/mv3-shell/test/manifest.spec.ts`
- `apps/mv3-shell/test/runtime-chat.spec.ts`
- `packages/contracts/test/contracts.spec.ts`
- `packages/core/test/core.spec.ts`
- `packages/kernel/test/llm-message-model.spec.ts`
- `packages/kernel/test/loop-engine.spec.ts`
- `packages/kernel/test/loop-orchestrator.spec.ts`
- `packages/kernel/test/prompt-builder.spec.ts`
- `packages/kernel/test/session-store.spec.ts`
- `packages/site-runtime/test/site-runtime.spec.ts`

Classification: coherent. Diff evidence replaces UID-only `page.click` / `page.fill` expectations with Browser Harness primitives, adds default chat tool surface expectations including `runtime.capture_diagnostics` and `debug.bundle`, and keeps `page.query` as explicit non-default debug readback.

### Dogfood runners

Files:

- `scripts/dogfood-existing-chrome-tab.js`
- `scripts/dogfood-real-browser-network.ts`

Classification: coherent. Current active intent and prior proposed intent both list these as dogfood/debug runner files. The workflow rules explicitly require existing-profile dogfood proof or a precise blocker; these scripts are the local evidence path.

### Browser Harness and cutover docs

Files include:

- `docs/ai-surface-index.md`
- `docs/browser-automation-cutover-boundary.md`
- `docs/browser-automation-dogfood-todo.md`
- `docs/browser-automation-first-principles.md`
- `docs/page-tabs-public-automation-path.md`
- `docs/cutover-readiness-criteria.md`
- `docs/level-2-cutover-acceptance-2026-05-27.md`
- `docs/level-2-uat-scenario-2026-05-27.md`
- `docs/migration-parity-dashboard.md`
- `docs/module-tracking-ledger.json`
- `docs/release-cutover-decision-packet-2026-05-27.md`
- review/source/start docs and `project_plan.md`

Classification: coherent, but broad. Diff evidence consistently moves the browser automation boundary to Browser Harness primitives, downgrades `page.query` to explicit debug readback, deletes UID-only `page.click` / `page.fill`, and removes MCP export as a current product promise. T4 should stage these only if the final closeout intends to include the documentation freshness repair with the product slice.

### Backlog rename pairs: `mcp` -> `external`

Tracked deletions:

- `docs/backlog/2026-03-29-bridge-side-mcp-export-is-still-descriptor-only.md`
- `docs/backlog/2026-04-15-mcp-export-handoff-projection-is-typed-but-not-routed.md`

Untracked replacements:

- `docs/backlog/2026-03-29-bridge-side-external-export-is-still-descriptor-only.md`
- `docs/backlog/2026-04-15-external-export-handoff-projection-is-typed-but-not-routed.md`

Classification: rename/content rewrite, not evidence loss. `git diff --summary` reports only deletes because the replacements are untracked. Readback of the new files shows the same issue IDs (`ISSUE-019`, `ISSUE-137`), `status: done`, work summaries, and related commits preserved, while `MCP` wording is replaced by `external export` and current product scope notes. T4 should stage each delete plus its replacement together.

### Workflow control plane

Files:

- `docs/workflows/2026-06-02-debug-bundle-closeout/**`

Classification: expected orchestration artifacts for this closeout workflow. These are outside product changes and should stay grouped as closeout control-plane evidence.

## Suspicious Or Unrelated Files

No confirmed unrelated dirty file found.

Caution: many docs/tests are not in `mainline show int_1d820b17 --json` latest `files_changed` list, but their content aligns with either Browser Harness primitive correction, MCP-to-external de-scoping, stopped-state UX, or closeout workflow control. Treat this as broad-but-related, not as automatically safe to bulk-stage without T4 review.

## Mainline Overlap Classification

Current preflight:

- `mainline preflight --json`: `level=block`, `ok_to_continue=false`, `allowed_boundary=inspect_or_stop`.
- Recommended next commands named by preflight: `mainline show int_feb220c2 --json`, `mainline show int_4ea34682 --json`, `mainline show int_a6221317 --json`; if overlap is real, run `mainline check` or ask for judgment.
- Overlaps listed: `int_feb220c2`, `int_4ea34682`, `int_a6221317`, with `int_feb220c2` duplicated in preflight output.

### `int_feb220c2` - proposed

Goal: `固化 Browser Harness 式浏览器操作第一性原则`

Show evidence: thread `codex/runtime-debug-dogfood`, branch `codex/runtime-debug-dogfood`, base commit `b92d825`; last turns describe Browser Harness primitives, real-browser dogfood runner, `page.info/click_xy/type_text/scroll`, chat context debug evidence stripping, no-progress as diagnostic, and nested page action fixes.

Overlap files with current dirty diff include runtime, kernel, tests, Browser Harness docs, and dogfood scripts.

Classification: real overlap, same-lane predecessor/adjacent work. It is not contradictory; current `int_1d820b17` appears to extend it from Browser Harness/debug evidence into explicit `debug.bundle` and `runtime_capture_diagnostics` closeout.

### `int_4ea34682` - proposed

Goal: `跑通推特书签搜索点赞场景并验证 UI 输出`

Show evidence: thread `codex/runtime-debug-dogfood`, branch `codex/runtime-debug-dogfood`, base commit `b92d825`; turn describes connecting chat loop page capability provider, X bookmarks dogfood, sidepanel fixture evidence, and final assistant response.

Overlap files: `apps/mv3-shell/src/background.ts`, `apps/mv3-shell/src/runtime-services.ts`, `apps/mv3-shell/test/runtime-chat.spec.ts`, `docs/ai-surface-index.md`, `packages/kernel/src/loop-orchestrator.ts`.

Classification: real overlap, earlier product-dogfood proof now superseded/narrowed by the closeout workflow. Not contradictory as code overlap; however the visible X-like action goal conflicts with the current workflow's external-action boundary. T4 should describe it as historical/diagnostic predecessor and keep the current closeout on read-only X dogfood unless the user explicitly authorizes visible actions.

### `int_a6221317` - proposed

Goal: `补齐对话调试与 dogfood 调用链观测`

Show evidence: thread `codex/runtime-debug-dogfood`, branch `codex/runtime-debug-dogfood`, base commit `b92d825`; turn records observability/dogfood call-chain work and later validation/commit `46f7880`.

Overlap files: same five-file surface as `int_4ea34682`.

Classification: real overlap, direct predecessor. Not contradictory; current debug bundle slice builds on its observability chain.

## Blockers

- Mainline lifecycle remains blocked at `inspect_or_stop` until overlap classification is recorded in the closeout append/seal path and preflight is re-run.
- No product-code blocker identified by this T2 audit.
- No human decision required for semantic conflict based on the current evidence.

## Next Step

T4 integrator should:

1. Read this handoff plus T1/T3.
2. Re-run `git status --short --branch`, `git diff --stat`, and `mainline preflight --json`.
3. Stage coherent groups deliberately, especially pairing the two `mcp` deletes with their `external` replacement files.
4. Record the overlap classification in Mainline before seal.
