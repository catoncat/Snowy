---
id: ISSUE-118
title: "Review: background automation lane still lacks stabilization and failure-tracking scope"
status: open
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - review
  - site-runtime
  - automation
  - background
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-browser-automation
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/page-hook.ts
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---
## Goal

Review the next post-plumbing slice for background automation so the lane advances from transport wiring to stable, operator-trustworthy behavior.

## Review Finding

- Background lane plumbing now exists, but the recovery report still treats broader browser automation stabilization, DOM lane behavior, and failure tracking as unfinished.
- The current background contract mostly covers create/invoke/cleanup; it has not yet re-verified failure tracker behavior, DOM stabilization, or broader page action coverage in non-active-tab runs.
- Without a scoped follow-up, background automation risks stopping at transport plumbing rather than operator-trustworthy automation behavior.

## Acceptance

- Clarify the minimal post-plumbing scope for background-lane stabilization and failure tracking in the current phase.
- If concrete gaps remain, open executable follow-up slices on shared `site-runtime/MV3` paths with targeted tests.
- Keep active-lane and background-lane boundaries explicit instead of silently broadening one path into the other.
