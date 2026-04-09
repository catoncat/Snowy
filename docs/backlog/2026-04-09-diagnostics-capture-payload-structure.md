---
id: ISSUE-104
title: "Diagnostics payload contract 化与 kernel-owned snapshot 收敛"
status: done
priority: p0
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: codex-019d70f6
tags:
  - observability
  - diagnostics
  - kernel
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/kernel/src/kernel-facade.ts
  - packages/kernel/test/kernel-facade.spec.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bunx vitest run packages/contracts/test/contracts.spec.ts packages/kernel/test/kernel-facade.spec.ts apps/mv3-shell/test/manifest.spec.ts"
completed_at: 2026-04-09T11:10:48.965Z
---

## Goal

把 `runtime.capture_diagnostics` 从 background bridge 内的临时 payload 收敛成有 contracts 类型、由 kernel 产出核心快照、由 MV3 edge 只补 bridge/site 状态的正式 observability surface。

## Review Finding

`runtime.capture_diagnostics` 目前已经能通过 `apps/mv3-shell/src/background.ts` 返回诊断结果，sidepanel 也能展示该 payload；当前真正的缺口不是“完全没有实现”，而是 diagnostics shape 没有成为 canonical contract，kernel 也没有拥有 session/run/loop/intervention/provider 这部分核心快照的组装职责。继续让 background route 手写 payload，会让 public diagnostics surface 与 kernel runtime truth 持续漂移。

## Acceptance

- [x] `packages/contracts` 定义正式的 diagnostics payload 类型，至少覆盖 session / run / loop / intervention / provider 相关字段
- [x] kernel facade 暴露 `captureDiagnostics()` 或等价 API，负责组装 kernel-owned 的核心 runtime snapshot
- [x] `runtime.capture_diagnostics` 的 public route 改为消费 kernel snapshot，并仅在 MV3 edge 补充 bridge / page-hook / site 状态
- [x] 测试覆盖：contracts 类型合法、kernel snapshot 内容正确、background route 不再手写平行 diagnostics truth

## 工作总结

### 实现了什么
- 定义 runtime diagnostics canonical contract 与 payload 类型
- 在 kernel facade 增加 captureDiagnostics 组装 session/run/loop/intervention/provider snapshot
- 让 background diagnostics 消费 kernel snapshot，仅补 bridge/runner/site/error

### 实际跑了什么检查
- bunx vitest run packages/contracts/test/contracts.spec.ts packages/kernel/test/kernel-facade.spec.ts apps/mv3-shell/test/manifest.spec.ts
- ./node_modules/.bin/biome check apps/mv3-shell/src/background.ts apps/mv3-shell/test/manifest.spec.ts packages/contracts/src/index.ts packages/contracts/test/contracts.spec.ts packages/kernel/src/kernel-facade.ts packages/kernel/test/kernel-facade.spec.ts

### 残留风险
- 无

## 相关 commits

- `55d502b7dc52` feat(observability): 收敛 diagnostics canonical snapshot
