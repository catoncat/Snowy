---
id: ISSUE-094
title: "Expose loop introspection methods on Kernel facade"
status: done
priority: p1
source: "next-batch planning 2026-04-09"
created: 2026-04-09
assignee: vega
claimed_at: 2026-04-09T02:00:00Z
tags:
  - kernel
  - api-surface
  - loop
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/kernel-facade.ts
  - packages/kernel/test/kernel-facade.spec.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bunx vitest run packages/kernel/test/kernel-facade.spec.ts"
---

## Goal

Expose `checkTerminal`, `checkNoProgress`, `getMaxSteps`, and `resetSession` on the Kernel facade so that external orchestrators (like loop-orchestrator and mv3-shell) can manage loops through the public API instead of reaching into `kernel.loop` internals.

## Scope

1. Add `checkTerminal(sessionId, turn, opts?)` to Kernel facade — delegates to LoopEngine
2. Add `checkNoProgress(sessionId)` to Kernel facade — delegates to LoopEngine
3. Add `getMaxSteps()` to Kernel facade — delegates to LoopEngine
4. Add `resetLoopState(sessionId)` to Kernel facade — delegates to LoopEngine.resetSession
5. Update loop-orchestrator to use facade methods instead of `kernel.loop.*` direct access
6. Tests for each new facade method

## Acceptance

- All four methods accessible on `Kernel` type without accessing `.loop` subsystem
- `loop-orchestrator.ts` no longer casts or accesses `kernel.loop` directly
- Existing tests pass, new tests cover the facade methods

## 工作总结

### 实现了什么

1. 在 `Kernel` 接口上新增 4 个 loop introspection 方法：
   - `checkTerminal(sessionId, turn, opts?)` — 判断 loop 是否达到终止条件
   - `checkNoProgress(sessionId)` — 检测无进展状态
   - `getMaxSteps()` — 获取配置的最大步数
   - `resetLoopState(sessionId)` — 清理 session 的 loop 状态（step count、signature history、no-progress budget）
2. 更新 `loop-orchestrator.ts`，用 `kernel.checkTerminal()` 和 `kernel.getMaxSteps()` 替代直接访问 `kernel.loop` 内部
3. 删除了不再需要的 `DEFAULT_LOOP_MAX_STEPS` 常量
4. 新增 7 个测试覆盖所有新方法

### 检查结果

- `bunx vitest run packages/kernel/test/` — 181 tests passed (14 files)
- `bunx vitest run apps/mv3-shell/test/` — 72 tests passed (7 files)
- `biome check` on 3 changed files — clean

### 残留风险

- 无

## 相关 commits

- `014787c` feat(kernel): expose loop introspection on Kernel facade (ISSUE-094)
