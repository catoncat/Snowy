---
id: ISSUE-112
title: Loop 内 policy-driven intervention 调度
status: open
priority: p1
source: next-batch-planner coverage review 2026-04-09
created: 2026-04-09
assignee: unassigned
tags: [intervention, loop, policy]
kind: slice
epic: EPIC-kernel
parallel_group: kernel
module_id: intervention-handoff
module_stage: mainline
tracking_kind: gap
depends_on: []
write_scope:
  - packages/kernel/src/loop-orchestrator.ts
  - packages/kernel/test/loop-orchestrator.spec.ts
  - packages/kernel/test/kernel-facade.spec.ts
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bunx vitest run packages/kernel/test/loop-orchestrator.spec.ts packages/kernel/test/kernel-facade.spec.ts"
---

## Goal

把 intervention 从“可手动调用的 controller 能力”推进到 loop 内的 policy-driven 调度：在 capability risk、verify failure 或 runtime blocked 条件下，由 orchestrator 决定何时发起 intervention 并如何暂停/恢复运行。

## Review Finding

当前 `InterventionController` 与 kernel facade 已经具备 request / resolve / cancel / persist 能力，但 `runLoop()` 还没有把这些能力接到 step orchestration。仓库当前的真实 gap 不是“缺 intervention lifecycle”，而是 loop 层没有 policy seam 去判断何时 request intervention、何时暂停 run、何时在 resolve 后恢复；如果这一层不收口，intervention 仍然只是 API 能力而不是 runtime control flow。

## Acceptance

- [ ] loop orchestration 具备明确的 intervention policy seam，而不是在 capability/provider 代码里零散触发
- [ ] 至少支持 high-risk / side-effectful step 与 verify-failed 两类自动 intervention 入口
- [ ] intervention pending 时 loop / run state 能进入暂停态，并在 resolve 后恢复到可继续执行的状态
- [ ] 测试覆盖：policy 命中触发 intervention、pending 时暂停、resolve 后恢复执行
