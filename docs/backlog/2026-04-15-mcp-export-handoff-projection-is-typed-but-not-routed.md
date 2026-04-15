---
id: ISSUE-137
title: "AI surface runtime dispatch and enforcement: MCP export, resource providers, and audience filtering"
status: open
priority: p1
source: review
created: 2026-04-15
assignee: unassigned
tags:
  - review
  - ai-surface
  - mcp
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
merges: [ISSUE-145, ISSUE-146]
---

## Goal

补全 AI surface 的运行时 dispatch 与 enforcement：MCP export projection 真实路由、resource read owner provider dispatch、以及 audience-based 过滤的运行时强制执行。

## Review Finding

- `descriptorsToCapabilityExportHandoffs` 已有类型和输出，但无消费者——MCP projection 路径不存在。
- resource read owner registry 已有 metadata 但无 provider 实现，`readAiSurfaceResource` 走硬编码路径。
- audience-based 过滤在类型系统中定义了（chat / skill / system / mcp），但运行时不做检查——skill caller 可以读到 system-only resource。

## Acceptance

- descriptorsToCapabilityExportHandoffs output is consumed by at least one concrete MCP projection path with test coverage
- Each resource read owner has a registered provider; readAiSurfaceResource dispatches through the provider registry not a hardcoded switch
- Resource reads are filtered by caller audience at runtime; a skill-audience caller cannot read system-only resources
- Test coverage for MCP routing, provider-based resource dispatch, and audience enforcement/rejection
