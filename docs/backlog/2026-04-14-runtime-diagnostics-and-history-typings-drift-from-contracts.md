---
id: ISSUE-130
title: "Review: runtime diagnostics and history typings drift from contracts"
status: done
priority: p1
source: "auto next after ISSUE-129"
created: 2026-04-14
assignee: codex-019d8ba0
tags:
  - review
  - observability
  - diagnostics
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on: []
write_scope:
  - apps/mv3-shell/test/manifest.spec.ts
  - packages/core/src/index.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
completed_at: 2026-04-14T11:57:38.341Z
---

## Goal

把 runtime diagnostics and history typings drift from contracts 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- LoopTelemetryEntry exposes startedAt but runtime history resource still reads timestamp
- MV3 diagnostics fixtures still use the older kernel snapshot shape and fail repo typecheck

## Acceptance

- Runtime history resource derives generatedAt from the canonical loop telemetry field
- Manifest diagnostics fixtures align with current KernelDiagnostics snapshot contracts

## 工作总结

### 实现了什么
- 将 runtime.history 资源的 generatedAt 来源改为 canonical LoopTelemetryEntry.startedAt
- 把 manifest diagnostics fixture 的 snapshot override 改成按子结构 Partial，对齐当前 KernelDiagnostics 契约
- 清除 manifest/core 相关的 diagnostics/history 类型漂移

### 实际跑了什么检查
- bun x vitest run apps/mv3-shell/test/manifest.spec.ts packages/core/test/core.spec.ts
- ./node_modules/.bin/biome check apps/mv3-shell/test/manifest.spec.ts packages/core/src/index.ts
- ./node_modules/.bin/tsc --noEmit --pretty false 2>&1 | rg 'apps/mv3-shell/test/manifest\.spec\.ts|packages/core/src/index\.ts\(1624|packages/core/src/index\.ts\(1659|packages/core/src/index\.ts\(1681'
- bun run check（未通过，见下方风险）

### 残留风险
- repo 级 bun run check 仍被 write_scope 外问题阻塞（workflow complete-issue、loop-orchestrator、site-runtime 测试类型错误）

## 相关 commits

- `5dad00690e7e` fix(observability): 对齐诊断与历史资源类型
