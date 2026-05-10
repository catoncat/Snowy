---
id: ISSUE-168
title: "Review: workflow queue build hangs during Biome formatting"
status: open
priority: p0
source: "live workflow 2026-05-10"
created: 2026-05-10
assignee: unassigned
tags:
  - review
  - workflow
  - dx
  - biome
  - queue
module_id: repo-workflow-dx
module_stage: deferred
tracking_kind: follow-up
kind: slice
epic: EPIC-dx-hardening
parallel_group: sdk-docs
depends_on: []
write_scope:
  - .agents/skills/auto-claim-issues-next/scripts/build-live-queue.ts
  - .agents/skills/auto-claim-issues-next/scripts/build-live-queue.test.ts
  - docs/workflow/live-queue.json
acceptance_ref: docs/backlog/README.md
check_cmd: "bun run check"
---

## Goal

把 workflow queue build hangs during Biome formatting 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- Live run of bun run workflow:queue:build hung while formatting docs/workflow/live-queue.json through node_modules/.bin/biome; dry-run stayed fast
- so the mutating workflow path is not reliable.
- The already-closed ISSUE-081 claimed queue builder output was biome-stable
- but current runtime truth shows the formatter invocation can hang before writing the empty queue.

## Acceptance

- bun run workflow:queue:build completes and writes docs/workflow/live-queue.json when the queue has zero entries
- queue builder formatting avoids the hanging node_modules/.bin/biome wrapper or has a deterministic fallback
- focused regression tests cover the formatter path used by buildLiveQueue
