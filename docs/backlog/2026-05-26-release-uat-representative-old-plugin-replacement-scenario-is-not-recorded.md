---
id: ISSUE-183
title: "Release UAT: representative old-plugin replacement scenario is not recorded"
status: open
priority: p0
source: "Level 2 release acceptance boundary 2026-05-27"
created: 2026-05-26
assignee: unassigned
tags:
  - review
  - release
  - uat
  - cutover
module_id: old-product-replacement-loop
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-cutover-readiness
parallel_group: mv3-shell
depends_on: []
write_scope:
  - docs/level-2-uat-scenario-2026-05-27.md
  - docs/level-2-cutover-acceptance-2026-05-27.md
acceptance_ref: docs/level-2-cutover-acceptance-2026-05-27.md
check_cmd: "bun run check"
---

## Goal

Record one concrete release UAT scenario for the representative old-plugin replacement loop after the Level 2 acceptance pack. The scenario must use existing runtime evidence and should not create new feature scope.

## Review Finding

- The repo-side Level 2 acceptance pack is complete but external release acceptance can still ask what exact scenario was exercised. Without a single UAT readout the next agent may reopen deferred breadth instead of running or citing the representative loop.

## Acceptance

- A UAT document defines the representative old plugin replacement scenario from install through event dispatch and audit evidence.
- The UAT document lists exact commands and observed results from the current run including build and check evidence.
- The Level 2 acceptance pack points to the UAT scenario as the next evidence artifact without reopening deferred breadth.
