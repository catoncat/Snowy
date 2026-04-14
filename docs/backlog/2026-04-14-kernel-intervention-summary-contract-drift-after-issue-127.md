---
id: ISSUE-128
title: "Review: kernel intervention summary contract drift after ISSUE-127"
status: done
priority: p1
source: "auto next after ISSUE-127"
created: 2026-04-14
assignee: codex-019d8ba0
tags:
  - review
  - kernel
  - intervention
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/intervention-controller.ts
  - packages/kernel/test/kernel-facade.spec.ts
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
completed_at: 2026-04-14T11:37:59.866Z
---

## Goal

把 kernel intervention summary contract drift after ISSUE-127 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- InterventionSummary requires recent list but kernel/controller/tests still emit old shape
- queue is empty and kernel mainline currently has no live issue coverage

## Acceptance

- InterventionSummary producer and consumer shapes are aligned across kernel/contracts/tests
- Targeted kernel/contracts tests pass for the updated contract

## 工作总结

### 实现了什么
- 在 InterventionController summary 输出中补齐 recent 列表字段
- 对齐 kernel/contracts 相关测试对 InterventionSummary.recent 的断言
- 修正 kernel facade 测试中的 intervention request 结构，显式传入 status=requested

### 实际跑了什么检查
- bun x vitest run packages/contracts/test/contracts.spec.ts packages/kernel/test/kernel-facade.spec.ts
- ./node_modules/.bin/biome check packages/kernel/src/intervention-controller.ts packages/kernel/test/kernel-facade.spec.ts packages/contracts/test/contracts.spec.ts
- bun run check（未通过，见下方风险）

### 残留风险
- repo 级 bun run check 仍被 write_scope 外类型错误阻塞（mv3/core/site-runtime 等）

## 相关 commits

- `bb0ddfc40bd4` fix(kernel): 对齐intervention摘要recent契约
