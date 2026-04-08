---
id: ISSUE-089
title: "Action failure tracking and strategy hints in prompt"
status: done
priority: p2
source: "gap analysis 2026-04-08"
created: 2026-04-08
assignee: codex-019d6d6c
completed_at: 2026-04-08T16:05:00.000Z
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

## 工作总结

### 实现了什么
- 在 `packages/kernel/src/loop-orchestrator.ts` 里按 capability+target 统计失败次数；同一 target 连续失败达到 2 次后继续 loop，并把 strategy hint 注入下一轮 progress system message。
- 在 `packages/kernel/src/prompt-builder.ts` 增加 repeated action failure hint 格式化与 prompt section。
- 在 `packages/kernel/test/prompt-builder.spec.ts`、`packages/kernel/test/loop-orchestrator.spec.ts` 增加回归测试，覆盖重复失败提示与不同 target 不串算。

### 实际跑了什么检查
- `bun run test -- packages/kernel/test/prompt-builder.spec.ts packages/kernel/test/loop-orchestrator.spec.ts`
- `./node_modules/.bin/biome check packages/kernel/src/prompt-builder.ts packages/kernel/src/loop-orchestrator.ts packages/kernel/test/prompt-builder.spec.ts`

### 残留风险
- 实现已落在共享提交 `5b7dcf105116` 中；本次收尾只补 workflow/document closure，未重跑全仓 `bun run check`。

## 相关 commits

- `5b7dcf105116` chore(sidepanel): lock management control-plane boundary (ISSUE-075)
