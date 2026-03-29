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

把 D8 的 `ctx / permissions / reentrancy / trace` 剩余合同补齐，消除当前实现和设计口径的最后偏差。

## Review Finding

- `680314d` 已把 `ctx.skills.invoke()` 收口回 `skills.invoke` capability 与 trace 主链；这一项已关闭
- `traceId` 仍未进入 contracts / core runtime ctx，nested skill invoke 之间也没有显式关联字段
- 当前只锁住“父 skill 是否拥有 `skills.invoke`”，没有定义“父 skill 能否借道调用高权限子 skill”的合同，权限升级语义仍悬空

## Acceptance

- `traceId` 进入 runtime ctx、capability trace entry 和 nested invoke 传播链路
- skill-to-skill invoke 有显式 trace 关联语义，能把父 `skills.invoke` 与子 skill invocation 串起来
- contracts/core 测试锁住高权限子 skill 调用策略，不再保持未定义状态
