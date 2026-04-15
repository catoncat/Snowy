---
id: ISSUE-142
title: "Intervention state lacks cross-tab and cross-window coordination"
status: done
priority: p1
source: review
created: 2026-04-15
assignee: unassigned
tags:
  - review
module_id: intervention-handoff
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-intervention
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/kernel/src/intervention-controller.ts
  - apps/mv3-shell/src/background.ts
  - packages/kernel/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---

## Goal

把 Intervention state lacks cross-tab and cross-window coordination 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding


## Acceptance

- Intervention requests created in one tab are visible and resolvable from another tab or window; state synchronization uses a shared channel not polling

## 工作总结

Merged into ISSUE-136 (Intervention cross-endpoint coordination and timeout governance).
