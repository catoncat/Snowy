---
id: ISSUE-161
title: "Review: browser automation cutover docs are stale after page-action handoff closure"
status: done
priority: p1
source: "next-batch-planner review 2026-04-17"
created: 2026-04-17
assignee: codex-019d9bb0
tags:
  - review
  - site-runtime
  - automation
  - docs
  - cutover
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: doc-debt
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on:
  - ISSUE-158
write_scope:
  - docs/cutover-readiness-criteria.md
  - docs/migration-parity-dashboard.md
  - docs/browser-automation-cutover-boundary.md
  - docs/module-tracking-ledger.json
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
completed_at: 2026-04-17T13:50:37.209Z
---

## Goal

在 ISSUE-154 与 ISSUE-152 已收口 page action 生产路径和 handoff integration 后，重新确认 site-runtime-browser-automation 模块的 Tier 1 cutover 剩余范围，并同步文档真相。

## Review Finding

- cutover readiness、parity dashboard 与 migration docs 仍把 page action failure intervention integration 记为 browser automation 的剩余 Tier 1 gap，但 ISSUE-152 已完成该链路。
- 如果不补一次 truth-repair，site-runtime-browser-automation 会继续被 planner 视为 partial 且无 live coverage，但文档给出的 remaining gap 已经落后于仓库事实。

## Acceptance

- 同步 browser automation cutover docs 与 module ledger，明确 Tier 1 已关闭的范围和真正剩余的 cutover / deferred scope。
- 若模块仍应保持 partial，则把剩余 gap 改写成更窄的 executable or deferred statement，而不是继续引用过时的 page-action handoff 缺口。

## 工作总结

### 实现了什么
- 同步 browser automation cutover 文档，明确 Tier 1 已收口且剩余范围转为 Tier 2/Tier 3 deferred breadth
- 将 site-runtime-browser-automation 从 partial 调整为 shipped，并补齐 shipped_scope/deferred_scope

### 实际跑了什么检查
- ./node_modules/.bin/biome check docs/module-tracking-ledger.json
- python3 -m json.tool docs/module-tracking-ledger.json >/dev/null && git diff --check
- bun run check（失败：packages/core/test/core.spec.ts 695/702/706/708 的既有类型错误，属于 write scope 外 blocker）

### 残留风险
- 无

## 相关 commits

- `b53d18ecf6f2` docs(site-runtime): 同步自动化 cutover 真相
