---
id: ISSUE-113
title: "Review: kernel subagent run semantics are still undefined"
status: open
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - review
  - kernel
  - subagent
  - run-state
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/kernel/src/kernel-facade.ts
  - packages/kernel/src/run-controller.ts
  - packages/kernel/src/loop-orchestrator.ts
  - packages/kernel/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---
## Goal

Review whether browser-side kernel mainline now needs an explicit child-run / subagent contract, or whether that boundary should be recorded as intentionally deferred.

## Review Finding

- The recovery report still treats subagent run as part of browser-side kernel mainline, but current contracts and kernel tests have no child-run or nested-run model.
- The current run queue is session-local single-run state only; `steer` / `followUp` do not model parent-child run ownership, cancellation, or handoff.
- Without an explicit kernel contract here, future delegation or nested agent flows are likely to regress into app-local glue instead of package-owned runtime semantics.

## Acceptance

- Clarify whether vNext mainline requires a minimal child-run / subagent contract or an explicit deferral decision.
- If needed, land follow-up backlog slices that define state, queue, and trace ownership for child runs; otherwise update planning docs to record the intentional boundary.
- Anchor the review in current contracts/kernel code and tests rather than old-repo labels alone.
