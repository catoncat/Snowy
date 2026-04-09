---
id: ISSUE-100
title: "Follow-up: expose intervention status on runtime observability surface"
status: open
priority: p1
source: "next-batch planning 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - intervention
  - observability
  - runtime
  - control-plane
module_id: intervention-handoff
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-intervention
parallel_group: contracts-core
depends_on:
  - ISSUE-095
  - ISSUE-098
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/test/runtime-chat.spec.ts
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bunx vitest run packages/core/test/core.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts"
---

## Goal

Expose intervention runtime state through a stable observability/control-plane surface so operators can inspect pending and recent intervention status without inferring it from raw audit logs or tests.

## Review Finding

- `ISSUE-098` proved the verify → intervention → resolution chain works end-to-end.
- The current runtime surface still lacks a stable, operator-facing way to read current intervention status and recent intervention outcomes.
- As a result, the `intervention-handoff` module remains only partially landed in product terms: the control flow exists, but the runtime/control-plane visibility is still weak.

## Scope

1. Add the minimal contracts/core surface needed to describe intervention runtime summary data.
2. Expose intervention summary data from the mv3 runtime control-plane/resource path.
3. Add tests that prove intervention summary updates after request, resolve, cancel, and timeout transitions.

## Acceptance

- The runtime observability surface exposes intervention summary data that includes current pending state and recent lifecycle outcomes.
- Callers can inspect intervention runtime state without parsing raw audit entries manually.
- Targeted tests verify that request / resolve / cancel / timeout transitions are reflected in the exposed runtime summary.
