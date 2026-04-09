---
id: ISSUE-120
title: "Follow-up: define kernel child-run contract for subagent orchestration"
status: done
priority: p1
source: "ISSUE-113 review 2026-04-09"
created: 2026-04-09
assignee: codex-019d70f6
tags:
  - review
  - follow-up
  - kernel
  - subagent
  - run-state
  - trace
module_id: kernel
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on:
  - ISSUE-113
write_scope:
  - packages/contracts/src/index.ts
  - packages/kernel/src/kernel-facade.ts
  - packages/kernel/src/run-controller.ts
  - packages/kernel/test
  - docs/kernel-skeleton-design.md
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
completed_at: 2026-04-09T11:57:28.206Z
---

## Goal

Define the minimal child-run contract that kernel needs for subagent orchestration, while keeping broader external agent transport and dispatch execution explicitly out of scope.

## Review Finding

- Current kernel only models session-local run state plus `steer` / `followUp` queues; it has no child-run record, parent-run ownership, or subagent-specific diagnostics seam.
- The old repo treated subagent run as a first-class runtime surface with `runSessionId`, lifecycle events, and completion summary, so this gap should stay visible in kernel mainline instead of silently deferring into app glue.
- The next slice should narrow the problem to contract and ownership semantics, not full external agent transport or dispatch-plan execution.

## Acceptance

- Define the minimal child-run / subagent canonical model, including parent ownership and lifecycle status, in contracts/kernel-facing APIs.
- Expose an explicit kernel seam for child-run state or inspection instead of overloading `steer` / `followUp` queue semantics.
- Tests and kernel-skeleton docs lock what lands in this slice and what remains deferred beyond the minimal contract.

## 工作总结

### 实现了什么
- 在 contracts 定义 child-run record/summary/status transition，并保持 run queue 语义不变。
- 在 RunController 与 Kernel facade 增加 register/update/list/summary seam，并把 childRuns 纳入 runtime summary。
- 补齐 run-controller/kernel-facade 测试，并在 kernel skeleton 标注 child-run 仍是当前 partial follow-up。

### 实际跑了什么检查
- bunx vitest run packages/contracts/test/contracts.spec.ts packages/kernel/test/run-controller.spec.ts packages/kernel/test/kernel-facade.spec.ts
- ./node_modules/.bin/biome check packages/contracts/src/index.ts packages/kernel/src/run-controller.ts packages/kernel/src/kernel-facade.ts packages/kernel/test/run-controller.spec.ts packages/kernel/test/kernel-facade.spec.ts docs/kernel-skeleton-design.md

### 残留风险
- 无

## 相关 commits

- `301a33063010` feat(kernel): 增加child-run状态管理
