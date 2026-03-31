---
id: ISSUE-082
title: "Follow-up: resource metadata registry and audience projection are still lookup-only"
status: open
priority: p1
source: "ISSUE-072 follow-up planning 2026-03-31"
created: 2026-03-31
assignee: unassigned
tags:
  - review
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-contracts-core
parallel_group: contracts-core
depends_on:
  - ISSUE-072
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - docs/
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

把 Follow-up: resource metadata registry and audience projection are still lookup-only 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- Current repo now has a unified lookup surface
- but resource metadata still lives in scattered constants/docs rather than a first-class registry.

## Acceptance

- Define a first-class resource metadata registry for current AI surface resource ids
- including audience/projection/read-owner metadata.
- Keep readAiSurfaceResource()/MV3 resource.read as the lookup path
- but stop relying on ad-hoc switch ownership for registry metadata.
- Tests and docs lock registry coverage for all current resource ids.
