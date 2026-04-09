---
id: ISSUE-101
title: "Add kernel runtime summary facade for session diagnostics"
status: open
priority: p2
source: "next-batch planning 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - kernel
  - diagnostics
  - runtime
  - facade
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on:
  - ISSUE-095
write_scope:
  - packages/kernel/src/kernel-facade.ts
  - packages/kernel/test/kernel-facade.spec.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bunx vitest run packages/kernel/test/kernel-facade.spec.ts"
---

## Goal

Add a minimal runtime-summary API on the Kernel facade so callers can inspect per-session run state, queue state, loop progress, and intervention summary without reaching into kernel subcontrollers directly.

## Review Finding

- The kernel now has working session, run, loop, compaction, and intervention subsystems, but callers still need to inspect individual controllers or infer state indirectly.
- The recovery report and kernel skeleton both treat diagnostics/introspection as part of the browser-side brain mainline, not as optional DX polish.
- There is currently no focused backlog slice that lands a minimal diagnostics summary on the kernel public API.

## Scope

1. Add a per-session runtime-summary read API on the Kernel facade.
2. Compose the summary from existing subsystem state instead of introducing new duplicated state.
3. Add kernel-facade tests that cover idle, queued, running, and intervention-active scenarios.

## Acceptance

- The Kernel facade exposes a stable per-session runtime summary API for diagnostics/introspection.
- The summary is derived from existing subsystem state and does not add a parallel state model.
- `packages/kernel/test/kernel-facade.spec.ts` verifies the runtime summary across idle, queued prompt, running, and intervention-active states.
