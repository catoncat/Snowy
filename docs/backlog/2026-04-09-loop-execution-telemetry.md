---
id: ISSUE-095
title: "Add loop execution telemetry to audit surface"
status: done
priority: p1
source: "next-batch planning 2026-04-09"
created: 2026-04-09
assignee: codex-019d7024
tags:
  - observability
  - audit
  - telemetry
  - loop
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-observability
parallel_group: kernel
depends_on:
  - ISSUE-094
write_scope:
  - packages/kernel/src/loop-orchestrator.ts
  - packages/contracts/src/index.ts
  - apps/mv3-shell/src/background.ts
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bunx vitest run packages/kernel/test/loop-orchestrator.spec.ts"
completed_at: 2026-04-09T03:06:14.385Z
---

## Goal

Add structured telemetry for loop execution so operators can diagnose slow steps, track token usage, and see capability invocation histories. Gate F requires minimal diagnostics for the core loop path.

## Scope

1. Add `LoopTelemetryEntry` type to contracts: `{ stepIndex, capabilityId, startedAt, endedAt, durationMs, ok, errorCode?, tokenEstimate? }`
2. Collect telemetry entries during `runLoop()` execution
3. Emit `loop.telemetry` audit entries via the existing audit surface
4. Expose `loop.telemetry` as a readable resource via `resource.read`
5. Tests for telemetry collection and emission

## Acceptance

- Each tool execution in `runLoop()` produces a telemetry entry with timing data
- Telemetry entries are accessible via `resource.read({ resourceId: "loop.telemetry" })`
- Audit tail includes `loop.step` kind entries for each capability invocation

## 工作总结

### 实现了什么
- 为 runLoop 增加 step telemetry 收集与回调
- 在 MV3 bridge 暴露 loop.telemetry 资源并写入 loop.step audit
- 修复 telemetry 失败用例导致的 vitest 卡死

### 实际跑了什么检查
- timeout 30s bunx vitest run packages/kernel/test/loop-orchestrator.spec.ts --reporter=verbose
- timeout 30s bunx vitest run packages/contracts/test/contracts.spec.ts --reporter=verbose
- timeout 30s bunx vitest run apps/mv3-shell/test/runtime-chat.spec.ts --reporter=verbose

### 残留风险
- 无

## 相关 commits

- `8a85a5bb4350` feat(observability): 补齐 loop 执行遥测链路
