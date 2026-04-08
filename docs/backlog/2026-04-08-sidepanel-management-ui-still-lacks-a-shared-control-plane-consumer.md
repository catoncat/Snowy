---
id: ISSUE-093
title: "Review: sidepanel management UI still lacks a shared control-plane consumer"
status: done
priority: p1
source: "ISSUE-075 follow-up planning 2026-04-08"
created: 2026-04-08
assignee: codex
tags:
  - review
  - sidepanel
  - ui
  - studio
  - skills
  - control-plane
module_id: skill-runtime-sdk-studio
module_stage: deferred
tracking_kind: follow-up
kind: slice
epic: EPIC-skill-runtime-sdk
parallel_group: sdk-docs
depends_on:
  - ISSUE-072
  - ISSUE-085
write_scope:
  - apps/mv3-shell/src/sidepanel.html
  - apps/mv3-shell/src/sidepanel/
  - apps/mv3-shell/src/runtime-services.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
completed_at: 2026-04-08T16:38:43.212Z
---

## Goal

把 sidepanel management UI still lacks a shared control-plane consumer 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- ISSUE-085 只交付了 sidepanel chat shell，未覆盖 settings/runtime/skill/host management consumer
- shared AI-surface read/action path 已在 ISSUE-072 与 MV3 bridge 落地，但 sidepanel 仍未消费它们

## Acceptance

- sidepanel management UI 只通过 resource.read 消费 runtime.summary/config.summary/skills.summary/hosts.summary，不新增 app-local bootstrap truth
- sidepanel management UI 只通过 runtime.capture_diagnostics/runtime.clear_error/config.update/skills.install|enable|disable|uninstall/hosts.connect|disconnect|set_default 触发管理动作，不走私有状态改写
- 实现需要锁住 UI entry、shared read/write path 和测试入口，并与现有 runtime.chat shell 明确边界

## 工作总结

### 实现了什么
- 新增 sidepanel Control Plane / Chat Shell 双 pane，management UI 只读 shared resource.read summaries。
- 新增 sidepanel management contract + helper，并通过 runtime-services 导出 guard helpers 锁定允许的 resource/action 集。
- 补 sidepanel/manifest 聚焦测试，覆盖 shared control-plane bootstrap、guard helper 与 chat shell 边界。

### 实际跑了什么检查
- PASS bun run test -- apps/mv3-shell/test/sidepanel-management.spec.ts apps/mv3-shell/test/sidepanel-app.spec.ts apps/mv3-shell/test/sidepanel-state.spec.ts
- PASS bun run test -- apps/mv3-shell/test/manifest.spec.ts --testNamePattern=sidepanel|resource.read|shared AI-surface|runtime.clear_error|runtime.capture_diagnostics|guard helpers
- PASS cd apps/mv3-shell && bun run build
- FAIL bun run check (blocked by unrelated biome format error in packages/kernel/test/llm-kernel-adapter.spec.ts)

### 残留风险
- 仓库级 bun run check 仍被 packages/kernel/test/llm-kernel-adapter.spec.ts 的并行格式问题阻塞。

## 相关 commits

- `afd395c96cfa` feat(sidepanel): add shared control-plane management consumer (ISSUE-093)
