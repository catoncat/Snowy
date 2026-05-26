---
id: ISSUE-172
title: "Cutover milestone: old-product replacement skill loop is not proven end-to-end"
status: open
priority: p0
source: "anti-fragmentation planning 2026-05-27"
created: 2026-05-27
assignee: unassigned
tags:
  - cutover
  - milestone
  - skill-runtime
  - mv3-shell
  - ai-surface
  - observability
kind: slice
epic: EPIC-cutover-product-completion
parallel_group: mv3-shell
module_id: old-product-replacement-loop
module_stage: mainline
tracking_kind: mainline
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - packages/skill-sdk/src/index.ts
  - packages/skill-sdk/test/skill-sdk.spec.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/sidepanel/
  - apps/mv3-shell/test/
  - docs/cutover-readiness-criteria.md
  - docs/migration-parity-dashboard.md
  - docs/legacy-to-vnext-migration-matrix.md
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
---

## Goal

Stop advancing the browser extension rewrite as a collection of small review closures. Prove one old-product replacement loop end-to-end: an executable skill package can be installed through the shared product surface, preserve its lifecycle state across runtime restart, be enabled, be invoked through the browser extension runtime, call a real capability, and leave operator-visible diagnostics / audit evidence.

This is the next milestone because the current docs say many substrate gates are shipped, but the project still cannot claim the old Plugin / Skill management experience has a replacement-quality vertical loop.

## Review Finding

- The previous workflow made progress by closing many narrow gaps, but it also encouraged splitting the remaining old-product replacement work into tiny review issues.
- `docs/cutover-readiness-criteria.md` still says the repo is not Level 2 cutover ready, while `docs/module-tracking-ledger.json` had already deferred `skill-runtime-sdk-studio`.
- `docs/migration-parity-dashboard.md` still marks skill SDK / authoring, plugin -> executable skill migration, and Skill Studio / lifecycle product surface below green.
- The next useful unit is not another small lifecycle or docs ticket. It is a single proof that the shared browser extension runtime can replace the old plugin loop at the user-capability level.

## Acceptance

- A test-backed vertical flow covers install → persist across restart/rehydrate → enable → invoke for a representative executable skill package.
- The representative skill invocation reaches at least one real shared capability path, not only a local mock helper.
- The flow writes or exposes operator-visible evidence through existing shared diagnostics / audit / runtime summary surfaces.
- The implementation stays on the shared AI-surface / MV3 runtime path; it must not create a new app-local bootstrap truth or private sidepanel-only state.
- `docs/cutover-readiness-criteria.md`, `docs/migration-parity-dashboard.md`, and `docs/legacy-to-vnext-migration-matrix.md` are updated to describe exactly what this vertical proof does and does not settle.
- If a sub-gap is discovered, do not auto-split it into another issue unless it blocks this milestone and cannot be completed inside this write scope.
- Focused verification covers the touched packages. Run `bun run check` unless an unrelated parallel blocker prevents it, in which case record the blocker and the focused checks that passed.

## Not In Scope

- Full visual Skill Studio.
- Every old plugin UI affordance.
- Tier 2 / Tier 3 browser automation breadth.
- A bridge-side MCP server.

## Impact Note

1. Northbound surface impact: uses existing `skills.invoke` / `skills.install` / `skills.enable` actions and `skills.summary` / `audit.tail` resources; no new public capability namespace is added.
2. Consumer impact: Skill runtime gains a shared MV3 invocation path for enabled executable skills, UI / Agent / system consumers can observe lifecycle and invocation evidence through existing shared resources, MCP export surface is unchanged.
3. Control-plane docs: `docs/ai-surface-index.md`, `docs/agent-bootstrap-context-pack.md`, `docs/cutover-readiness-criteria.md`, `docs/migration-parity-dashboard.md`, and `docs/legacy-to-vnext-migration-matrix.md` must stay synced with the exact proof scope.
