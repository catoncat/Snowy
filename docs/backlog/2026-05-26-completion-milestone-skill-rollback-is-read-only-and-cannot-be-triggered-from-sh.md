---
id: ISSUE-179
title: "Completion milestone: Skill rollback is read-only and cannot be triggered from shared Studio surface"
status: open
priority: p0
source: "completion planning 2026-05-27"
created: 2026-05-26
assignee: unassigned
tags:
  - review
  - completion
  - studio
  - rollback
module_id: skill-studio-completion-loop
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-skill-studio
parallel_group: sdk-docs
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/sidepanel/management.ts
  - apps/mv3-shell/src/sidepanel/App.vue
  - apps/mv3-shell/test/manifest.spec.ts
  - apps/mv3-shell/test/sidepanel-management.spec.ts
  - docs/skill-lifecycle-version-engine-boundary.md
  - docs/ai-surface-index.md
  - docs/migration-parity-dashboard.md
  - docs/legacy-to-vnext-migration-matrix.md
  - docs/module-tracking-ledger.json
acceptance_ref: docs/skill-lifecycle-version-engine-boundary.md
check_cmd: "bun run check"
---

## Goal

Turn Skill Studio version readiness into an executable product loop: inspect rollback target from shared skills.summary, trigger rollback through a shared skills.rollback action, restore package files via BrowserVFS, and observe updated shared summary/audit evidence.

## Review Finding

- ISSUE-178 exposes versionSurface but rollback remains read-only; users can see rollback readiness but cannot perform the Studio rollback action through the shared control plane.
- BrowserVFS already owns snapshot/rehydrate primitives and contracts define latest trusted rollback policy
- so keeping rollback as docs-only preserves the same old-product gap under a new surface.

## Acceptance

- packages/contracts/core expose skills.rollback as a product control-plane action with descriptor-owned projection and typed helper/message shape
- shared MV3 runtime handles skills.rollback by selecting the latest trusted rollback target unless a versionUri is supplied
- rehydrating mem://skills/<id>
- preserving lifecycle state
- and returning rollback metadata
- skills.summary versionSurface reflects the rollback result and audit.tail records the rollback action with skill/version evidence
- sidepanel Skills catalog enables a rollback command only when the shared versionSurface has a rollback target and sends skills.rollback through the shared management action path
- docs distinguish rollback action from full version-selection UI and authoring studio
- focused contracts/core/MV3 sidepanel/runtime tests pass
- plus bun run check and git diff --check
