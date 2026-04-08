---
id: ISSUE-092
title: "Shared tabs context injection into system prompt"
status: done
priority: p2
source: "gap analysis 2026-04-08"
created: 2026-04-08
assignee: codex-019d6dbd
tags:
  - kernel
  - prompt
  - tabs
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
completed_at: 2026-04-08T16:19:40.000Z
---

## Goal

将用户选中的 shared tabs 元数据注入 system prompt，让 LLM 知道当前上下文中有哪些 tab。

## Context

旧仓 `buildSharedTabsContextMessage` 在用户选择了某些 tab 后将其 metadata（title、url、tabId）注入 prompt。新仓目前没有此机制。

## Acceptance

- prompt-builder 可接收 shared tabs metadata
- 注入为独立 system message
- 有测试覆盖

## 工作总结

### 实现了什么
- 在 `packages/kernel/src/prompt-builder.ts` 新增 shared tabs metadata 输入、`buildSharedTabsContextMessage()` 与 `buildSystemPromptMessages()`，把 tab metadata 组装成独立 system message
- 在 `packages/kernel/test/prompt-builder.spec.ts` 补 shared tabs prompt context 测试，覆盖独立消息格式与消息拆分行为

### 实际跑了什么检查
- `bun run test -- packages/kernel/test/prompt-builder.spec.ts`
- `./node_modules/.bin/biome check packages/kernel/src/prompt-builder.ts packages/kernel/test/prompt-builder.spec.ts`

### 残留风险
- `loop-orchestrator` 目前仍直接消费 `buildSystemPromptBase()`；本票先完成 prompt-builder 能力与测试覆盖，后续接线需单独 issue 落地

## 相关 commits

- `fa8fbc0920dd` feat(kernel): add shared tabs prompt context
