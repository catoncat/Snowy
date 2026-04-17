---
id: ISSUE-167
title: "Review: module ledger statuses are stale after batch-13 closeout"
status: done
priority: p1
source: "next-batch-planner planning commit 2026-04-17"
created: 2026-04-17
assignee: raven
tags:
  - review
  - planning
  - truth-repair
  - module-ledger
module_id: repo-workflow-dx
module_stage: deferred
tracking_kind: doc-debt
kind: slice
epic: EPIC-workflow
parallel_group: sdk-docs
depends_on: []
write_scope:
  - docs/module-tracking-ledger.json
  - docs/migration-parity-dashboard.md
  - docs/legacy-to-vnext-migration-matrix.md
  - docs/cutover-readiness-criteria.md
acceptance_ref: docs/source-of-truth-map.md
check_cmd: "bun run check"
completed_at: 2026-04-17T15:51:30.230Z
---

## Goal

把 batch 13 收口后遗留的 module ledger / parity 文档漂移收口成一张 truth-repair slice，避免 planner 因 stale partial 状态继续误报 mainline/secondary coverage gap。

## Review Finding

- ISSUE-161/163/164/165/166 与 sidepanel shared control-plane consumer 已经关闭多条 non-deferred 主链缺口，但 docs/module-tracking-ledger.json 仍把 observability-audit、execution-host-bridge、provider-profile-routing、ai-surface-control-plane 记成 partial。
- 如果不先修复 planning truth，queue 会持续因为 stale partial 模块缺 live issue 而被误判成 coverage gap，迫使后续 planner 重复造票。

## Acceptance

- module ledger 与 parity/cutover 文档明确区分已 landed 的 cutover-critical scope 和继续 deferred 的 breadth，而不是继续沿用 stale partial 结论。
- planning truth 不再把已收口模块误报为缺 live backlog coverage；若某模块仍需保持 partial，则剩余 gap 必须被改写成当前可执行或明确 deferred 的 statement。
- 重建 live queue 后，dispatch 结论与更新后的 planning truth 一致。

## 工作总结

### 实现了什么
- 将 observability-audit/provider-profile-routing/ai-surface-control-plane/execution-host-bridge 从 stale partial 改为 shipped + deferred scope
- 同步 parity dashboard、migration matrix 与 cutover criteria，明确 cutover-critical landed 与 deferred breadth 的边界

### 实际跑了什么检查
- python3 -m json.tool docs/module-tracking-ledger.json >/dev/null
- ./node_modules/.bin/biome check docs/module-tracking-ledger.json docs/migration-parity-dashboard.md docs/legacy-to-vnext-migration-matrix.md docs/cutover-readiness-criteria.md
- git diff --check
- bun run workflow:plan:preview
- bun run check

### 残留风险
- 无

## 相关 commits

- `b6a157c0c0d0` docs(planning): 对齐模块状态真相
