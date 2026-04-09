---
id: ISSUE-116
title: "Review: intervention control-plane actions are still background-private"
status: open
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - review
  - intervention
  - control-plane
  - runtime
module_id: intervention-handoff
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---
## Goal

Review whether intervention lifecycle actions should now be lifted into the shared control plane instead of remaining MV3 bridge-private behavior.

## Review Finding

- Runtime services and the background bridge already expose `intervention.list`, `intervention.resolve`, and `intervention.cancel`, but the shared `contracts/core` control plane still does not model these actions.
- Intervention runtime summary and audit are now visible, yet action ownership is still inferred from MV3 message types instead of a package-owned AI-surface contract.
- If intervention lifecycle stays bridge-private, future chat, skill, or UI consumers will have to special-case MV3 transport instead of reusing a canonical surface.

## Acceptance

- Decide whether `intervention.list` / `intervention.resolve` / `intervention.cancel` belong in the public capability/control-plane surface for the vNext mainline.
- If yes, create executable follow-up slices in `contracts/core` with tests; if no, document the intentional bridge-private boundary.
- The review must cover lifecycle, audit, and resource implications, not just message routing names.
