---
id: ISSUE-176
title: "Cutover milestone: sidepanel Skills catalog does not consume package summary items"
status: done
priority: p0
source: "anti-fragmentation planning 2026-05-27"
created: 2026-05-27
assignee: codex-loop
claimed_at: 2026-05-26T18:23:12.305Z
tags:
  - cutover
  - milestone
  - skill-runtime
  - ai-surface
  - sidepanel
  - mv3-shell
module_id: old-product-replacement-loop
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-cutover-product-completion
parallel_group: mv3-shell
depends_on: []
write_scope:
  - apps/mv3-shell/src/sidepanel/management.ts
  - apps/mv3-shell/src/sidepanel/App.vue
  - apps/mv3-shell/test/sidepanel-management.spec.ts
  - docs/ai-surface-index.md
  - docs/cutover-readiness-criteria.md
  - docs/migration-parity-dashboard.md
  - docs/legacy-to-vnext-migration-matrix.md
acceptance_ref: docs/migration-parity-dashboard.md
check_cmd: "bun run check"
completed_at: 2026-05-26T18:23:12.305Z
---

## Goal

Continue the old-product replacement loop from package action discoverability into a visible product management surface. `ISSUE-175` proved that package-backed skills expose their action catalog and site metadata through shared `skills.summary` and `runtime.bootstrap`, but the sidepanel Skills section still behaves like a count display plus manual skill-id command form. The next replacement-quality proof is that the sidepanel consumes the same shared per-skill items and presents a package-backed Skills catalog without introducing app-local truth.

This is intentionally one vertical milestone. Do not split it into separate display, state helper, button, or docs issues unless a sub-gap blocks this milestone and cannot be completed inside this write scope.

## Review Finding

- `skills.summary.items` now exposes lifecycle state plus package manifest metadata for package-backed skills.
- `apps/mv3-shell/src/sidepanel/App.vue` currently displays only installed/enabled/trusted counts and a freeform skill id input.
- That means the AI surface can discover a package-backed skill action catalog, but the visible product control surface still cannot inspect or operate the installed package as a catalog item.
- Continuing to only add backend summary fields would recreate the fragmentation problem: data is landed, but the old product management experience remains unreplaced.

## Acceptance

- The sidepanel management state derives a stable list of skill catalog items from shared `skills.summary.items`, including `skillId`, lifecycle status, source, package entry/version/kind/description, permissions, tags, matches, `requiresActiveTab`, and action names/verifiers.
- The sidepanel Skills section renders package-backed skills as visible catalog items, including action catalog and site metadata, while keeping the existing manual skill id controls available for fallback operations.
- Enable/disable/uninstall controls can operate on a rendered skill item by sending the existing shared `skills.*` control-plane actions with that item's `skillId`, then refresh management state from shared resources.
- Archived or lifecycle-only malformed packages remain visible only according to the shared summary contract and must not invent app-local package metadata.
- The implementation must continue to bootstrap only through `resource.read skills.summary`; no sidepanel-only package registry or private runtime bootstrap truth is allowed.
- Docs and cutover/parity matrices describe that the old-product replacement loop now covers shared discoverability plus visible Skills catalog management, while full Skill Studio/versioning remains out of scope.
- Focused sidepanel management tests and MV3 checks cover the new catalog shape. Run `bun run check` unless an unrelated blocker prevents it.

## Not In Scope

- Full visual Skill Studio.
- Version selection or rollback UI.
- Package authoring/editor UI.
- Bridge-side MCP export.

## 工作总结

### 实现了什么
- sidepanel management 从 shared skills.summary.items 派生 Skill catalog items，并在 Skills section 展示 package metadata、action catalog、matches、permissions、tags、active-tab requirement；rendered item controls 复用现有 skills.enable/disable/uninstall control-plane actions；迁移 dashboard/matrix/cutover docs 同步 ISSUE-176 的可见管理面 cutover proof，并明确完整 Skill Studio/versioning 仍后置

### 实际跑了什么检查
- bun run test -- apps/mv3-shell/test/sidepanel-management.spec.ts (7 tests passed)
- ./node_modules/.bin/biome check apps/mv3-shell/src/sidepanel/management.ts apps/mv3-shell/src/sidepanel/App.vue apps/mv3-shell/test/sidepanel-management.spec.ts docs/ai-surface-index.md docs/cutover-readiness-criteria.md docs/migration-parity-dashboard.md docs/legacy-to-vnext-migration-matrix.md (passed for checked files)
- git diff --check (passed)
- bun run check (typecheck, Biome, 35 test files / 610 tests passed)

### 残留风险
- 无

## 相关 commits

- `a01aab453e5b` feat(sidepanel): 展示 Skill package catalog
