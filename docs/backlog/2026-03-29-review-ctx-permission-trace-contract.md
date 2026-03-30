---
id: ISSUE-011
title: "Review: ctx permission and trace contract drift"
status: done
priority: p0
source: "codex review 2026-03-29"
created: 2026-03-29
assignee: agent
tags:
  - review
  - contracts
  - core
  - permissions
  - trace
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
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

把 D8 的 `ctx / permissions / reentrancy / trace` 剩余合同补齐，消除当前实现和设计口径的最后偏差。

## Review Finding

- `680314d` 已把 `ctx.skills.invoke()` 收口回 `skills.invoke` capability 与 trace 主链；这一项已关闭
- `traceId` 仍未进入 contracts / core runtime ctx，nested skill invoke 之间也没有显式关联字段
- 当前只锁住“父 skill 是否拥有 `skills.invoke`”，没有定义“父 skill 能否借道调用高权限子 skill”的合同，权限升级语义仍悬空

## Acceptance

- `traceId` 进入 runtime ctx、capability trace entry 和 nested invoke 传播链路
- skill-to-skill invoke 有显式 trace 关联语义，能把父 `skills.invoke` 与子 skill invocation 串起来
- contracts/core 测试锁住高权限子 skill 调用策略，不再保持未定义状态

## 工作总结

- 在 `packages/contracts/src/index.ts` 为 `CapabilityTraceEntry` 补上 `parentTraceId` / `childTraceId`，把 nested skill invocation 的父子 trace 关联提升为显式 contract。
- 在 `packages/core/src/index.ts` 为 runtime ctx 补上 `traceId` / `parentTraceId`，并让 `SkillInvocationService` 在 nested invoke 时生成子 trace、回填父 `skills.invoke` trace entry 的 `childTraceId`，同时保持父子 trace 数组隔离。
- 将 nested skill 的有效权限收口为“callee 声明权限 ∩ caller 已获 grant”，不再允许父 skill 借道高权限子 skill 完成越权 capability 调用。
- 在 `packages/contracts/test/contracts.spec.ts` 和 `packages/core/test/core.spec.ts` 新增覆盖，锁住 trace 链接字段、子调用权限裁剪、显式 trace 关联以及“低权限父 skill 不能借高权限子 skill”这几条 review contract。
- 实际验证执行了 `bun run check`，结果通过，当前无 write scope 内残留 blocker。

## 相关 commits

- `165ba94` `Lock nested skill trace and permission contracts`
