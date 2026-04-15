---
id: ISSUE-149
title: "site.fetch_with_session action is typed but fetch-with-auth bridge is missing"
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

把 site.fetch_with_session action is typed but fetch-with-auth bridge is missing 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding


## Acceptance

- site.fetch_with_session has a provider that executes fetch using the active tab session cookies; response is returned as typed result with status and body; test coverage for auth-bearing fetch and error paths
