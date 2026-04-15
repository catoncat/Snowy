---
id: ISSUE-144
title: "Structured summary export and rawEventTail are still undefined"
status: done
priority: p1
source: review
created: 2026-04-15
assignee: unassigned
tags:
  - review
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - packages/core/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---

## Goal

把 Structured summary export and rawEventTail are still undefined 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding


## Acceptance

- Contracts define a structured run summary export schema and rawEventTail resource type; core provides a builder that accumulates run-cycle data into exportable summary format with test coverage

## 工作总结

Merged into ISSUE-143 (Observability export surface: timeline, structured summary, and rawEventTail).
