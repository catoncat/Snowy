---
id: ISSUE-145
title: "Resource read owner dispatch has no provider implementation"
status: done
priority: p1
source: review
created: 2026-04-15
assignee: unassigned
tags:
  - review
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
---

## Goal

把 Resource read owner dispatch has no provider implementation 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding


## Acceptance

- Each resource read owner has a registered provider that can fulfill resource.read requests; readAiSurfaceResource dispatches through the provider registry not a hardcoded switch; test coverage for provider-based resource dispatch

## 工作总结

Merged into ISSUE-137 (AI surface runtime dispatch and enforcement).
