---
id: ISSUE-095
title: "Add loop execution telemetry to audit surface"
status: open
priority: p1
source: "next-batch planning 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - observability
  - audit
  - telemetry
  - loop
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-observability
parallel_group: kernel
depends_on:
  - ISSUE-094
write_scope:
  - packages/kernel/src/loop-orchestrator.ts
  - packages/contracts/src/index.ts
  - apps/mv3-shell/src/background.ts
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bunx vitest run packages/kernel/test/loop-orchestrator.spec.ts"
---

## Goal

Add structured telemetry for loop execution so operators can diagnose slow steps, track token usage, and see capability invocation histories. Gate F requires minimal diagnostics for the core loop path.

## Scope

1. Add `LoopTelemetryEntry` type to contracts: `{ stepIndex, capabilityId, startedAt, endedAt, durationMs, ok, errorCode?, tokenEstimate? }`
2. Collect telemetry entries during `runLoop()` execution
3. Emit `loop.telemetry` audit entries via the existing audit surface
4. Expose `loop.telemetry` as a readable resource via `resource.read`
5. Tests for telemetry collection and emission

## Acceptance

- Each tool execution in `runLoop()` produces a telemetry entry with timing data
- Telemetry entries are accessible via `resource.read({ resourceId: "loop.telemetry" })`
- Audit tail includes `loop.step` kind entries for each capability invocation
