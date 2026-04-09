---
id: ISSUE-094
title: "Expose loop introspection methods on Kernel facade"
status: open
priority: p1
source: "next-batch planning 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - kernel
  - api-surface
  - loop
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/kernel-facade.ts
  - packages/kernel/test/kernel-facade.spec.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bunx vitest run packages/kernel/test/kernel-facade.spec.ts"
---

## Goal

Expose `checkTerminal`, `checkNoProgress`, `getMaxSteps`, and `resetSession` on the Kernel facade so that external orchestrators (like loop-orchestrator and mv3-shell) can manage loops through the public API instead of reaching into `kernel.loop` internals.

## Scope

1. Add `checkTerminal(sessionId, turn, opts?)` to Kernel facade — delegates to LoopEngine
2. Add `checkNoProgress(sessionId)` to Kernel facade — delegates to LoopEngine
3. Add `getMaxSteps()` to Kernel facade — delegates to LoopEngine
4. Add `resetLoopState(sessionId)` to Kernel facade — delegates to LoopEngine.resetSession
5. Update loop-orchestrator to use facade methods instead of `kernel.loop.*` direct access
6. Tests for each new facade method

## Acceptance

- All four methods accessible on `Kernel` type without accessing `.loop` subsystem
- `loop-orchestrator.ts` no longer casts or accesses `kernel.loop` directly
- Existing tests pass, new tests cover the facade methods
