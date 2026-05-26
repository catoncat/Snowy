---
id: ISSUE-175
title: "Cutover milestone: package manifest actions are not discoverable through AI surface"
status: done
priority: p0
source: "anti-fragmentation planning 2026-05-27"
created: 2026-05-26
assignee: codex-loop
tags:
  - cutover
  - milestone
  - skill-runtime
  - ai-surface
  - mv3-shell
module_id: old-product-replacement-loop
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-cutover-product-completion
parallel_group: mv3-shell
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/skill-package-convention.md
  - docs/skill-authoring-guide.md
  - docs/cutover-readiness-criteria.md
  - docs/migration-parity-dashboard.md
  - docs/legacy-to-vnext-migration-matrix.md
acceptance_ref: docs/skill-package-convention.md
check_cmd: "bun run check"
completed_at: 2026-05-26T18:12:04.738Z
---

## Goal

Continue the old-product replacement loop from package execution into product and AI discoverability. ISSUE-174 proved that persisted package manifests can register executable handlers after restart. The next replacement-quality proof is that package manifest actions and site metadata become visible through the shared AI surface, so an agent or product UI can discover what the installed package can do before invoking it.

## Review Finding

- Installed package `skill.json` files already define `actions`, `matches`, `requiresActiveTab`, `description`, `kind`, `version`, `permissions`, `tags`, and `entry`.
- The runtime discovery path currently uses the package manifest only to register an executable handler; skills.summary remains a count-oriented lifecycle summary.
- That means the new runtime can execute a package, but the AI/product surface still cannot inspect the package action catalog that replaces the old plugin discovery experience.

## Acceptance

- A package installed through `skills.install` with `skill.json` actions, matches, requiresActiveTab, description, kind, version, permissions, tags, and entry is discoverable after restart through `resource.read skills.summary`.
- `skills.summary` includes per-skill items for package-backed skills, including lifecycle state plus manifest action catalog and site metadata, without requiring test-only `skillDefinitions`.
- Invalid or malformed package manifest metadata does not break skills.summary reads; malformed packages remain lifecycle-visible but do not expose bogus action metadata.
- `runtime.bootstrap` and `resource.read` use the same shared summary shape, not a sidepanel-only or app-local discovery path.
- Docs and cutover/parity matrices describe that the replacement loop now covers install -> persist/restart -> discover manifest -> expose actions -> enable -> invoke -> observe, while full Skill Studio remains out of scope.
- Focused MV3 and core tests cover the new summary shape. Run bun run check unless an unrelated blocker prevents it.

## 工作总结

### 实现了什么
- shared skills.summary/runtime.bootstrap expose package manifest action catalog and metadata for package-backed skills; malformed package manifests remain lifecycle-visible without bogus action metadata

### 实际跑了什么检查
- bun run check (typecheck, biome, vitest: 35 files, 609 tests)
- git diff --check

### 残留风险
- 无

## 相关 commits

- `e5cd727708cc` feat(mv3): 暴露 Skill package action catalog
