---
id: ISSUE-131
title: "Follow-up: wire prompt context options through the kernel loop"
status: done
priority: p1
source: "next-batch-planner review 2026-04-15"
created: 2026-04-15
assignee: codex-019d90cc
tags:
  - review
  - kernel
  - prompt
  - loop
  - follow-up
module_id: kernel
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/prompt-builder.ts
  - packages/kernel/src/loop-orchestrator.ts
  - packages/kernel/test
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
completed_at: 2026-04-15T11:18:06.045Z
---

## Goal

把 shared tabs / available skills 等 prompt context 从 builder-level capability 收口到实际 runLoop payload，避免 prompt option 继续停留在声明层。

## Review Finding

- prompt-builder 已提供 buildSystemPromptMessages() 以及 sharedTabs / availableSkills 选项，但 runLoop 目前仍只 prepend 单条 buildSystemPromptBase() system message。
- 仓库内没有任何生产调用方会把 shared tabs 上下文或多条 system prompt 真正送进 LLM payload；当前这层能力仍基本停留在测试/声明层。
- 这让 kernel 在 session/run/compaction/child-run 基线已经落地后，仍保留一块实际未接线的 prompt-context gap。

## Acceptance

- runLoop 在提供 promptOptions 时保留完整的 system prompt message set，而不是把 shared tabs / available skills 压扁成单条基础 prompt。
- kernel 测试覆盖 sharedTabs / availableSkills 与 task progress prompt 共存时的实际 LLM payload 形态。
- 文档明确本票收口后的剩余 prompt policy 边界，避免 kernel 状态继续被过时文档描述。

## 工作总结

### 实现了什么
- 让 runLoop 保留完整的 prompt context system messages
- 补充 llm payload 顺序测试并同步 kernel 迁移文档

### 实际跑了什么检查
- bun run test -- packages/kernel/test/prompt-builder.spec.ts packages/kernel/test/loop-orchestrator.spec.ts
- ./node_modules/.bin/biome check packages/kernel/src/loop-orchestrator.ts packages/kernel/test/loop-orchestrator.spec.ts docs/module-tracking-ledger.json docs/kernel-skeleton-design.md docs/migration-parity-dashboard.md docs/legacy-to-vnext-migration-matrix.md

### 残留风险
- 无

## 相关 commits

- `639dbc7ba80b` fix(kernel): 接通 prompt 上下文消息
