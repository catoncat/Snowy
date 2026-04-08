---
id: ISSUE-089
title: "Action failure tracking and strategy hints in prompt"
status: open
priority: p2
source: "gap analysis 2026-04-08"
created: 2026-04-08
assignee: unassigned
tags:
  - kernel
  - prompt
  - loop
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/prompt-builder.ts
  - packages/kernel/src/loop-orchestrator.ts
  - packages/kernel/test/
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---

## Goal

追踪重复失败的 action（按 UID / capability），在 system prompt 中注入 strategy hints 让 LLM 切换策略。

## Context

旧仓 `buildLlmMessagesFromContext` 在检测到某个 UID 失败 ≥2 次后注入 "STRATEGY HINT: switch tactics" 指引。新仓目前没有这个机制，LLM 会盲目重试失败的操作。

## Acceptance

- loop-orchestrator 追踪每个 capability+target 的失败次数
- 重复失败 ≥2 次时在 prompt 中注入 strategy hint
- 有测试覆盖
