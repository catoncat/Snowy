---
id: ISSUE-108
title: JS Runner offscreen 集成与隔离加固
status: open
priority: p1
source: next-batch-planner review 2026-04-09
created: 2026-04-09
assignee: unassigned
tags: [js-runner, execution, runtime]
kind: slice
epic: EPIC-execution-host
parallel_group: js-runner
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: gap
depends_on: []
write_scope:
  - packages/js-runner/src/runner-host-core.ts
  - packages/js-runner/test/js-runner.spec.ts
  - apps/mv3-shell/src/offscreen.ts
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bunx vitest run packages/js-runner/test/js-runner.spec.ts apps/mv3-shell/test/manifest.spec.ts"
---

## Goal

在现有 `RunnerHostCore` 的基础上，补齐 offscreen host 的集成与隔离加固，使 MV3 offscreen bridge 成为 JS Runner 的稳定执行面，而不是只停留在“核心类存在、桥接跑通”的半收口状态。

## Review Finding

`RunnerHostCore` 已经存在，并且已经具备 `new Function()` 加载、health tracking、timeout / abort 与 inflight 管理；`apps/mv3-shell/src/offscreen.ts` 也已经启动真实 bridge。当前剩余缺口不是“从零实现执行引擎”，而是把现有 host core 与 offscreen bridge 的隔离语义、失败恢复与回归测试收口成稳定的 execution-host path。

## Acceptance

- [ ] offscreen bridge 明确走 `RunnerHostCore` 的真实执行路径，并有对应集成测试兜底
- [ ] 每次 invocation 的执行上下文与失败状态不会泄漏到下一次运行
- [ ] timeout / abort / health 语义通过 offscreen bridge 暴露后与 js-runner core 保持一致
- [ ] 测试覆盖：成功执行、timeout、abort、offscreen bridge 集成与隔离回归
