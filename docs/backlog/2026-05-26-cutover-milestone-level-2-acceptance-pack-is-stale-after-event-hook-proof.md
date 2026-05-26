---
id: ISSUE-182
title: "Cutover milestone: Level 2 acceptance pack is stale after event-hook proof"
status: done
priority: p0
source: "anti-fragmentation planning 2026-05-27"
created: 2026-05-26
assignee: codex-loop
tags:
  - review
  - cutover
  - milestone
  - acceptance
module_id: old-product-replacement-loop
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-cutover-readiness
parallel_group: mv3-shell
depends_on: []
write_scope:
  - docs/cutover-readiness-criteria.md
  - docs/migration-parity-dashboard.md
  - docs/legacy-to-vnext-migration-matrix.md
  - docs/module-tracking-ledger.json
  - docs/source-of-truth-map.md
  - docs/agent-bootstrap-context-pack.md
  - docs/level-2-cutover-acceptance-2026-05-27.md
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
completed_at: 2026-05-26T20:09:42.443Z
---

## Goal

Produce a current Level 2 cutover acceptance pack after ISSUE-181. The work should decide from evidence whether the browser plugin rewrite has reached cutover-ready proof state, list any remaining blockers as external release decisions or explicit deferred breadth, and stop the workflow from reopening tiny implementation gaps that no longer move the old-product replacement goal.

## Review Finding

- After ISSUE-181 the representative old plugin hook path is proven, but cutover readiness still reads as a mix of shipped proof, yellow deferred breadth, and external release acceptance. Without one current acceptance pack, the workflow can keep fragmenting into version-selection, diff-preview, or audit/document rows instead of closing the browser plugin refactor decision loop.
- `docs/module-tracking-ledger.json` still summarizes `old-product-replacement-loop` through ISSUE-180 even though migration and cutover docs include ISSUE-181, so planning truth is slightly stale.

## Acceptance

- A Level 2 acceptance document maps gates A through G to current code, tests, docs, and commits including ISSUE-181 evidence.
- `docs/cutover-readiness-criteria.md`, `docs/migration-parity-dashboard.md`, `docs/legacy-to-vnext-migration-matrix.md`, `docs/module-tracking-ledger.json`, and `docs/agent-bootstrap-context-pack.md` agree on what is shipped, what is deferred breadth, and what remains an external release acceptance decision.
- The planning output recommends at most one next decision boundary after the acceptance pack instead of generating small implementation issues for already-deferred breadth.

## 工作总结

### 实现了什么
- 新增 Level 2 cutover acceptance pack，将 gates A-G 映射到 ISSUE-172 到 ISSUE-181 的当前代码、测试、文档与 commits；同步 cutover readiness、migration parity、legacy matrix、module ledger、source-of-truth map 与 bootstrap context，把后续边界收敛为外部 release acceptance、一个明确 UAT 场景或显式 deferred breadth 提升。

### 实际跑了什么检查
- jq empty docs/module-tracking-ledger.json && jq empty docs/workflow/live-queue.json; git diff --check; ./node_modules/.bin/biome check <touched docs/json>; bun run check

### 残留风险
- 无

## 相关 commits

- `3486a542c421` docs(cutover): 固化 Level 2 验收包
