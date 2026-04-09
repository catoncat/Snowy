---
id: ISSUE-122
title: "Follow-up: expose runtime history through a shared observability resource surface"
status: open
priority: p1
source: "ISSUE-115 review 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - review
  - follow-up
  - observability
  - diagnostics
  - audit
  - runtime-history
  - debug-export
module_id: observability-audit
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on:
  - ISSUE-115
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---

## Goal

Define the minimal shared runtime-history read surface for operators so recent run/step visibility no longer depends on MV3-private helpers, while bulk debug export remains explicitly deferred.

## Review Finding

- `audit.tail` and `audit.intervention` already exist as shared resources, and `runtime.capture_diagnostics` already covers the latest snapshot, but recent runtime history still lacks a shared `contracts/core` resource id.
- `apps/mv3-shell` currently special-cases `loop.telemetry` inside background read routing, which means recent run/step visibility is available only through an app-private branch instead of the canonical AI-surface registry.
- sidepanel management hard-coded subsets are a separate consumer-projection problem tracked elsewhere; the narrower gap here is the missing runtime-history/export contract itself.

## Acceptance

- Recent run/step history is exposed through a shared `contracts/core` resource contract (or an explicitly documented equivalent), not only through MV3-private `loop.telemetry` handling.
- `runtime.capture_diagnostics` remains the latest snapshot entrypoint, while bulk debug export / dump semantics stay explicitly deferred unless this slice can lock them without app-local glue.
- MV3 background read path and tests use the shared runtime-history contract, and the review no longer relies on background-private helper names as truth.
