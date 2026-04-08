---
id: ISSUE-093
title: "Review: sidepanel management UI still lacks a shared control-plane consumer"
status: open
priority: p1
source: "ISSUE-075 follow-up planning 2026-04-08"
created: 2026-04-08
assignee: unassigned
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
