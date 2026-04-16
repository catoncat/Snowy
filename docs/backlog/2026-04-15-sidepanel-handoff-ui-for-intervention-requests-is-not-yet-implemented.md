---
id: ISSUE-141
title: "Sidepanel handoff UI for intervention requests is not yet implemented"
status: done
priority: p1
source: review
created: 2026-04-15
assignee: codex-019d9439
tags:
  - review
module_id: intervention-handoff
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-intervention
parallel_group: site-runtime
depends_on: []
write_scope:
  - apps/mv3-shell/src/sidepanel
  - packages/contracts/src/index.ts
  - apps/mv3-shell/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
completed_at: 2026-04-16T03:06:45.480Z
---

## Goal

把 Sidepanel handoff UI for intervention requests is not yet implemented 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding


## Acceptance

- Sidepanel surfaces pending intervention requests with approve and reject actions; intervention resolution from sidepanel flows through the shared control-plane path not a private helper

## 工作总结

### 实现了什么
- 在 sidepanel control plane 中展示 pending intervention 列表并提供 Approve/Reject 操作
- 将 intervention.resolve/intervention.cancel 纳入 shared sidepanel management allowlist 与 message builder
- 补充 pending queue、App 接线与 management allowlist 的聚焦测试

### 实际跑了什么检查
- bun run test -- apps/mv3-shell/test/sidepanel-management.spec.ts apps/mv3-shell/test/sidepanel-app.spec.ts
- bunx vitest run apps/mv3-shell/test/manifest.spec.ts --testNamePattern='locks sidepanel management to shared AI-surface resources and control-plane actions'
- cd apps/mv3-shell && bun run build
- bun run check（失败：被 write scope 外的 biome 既有问题阻塞）

### 残留风险
- repo 级 bun run check 被 packages/contracts/test/contracts.spec.ts、packages/core/src/index.ts、packages/core/test/core.spec.ts 的既有 biome 问题阻塞

## 相关 commits

- `51e4d0c2788e` feat(sidepanel): 增加 intervention handoff 操作面板
