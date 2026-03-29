---
id: ISSUE-028
title: "Review: skill lifecycle/version surface is still model-only"
status: in-progress
priority: p1
source: "next-batch review 2026-03-29"
created: 2026-03-29
assignee: copilot-gpt54
tags:
  - review
  - skill-sdk
  - lifecycle
  - versioning
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
