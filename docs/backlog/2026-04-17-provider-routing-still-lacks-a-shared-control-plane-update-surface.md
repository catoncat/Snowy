---
id: ISSUE-159
title: "Review: provider routing still lacks a shared control-plane update surface"
status: open
priority: p1
source: "next-batch-planner review 2026-04-17"
created: 2026-04-17
assignee: unassigned
tags:
  - review
  - ai-surface
  - provider-routing
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
  - docs/ai-surface-index.md
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

在 action projection controls 已收口后，明确 provider/profile routing 的下一条 northbound control-plane slice，避免 provider policy 继续停留在 kernel-local runtime seam。

## Review Finding

- ISSUE-150 已把 provider capability taxonomy 与 non-kernel route resolution 收回到 contracts/kernel，但当前 AI surface 仍没有统一的 provider policy summary/update surface，operator 无法通过 shared control-plane 管理 routing overrides。
- 若不在 ai-surface-control-plane 模块明确这条 northbound 边界，provider-profile-routing 会继续表现成实现已落地、但真正的 product control-plane 入口仍缺位。

## Acceptance

- contracts/core 明确 provider routing 对应的最小 shared action/resource surface，或显式记录当前阶段 deferral 边界与后续更窄 follow-up。
- ai-surface docs 与 tests 能说明 provider policy state 如何被读取或更新，而不是回退到 app-local settings glue。
