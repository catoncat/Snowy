---
id: ISSUE-115
title: "Review: runtime history and debug export boundary is still incomplete"
status: open
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - review
  - observability
  - diagnostics
  - audit
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/sidepanel/management.ts
  - apps/mv3-shell/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---
## Goal

Review the remaining operator-facing observability boundary after level-1 diagnostics landed, especially around runtime history and debug export semantics.

## Review Finding

- Level-1 runtime debug snapshot, audit tail, intervention audit, and loop telemetry now exist, but there is still no explicit runtime-history / export contract for inspecting recent runs beyond the latest summary.
- Sidepanel management currently hard-codes `runtime/config/skills/hosts` summaries and does not consume audit or intervention resources as part of a shared operator surface.
- Without a clear export/read boundary, observability can drift between background-private helpers, diagnostics payloads, and UI-specific state.

## Acceptance

- Clarify the minimal operator-facing runtime history / export surface for the current phase, whether as resources, actions, or explicit deferral.
- If gaps remain, create follow-up slices anchored on shared `contracts/core/background` paths rather than app-local one-offs.
- Keep the distinction clear between the landed level-1 diagnostics snapshot and broader observability scope.
