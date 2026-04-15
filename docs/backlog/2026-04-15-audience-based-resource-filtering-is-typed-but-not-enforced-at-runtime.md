---
id: ISSUE-146
title: "Audience-based resource filtering is typed but not enforced at runtime"
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

把 Audience-based resource filtering is typed but not enforced at runtime 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding


## Acceptance

- Resource reads are filtered by caller audience at runtime; a skill-audience caller cannot read system-only resources; test coverage for audience enforcement and rejection

## 工作总结

Merged into ISSUE-137 (AI surface runtime dispatch and enforcement).
