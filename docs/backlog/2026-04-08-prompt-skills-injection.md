---
id: ISSUE-088
title: "Inject available skills into system prompt"
status: open
priority: p1
source: "gap analysis 2026-04-08"
created: 2026-04-08
assignee: unassigned
tags:
  - kernel
  - prompt
  - skills
module_id: kernel
module_stage: mainline
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

将 available skills 注入 system prompt，让 LLM 知道哪些 skill 可用并能主动调用。

## Context

旧仓使用 `buildAvailableSkillsSystemMessage()` 将 enabled skills 以 XML `<available_skills schema="compact-v1">` 格式注入 system prompt，包含 relevance ranking、character budget (6000 chars)、truncation。

新仓 `prompt-builder.ts` 目前没有 skills 注入机制。

## Acceptance

- `buildSystemPromptBase` 或独立函数可接收 skill metadata 列表，输出格式化的 skills context
- 有 character budget 限制防止 prompt 膨胀
- 有测试覆盖 skills 注入和 truncation
