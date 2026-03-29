---
id: ISSUE-011
title: "Review: ctx permission and trace contract drift"
status: open
priority: p0
source: "codex review 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - contracts
  - core
  - permissions
  - trace
kind: slice
epic: EPIC-contracts-core
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
acceptance_ref: project_plan.md
check_cmd: "bun run check"
---

## Goal

把 D8 的 `ctx / permissions / reentrancy / trace` 合同补齐，消除当前实现和设计口径的偏差。

## Review Finding

- `ctx.skills.invoke()` 当前直连 `SkillInvocationService`，未经过 `skills.invoke` capability 权限口
  径，也没有 trace entry
- `traceId` 还没进入 contracts / core 主链
- 授权判断没有真正收口到 descriptor-first 心智

## Acceptance

- `ctx.skills.invoke()` 需要受 `skills.invoke` 权限控制，且行为被测试锁住
- skill-to-skill invoke 进入统一 trace 语义，至少能区分 capability call 和 nested skill invoke
- `traceId` 进入 runtime ctx 和 nested invoke 传播链路
- contracts/core 测试覆盖“低权限 skill 不能直接借道调用高权限 skill”
