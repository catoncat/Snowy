---
id: ISSUE-030
title: "Review: product self-awareness bootstrap surface is still missing"
status: open
priority: p1
source: "AI-native surface follow-up 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - mv3-shell
  - core
  - runtime
  - ai-surface
kind: slice
epic: EPIC-mv3-shell
parallel_group: mv3-shell
depends_on:
  - ISSUE-025
  - ISSUE-026
write_scope:
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/src/offscreen.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

给 Agent 一个最小但高信号的产品自我认知入口，而不是让它只能靠工具列表和 UI 文案猜当前状态。

## Review Finding

- 新设计已经把 `runtime/config/skills/hosts` 摘要列为最小 bootstrap surface。
- 但当前新仓还没有单一入口，把这些高信号状态按可读取 bundle 暴露给聊天 Agent / Skill / UI。
- 没有这层，产品虽然有 action substrate，但还不算真正 AI-native control plane。

## Acceptance

- 存在一个最小 bootstrap read path，至少可读：
  - runtime summary
  - skills summary
  - hosts summary
  - config summary 或明确的 config placeholder contract
- 该入口不要求把所有状态都做成新 tool，而是优先走摘要读取。
- 测试覆盖 healthy / degraded / empty-state 的最小返回口径。

