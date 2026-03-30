---
id: ISSUE-044
title: "Review: core/src/index.ts 单文件膨胀预防"
status: done
priority: p2
source: "architecture quality review 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - core
  - maintainability
module_id: repo-workflow-dx
module_stage: deferred
tracking_kind: follow-up
kind: slice
epic: EPIC-contracts-core
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/core/src/
  - packages/core/test/core.spec.ts
acceptance_ref: docs/reviews/2026-03-29-architecture-quality-review.md
check_cmd: "bun run check"
---

## Goal

当 `packages/core/src/index.ts` 超过合理复杂度阈值时，拆分为子模块，保持模块边界清晰。

## Review Finding

`packages/core/src/index.ts` 当前 1236 行，内含 5 个逻辑 section：
1. BUILTIN_CATALOG（34 个 descriptor 声明，约 400 行）
2. Host Control Plane（snapshot/connect/disconnect/setDefault/resolveTarget，约 120 行）
3. Bootstrap Summary（约 100 行）
4. Skill Runtime Context（ctx factory + permission + trace，约 200 行）
5. SkillInvocationService + Typed Facade（约 250 行）

当前尚可接受，但随着 builtin catalog 扩充（预期 page/site/tabs 能力补全）和 control plane 扩展，文件会持续膨胀。

## Acceptance

- 触发条件：文件超过 ~1500 行，或新增 2+ namespace 的 catalog entry
- 拆分后保持 `packages/core/src/index.ts` 作为 re-export barrel
- 子模块候选：`catalog.ts`、`control-plane.ts`、`bootstrap.ts`、`context.ts`、`invocation-service.ts`
- 拆分不得改变 public API surface（所有 export 仍从 index.ts 导出）
- 拆分后所有现有测试继续通过

## Notes

- 这是预防性 issue，不阻塞当前开发
- 参见 `docs/reviews/2026-03-29-architecture-quality-review.md` § 4.1
- 2026-03-29 审查：当前 1236 行 < 1500 阈值，触发条件未满足，暂不执行拆分

## 工作总结

- 已按 acceptance trigger 复核 `packages/core/src/index.ts` 行数：1236
- 当前未达到拆分阈值（~1500）且无新增 2+ namespace entry，故不触发结构拆分
- 保持现状并记录触发条件，后续由新增能力面驱动该 issue 重开

## 相关 commits

- pending
