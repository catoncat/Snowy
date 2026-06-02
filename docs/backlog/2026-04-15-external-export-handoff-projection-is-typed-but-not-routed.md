---
id: ISSUE-137
title: "AI surface runtime dispatch and enforcement: external export, resource providers, and audience filtering"
status: done
priority: p1
source: review
created: 2026-04-15
assignee: codex-019d943a
tags:
  - review
  - ai-surface
  - resource-dispatch
  - audience
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-ai-surface
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/core/src/index.ts
  - packages/contracts/src/index.ts
  - packages/core/test
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
merges:
  - ISSUE-145
  - ISSUE-146
completed_at: 2026-04-16T03:08:27.502Z
---

## Goal

补全 AI surface 的运行时 dispatch 与 enforcement：external export projection 真实路由、resource read owner provider dispatch、以及 audience-based 过滤的运行时强制执行。该 export 方向现在只作为历史记录保留，不再表示当前产品支持范围。

## Review Finding

- `descriptorsToCapabilityExportHandoffs` 已有类型和输出，但无消费者——external projection 路径不存在。
- resource read owner registry 已有 metadata 但无 provider 实现，`readAiSurfaceResource` 走硬编码路径。
- audience-based 过滤在类型系统中定义了（chat / skill / system / export），但运行时不做检查——skill caller 可以读到 system-only resource。

## Acceptance

- descriptorsToCapabilityExportHandoffs output is consumed by at least one concrete external projection path with test coverage
- Each resource read owner has a registered provider; readAiSurfaceResource dispatches through the provider registry not a hardcoded switch
- Resource reads are filtered by caller audience at runtime; a skill-audience caller cannot read system-only resources
- Test coverage for export routing, provider-based resource dispatch, and audience enforcement/rejection

## Impact Note

1. northbound surface：`packages/core` 新增 concrete external projection invoke path，并把 `readAiSurfaceResource()` 收口到 provider registry + audience enforcement。
2. 影响消费者：Skill runtime / system-internal resource readers / external export projection；聊天面继续通过 audience 投影间接受约束。
3. 控制面文档：已执行 Doc Freshness Gate，现有 `docs/ai-surface-index.md`、`docs/agent-bootstrap-context-pack.md`、`docs/legacy-to-vnext-migration-matrix.md`、`docs/migration-parity-dashboard.md` 与 `docs/cutover-readiness-criteria.md` 无需同步，因为本次只补运行时接线与 enforcement，不改 AI surface taxonomy 或 bridge/server 范围。

## 工作总结

### 实现了什么
- 在 packages/core 新增 external export projection invoke path，消费 descriptor handoff 并按 exportName 路由到 dispatchCapabilityCall
- 把 readAiSurfaceResource 收口到 owner provider registry，并对 caller audience 执行 runtime enforcement
- 补 contracts/core 测试，锁定 runtime.history 的 system-only audience 与 provider/export 路由行为

### 实际跑了什么检查
- bun test packages/core/test/core.spec.ts packages/contracts/test/contracts.spec.ts -t 'dispatches AI surface resource reads through the owner provider registry|rejects resource reads when the caller audience is not allowed|routes external export invocations by exportName through the concrete projection path|defines a first-class resource metadata registry with full id coverage|projects resource metadata by audience'
- bun run check

### 残留风险
- 无

## 相关 commits

- `5382092d7a68` fix(core): 补齐 AI surface 资源与 external export 运行时接线
