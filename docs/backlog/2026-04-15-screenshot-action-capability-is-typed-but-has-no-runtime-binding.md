---
id: ISSUE-147
title: "Screenshot action capability is typed but has no runtime binding"
status: open
priority: p1
source: review
created: 2026-04-15
assignee: unassigned
tags:
  - review
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-browser-automation
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/site-runtime/src/index.ts
  - apps/mv3-shell/src/background.ts
  - packages/site-runtime/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---

## Goal

把 Screenshot action capability is typed but has no runtime binding 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding


## Acceptance

- Screenshot capability descriptor has a working provider that captures the active tab via chrome.tabs.captureVisibleTab or equivalent; captured image is returned as a typed result; test coverage for capture and error paths
