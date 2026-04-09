---
id: ISSUE-119
title: "Review: execution host control plane still assumes a single local/offscreen host"
status: open
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - review
  - execution-host
  - remote-host
  - offscreen
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-execution-host
parallel_group: js-runner
depends_on: []
write_scope:
  - packages/js-runner/src/index.ts
  - apps/mv3-shell/src/offscreen.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
---
## Goal

Review the remaining execution-host control-plane gap after remote-exec plumbing landed, especially around multi-host and remote-host semantics.

## Review Finding

- Remote exec adapter plumbing and offscreen integration are landed, but ISSUE-073 explicitly left multi-host control-plane semantics and concrete remote transport out of scope.
- Current hosts/runtime wiring still effectively assumes one local/offscreen host, so remote execution remains injectable plumbing more than a managed execution-host surface.
- Without a fresh review, `execution-host-bridge` can look more complete than the actual host selection, health, and control-plane semantics support.

## Acceptance

- Decide the minimal vNext boundary for multi-host and remote-host management in the current phase.
- Either create follow-up slices for host selection/control-plane semantics or document explicit deferment and module-status rationale.
- Distinguish landed remote-exec plumbing from true execution-host control-plane parity.
