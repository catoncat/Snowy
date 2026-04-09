---
id: ISSUE-117
title: "Review: sidepanel management still hard-codes an app-local AI surface subset"
status: open
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - review
  - ai-surface
  - sidepanel
  - control-plane
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-ai-surface
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - apps/mv3-shell/src/sidepanel-management-contract.ts
  - apps/mv3-shell/src/sidepanel/management.ts
  - apps/mv3-shell/test
acceptance_ref: docs/ai-surface-index.md
check_cmd: "bun run check"
---
## Goal

Review how sidepanel management should derive its allowed resources/actions from the shared AI surface without letting MV3-local constants become the de facto truth.

## Review Finding

- `contracts/core` now expose shared resource ids and public capability namespaces, but sidepanel management still keeps a local hard-coded subset of resources and actions.
- The current subset excludes audit/intervention resource consumers and does not project from the shared AI-surface registry, so control-plane consumers can drift from canonical surface changes.
- After config persistence and sidepanel management UI landed, the next drift risk is app-local consumer contracts becoming the de facto truth.

## Acceptance

- Decide the minimal rule for how sidepanel management derives its allowed resources/actions from shared AI-surface truth.
- If projection or registry work is needed, create follow-up slices with tests; if not, document why the current subset is intentionally fixed.
- Keep canonical ownership in `contracts/core` rather than MV3-local constants.
