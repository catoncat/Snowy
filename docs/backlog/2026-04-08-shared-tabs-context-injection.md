---
id: ISSUE-092
title: "Shared tabs context injection into system prompt"
status: open
priority: p2
source: "gap analysis 2026-04-08"
created: 2026-04-08
assignee: unassigned
tags:
  - kernel
  - prompt
  - tabs
module_id: kernel
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/prompt-builder.ts
  - packages/kernel/test/
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---

## Goal

将用户选中的 shared tabs 元数据注入 system prompt，让 LLM 知道当前上下文中有哪些 tab。

## Context

旧仓 `buildSharedTabsContextMessage` 在用户选择了某些 tab 后将其 metadata（title、url、tabId）注入 prompt。新仓目前没有此机制。

## Acceptance

- prompt-builder 可接收 shared tabs metadata
- 注入为独立 system message
- 有测试覆盖
