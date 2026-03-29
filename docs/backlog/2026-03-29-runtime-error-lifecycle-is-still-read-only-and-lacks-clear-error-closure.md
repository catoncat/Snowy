---
id: ISSUE-037
title: "Review: runtime error lifecycle is still read-only and lacks clear-error closure"
status: open
priority: p1
source: "next-batch operability planning 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - mv3-shell
  - contracts-core
  - runtime
  - error
  - operability
kind: slice
epic: EPIC-mv3-shell
parallel_group: mv3-shell
depends_on:
  - ISSUE-036
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

为 runtime error 状态补上最小清理闭环，让 `lastError` 不只是展示字段，而是可被显式确认/清除的 operability surface。

## Review Finding

- 当前 `runtime.bootstrap` 已暴露 `lastError`，但没有对应的最小 public control plane action 去清理或确认已处理错误。
- `docs/ai-native-capability-surface-design.md` 已将 `runtime.clear_error` 列为建议产品动作。
- 如果错误状态只能读取、不能清理，runtime error 就会停留在“可见但不可治理”的半状态，Operability 闭环仍然不完整。

## Acceptance

- `packages/contracts` / `packages/core` 新增最小 `runtime.clear_error` action contract。
- MV3 shell 对 runtime error state 提供显式清理路径，而不是依赖隐式覆盖或下一次成功调用碰运气消失。
- `runtime.bootstrap` / diagnostics 在 clear 之后返回一致状态，不出现“双账本”。
- 测试覆盖：
  - 有错误时清理成功
  - 无错误时幂等返回
  - clear 不触发 host recovery 或额外副作用
- 文档明确：该 slice 只负责 runtime error closure，不顺手扩大成完整 incident history 系统。
