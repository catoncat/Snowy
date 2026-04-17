---
id: ISSUE-158
title: "Review: intervention module status and cutover docs are stale after page-action handoff closure"
status: done
priority: p1
source: "next-batch-planner review 2026-04-17"
created: 2026-04-17
assignee: codex
tags:
  - review
  - intervention
  - docs
  - cutover
module_id: intervention-handoff
module_stage: mainline
tracking_kind: doc-debt
kind: slice
epic: EPIC-intervention
parallel_group: site-runtime
depends_on: []
write_scope:
  - docs/cutover-readiness-criteria.md
  - docs/migration-parity-dashboard.md
  - docs/legacy-to-vnext-migration-matrix.md
  - docs/module-tracking-ledger.json
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
completed_at: 2026-04-17T13:33:30.657Z
---

## Goal

在 ISSUE-136、ISSUE-141 与 ISSUE-152 已完成后，重新确认 intervention-handoff 模块是否仍应保持 partial，并把剩余范围同步回 cutover / parity / ledger 真相源。

## Review Finding

- docs/cutover-readiness-criteria.md 与 migration docs 仍把 page action failure intervention integration 或 product handoff UI 记为剩余 gap，但这些能力已经分别由 ISSUE-152 与 ISSUE-141 收口。
- 如果不重新落票，planner 会继续把 intervention-handoff 视为无 live coverage 的 partial 模块，导致 queue/planning 真相与当前仓库状态脱节。

## Acceptance

- 同步 cutover readiness parity dashboard migration matrix 与 module ledger 中 intervention-handoff 的真实剩余范围。
- 若 intervention-handoff 已达到当前阶段 shipped 标准，则明确更新状态；若仍未完成，则拆出更窄的 executable follow-up 而不是继续保留模糊 partial。

## 工作总结

### 实现了什么
- 同步 cutover/readiness 对 intervention 的 stale 结论
- 将 intervention-handoff 模块从 partial 收口为 shipped 并补齐 shipped_scope

### 实际跑了什么检查
- ./node_modules/.bin/biome check docs/module-tracking-ledger.json
- git diff --check
- bun run workflow:queue:build
- bun run check（失败：packages/core/test/core.spec.ts 649/656/660/662 的既有类型错误，与本次 doc truth-repair 无关）

### 残留风险
- Markdown 文档路径当前不在 biome 处理范围内，本次主要依赖真相源交叉复核与 git diff --check
- repo 级 bun run check 仍被 packages/core/test/core.spec.ts 的既有类型错误阻塞

## 相关 commits

- `58a086eadc0d` docs(intervention): 同步接管收口状态
