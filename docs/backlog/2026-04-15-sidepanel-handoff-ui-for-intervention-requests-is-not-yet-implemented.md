---
id: ISSUE-141
title: "Sidepanel handoff UI for intervention requests is not yet implemented"
status: open
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
  - apps/mv3-shell/src/sidepanel
  - packages/contracts/src/index.ts
  - apps/mv3-shell/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---

## Goal

把 Sidepanel handoff UI for intervention requests is not yet implemented 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding


## Acceptance

- Sidepanel surfaces pending intervention requests with approve and reject actions; intervention resolution from sidepanel flows through the shared control-plane path not a private helper
