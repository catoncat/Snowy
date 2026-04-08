---
id: ISSUE-091
title: "Align no-progress detection threshold with old repo"
status: open
priority: p2
source: "gap analysis 2026-04-08"
created: 2026-04-08
assignee: unassigned
tags:
  - kernel
  - loop
module_id: kernel
module_stage: secondary
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
