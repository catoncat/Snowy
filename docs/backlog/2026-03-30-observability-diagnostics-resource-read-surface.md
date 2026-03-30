---
id: ISSUE-063
title: "observability: diagnostics resource read surface"
status: open
priority: p2
source: review
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - follow-up
  - observability
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
acceptance_ref: docs/ai-surface-index.md
check_cmd: "bun run check"
---

## Goal

把 observability: diagnostics resource read surface 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- AI surface has actions for diagnostics but no resource read surfaces for runtime summary
- audit tail summary
- config summary

## Acceptance

- Resource surface types defined in contracts for runtime/audit/config summaries
- At least one resource surface implemented and tested
