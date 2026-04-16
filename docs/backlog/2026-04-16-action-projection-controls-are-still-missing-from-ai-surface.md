---
id: ISSUE-153
title: "Review: action projection controls are still missing from AI surface"
status: done
priority: p1
source: review
created: 2026-04-16
assignee: codex-019d946a
tags:
  - review
  - ai-surface
  - control-plane
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-ai-surface
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - packages/core/test
  - docs/ai-surface-index.md
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
completed_at: 2026-04-16T17:10:00.000Z
---

## Goal

把 action projection controls are still missing from AI surface 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- The AI surface design calls out missing action-level projection controls such as audiences default exposure confirm policy and execution target.
- Current resource metadata helps with resource.read and runtime.bootstrap, but action exposure policy is still not descriptor-owned for chat skill system and MCP projections.

## Acceptance

- Contracts define minimal action projection metadata for audience default exposure confirm policy and execution target semantics
- Core can list or filter actions by projection using descriptor-owned metadata rather than ad-hoc allowlists
- Docs and tests cover projection semantics across chat skill system and MCP surfaces

## Impact Note

1. northbound surface：`CapabilityDescriptor` / `ToolContract` / MCP handoff 现在都带同一套 action projection metadata，`CapabilityRegistry` 也能按 projection 过滤 action。
2. 影响消费者：聊天 tool surface、skill runtime、system-internal capability listing、MCP export projection 都改为可消费 descriptor-owned `audiences/defaultExposed/confirmPolicy/executionTarget`。
3. 控制面文档：已执行 Doc Freshness Gate，检查了 `docs/ai-surface-index.md`、`docs/agent-bootstrap-context-pack.md`、`docs/legacy-to-vnext-migration-matrix.md`、`docs/migration-parity-dashboard.md` 与 `docs/cutover-readiness-criteria.md`；本次只需同步 `docs/ai-surface-index.md`，其余文档当前口径不变。

## Sub Issues

- `ISSUE-156` `Review: chat tool projection still ignores descriptor default exposure metadata`

## 工作总结

### 实现了什么

- 在 `packages/contracts` 为 action descriptor 增加 `projection` metadata，并把 `audiences/defaultExposed/confirmPolicy/executionTarget` 投影到 `ToolContract` 和 MCP handoff annotations
- 在 `packages/core` 新增 `CapabilityRegistry.listByProjection()`，让 tool 和 MCP projection 改为基于 descriptor-owned metadata 过滤，同时让 runtime confirm gate 支持 `confirmPolicy=always`
- 同步 `docs/ai-surface-index.md`，并补 contracts/core/kernel 的聚焦测试；另外把聊天 tool surface 尚未消费 `defaultExposed` 的缺口拆成 follow-up `ISSUE-156`

### 实际跑了什么检查

- `./node_modules/.bin/biome check packages/contracts/src/index.ts packages/contracts/test/contracts.spec.ts packages/core/src/index.ts packages/core/test/core.spec.ts docs/ai-surface-index.md`
- `bun test packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts -t 'derives action projection metadata and exposes it through tool annotations|filters descriptors by audience default exposure and execution target|requires the mcp audience in addition to exportable for MCP handoffs|lists and projects action capabilities by audience and default exposure|projects bridge-side MCP export handoffs from exportable descriptors only|honors descriptor confirmPolicy overrides in the runtime context'`
- `bun test packages/kernel/test/loop-orchestrator.spec.ts packages/kernel/test/prompt-builder.spec.ts -t 'uses actual tool names in guidance|injects available skills as compact xml context'`
- `bun run typecheck`
- `bun run check`

### 残留风险

- `packages/kernel/src/loop-orchestrator.ts` 仍直接调用 `registry.projectTools()`，聊天面尚未消费这次新增的 `defaultExposed` / audience 过滤；已拆到 `ISSUE-156`
- `bun run typecheck` / `bun run check` 仍被仓库当前基线问题阻塞：`packages/core/test/core.spec.ts` 的 `observabilityReplay` / resource data typing，以及 config rehydrate 断言尚未收敛，不属于本次 slice 的改动范围
- 本次没有安全重建并提交 `docs/workflow/live-queue.json`：当前工作区已存在并行规划产出的未提交 backlog / batch 文档，直接重建 queue 会把这些无关 planning artifact 一并纳入本次提交

## 相关 commits

- `cb051ce` `feat(ai-surface): 补齐 action projection 控制`
