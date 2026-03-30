---
id: ISSUE-028
title: "Review: skill lifecycle/version surface is still model-only"
status: done
priority: p1
source: "next-batch review 2026-03-29"
created: 2026-03-29
assignee: copilot-gpt54
tags:
  - review
  - skill-sdk
  - lifecycle
  - versioning
module_id: skill-runtime-sdk-studio
module_stage: deferred
tracking_kind: gap
kind: slice
epic: EPIC-skill-lifecycle
parallel_group: sdk-docs
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/browser-vfs/src/index.ts
  - packages/skill-sdk/src/index.ts
  - docs/
acceptance_ref: project_plan.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T11:05:45.938Z
---

## Goal

把 lifecycle state machine 与 version primitives 收口成下一阶段可实现的统一 lifecycle/version surface。

## Review Finding

- contracts 已有 lifecycle state machine，BrowserVFS 已有 snapshot/rollback primitives，但两者还没有统一的 orchestration surface。
- 当前仓没有把 draft/staged/installed/enabled 与版本快照/rollback 串成一个 engine-level contract。
- docs/v0-slice.md 仍把 full Skill Studio UI 和 lifecycle/versioning surface 标为 deferred。

## Acceptance

- 非 UI 的 lifecycle/version engine 边界在代码或文档里被明确。
- 至少一条测试或契约覆盖 lifecycle transition 与 version snapshot/rollback 的衔接。
- 文档明确哪些工作属于 engine，哪些仍属于后续 Skill Studio 产品面。

## 工作总结

- 在 `packages/contracts/src/index.ts` 新增 lifecycle/version engine contract：补齐 lifecycle actor 边界、canonical skill version URI、version policy、rollback trigger 与 `SkillLifecycleVersionSurface`，把状态机和版本策略第一次收口到统一契约层。
- 在 `packages/browser-vfs/src/index.ts` 对齐默认版本保留数量，并新增 `snapshotInfoToSkillVersionRef()`，把 BrowserVFS snapshot primitive 提升成 engine contract 可直接消费的版本引用。
- 在 `packages/contracts/test/contracts.spec.ts` 和 `packages/browser-vfs/test/browser-vfs.spec.ts` 新增覆盖，锁住 actor 权限、latest trusted rollback 选择，以及 snapshot/rollback primitive 与 lifecycle/version surface 的衔接。
- 新增 `docs/skill-lifecycle-version-engine-boundary.md`，明确 engine 负责 lifecycle + version policy + snapshot contract，Skill Studio UI 仍属于后续产品面，不在本次实现范围内。
- 实际验证执行了 `bun run check`，结果通过：`tsc --noEmit` 通过，Vitest `10/10` 文件、`114/114` 测试通过；当前无已知 blocker。

## 相关 commits

- `6ff3631` `feat(skill-lifecycle): define version engine surface`
