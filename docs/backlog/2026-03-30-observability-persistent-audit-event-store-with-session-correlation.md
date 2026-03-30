---
id: ISSUE-062
title: "observability: persistent audit event store with session correlation"
status: done
priority: p1
source: review
created: 2026-03-30
assignee: copilot-opus
tags:
  - review
  - gap
  - observability
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on: []
write_scope:
  - apps/mv3-shell/src/background.js
  - packages/contracts/src/index.ts
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
---

## Goal

把 observability: persistent audit event store with session correlation 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- Audit tail ring buffer is in-memory only in background.js; no persistent store; no session correlation

## Acceptance

- Audit events survive service worker restart
- Audit entries carry sessionId for correlation
- Audit tail read surface works with persistent store
