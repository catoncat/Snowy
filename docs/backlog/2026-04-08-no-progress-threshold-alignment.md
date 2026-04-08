---
id: ISSUE-091
title: "Align no-progress detection threshold with old repo"
status: done
priority: p2
source: "gap analysis 2026-04-08"
created: 2026-04-08
assignee: codex-019d6dbd
tags:
  - kernel
  - loop
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/loop-engine.ts
  - packages/kernel/test/
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
completed_at: 2026-04-08T16:10:52.000Z
---

## Goal

对齐新旧仓的 no-progress 检测阈值：旧仓重复 2 次即终止，新仓当前要求 3 次。

## Context

旧仓 no-progress budget: `{ repeat_signature: 1, ping_pong: 0 }`（重复 1 次后 budget 耗尽 → 2 次即终止）。
新仓 `loop-engine.ts` 的 `repeatCount >= 3` 要求 3 次重复才触发 progress_uncertain。

这可能导致新仓在循环中多浪费 1 轮 LLM 调用。

## Acceptance

- repeat_signature 检测阈值可配置（通过 LoopEngineOptions）
- 默认值对齐旧仓行为（2 次重复即终止）
- 有测试覆盖阈值变化

## 工作总结

### 实现了什么

- 给 `LoopEngineOptions` 增加 `noProgressRepeatSignatureThreshold`，让 `repeat_signature` 阈值可配置。
- 默认阈值改为 2，并把判定从“历史中同值总数”收紧为“尾部连续重复数”，对齐旧仓 no-progress 行为。
- 补了默认阈值、自定义阈值和非连续重复不应误判的测试；同步更新 acceptance_ref 对应描述。

### 实际跑了什么检查

- `bun run test -- packages/kernel/test/loop-engine.spec.ts`
- `./node_modules/.bin/biome check packages/kernel/src/loop-engine.ts packages/kernel/test/loop-engine.spec.ts docs/kernel-skeleton-design.md`

### 残留风险

- `loop-engine.ts` 工作树里仍有其他并行改动未收口；本票只提交 no-progress threshold 相关 hunks。

## 相关 commits

- `a15fd98` `fix(kernel): align no-progress threshold with old repo (ISSUE-091)`
