---
id: ISSUE-174
title: "Cutover milestone: installed package manifest is not an executable runtime source"
status: done
priority: p0
source: "anti-fragmentation planning 2026-05-27"
created: 2026-05-27
assignee: codex-loop
tags:
  - cutover
  - milestone
  - skill-runtime
  - browser-vfs
  - mv3-shell
  - ai-surface
kind: slice
epic: EPIC-cutover-product-completion
parallel_group: mv3-shell
module_id: old-product-replacement-loop
module_stage: mainline
tracking_kind: mainline
depends_on: []
write_scope:
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
completed_at: 2026-05-26T17:46:02.549Z
---

## Goal

Continue the old-product replacement loop from package materialization into package execution. `ISSUE-173` proved that `skills.install` setup plans can write package files into canonical `mem://skills/<skillId>/...` storage and that a manually registered executable skill can read those files after restart. The next replacement-quality proof is: an installed package's manifest and handler file must become the runtime source for a callable executable skill, without requiring test-only or app-local manual `skillDefinitions` registration.

This is intentionally one vertical milestone. It should prove a package can be installed, persisted, discovered after restart, enabled, invoked, executed through the existing runner path, and observed through the shared audit surface.

## Review Finding

- `docs/skill-package-convention.md` already defines `skill.json` and a handler entry point as the package shape.
- `BrowserVFS` already supports package discovery and `ISSUE-173` writes package files into `mem://skills/<skillId>/...`.
- The shared MV3 runtime still treats executable skills as constructor-time `skillDefinitions`; installed package contents are not yet discovered and registered as executable runtime units.
- As a result, the product can materialize package files, but it still cannot prove that a persisted package is itself enough to become an invokable skill after restart.

## Acceptance

- `skills.install` can materialize a package containing `SKILL.md`, `skill.json`, and a runtime handler entry file under `mem://skills/<skillId>/...`.
- After runtime restart / rehydrate, the shared MV3 runtime discovers installed package manifests from BrowserVFS and registers valid enabled packages with `skills.invoke` without requiring an explicit `skillDefinitions` injection for that package.
- `skills.invoke` executes the package handler through the existing runner bridge / JS runner path and returns the handler result.
- The package-backed invocation leaves operator-visible evidence through existing `audit.tail` loop-step entries, including `skills.invoke` and at least one package-loading capability trace.
- Invalid or missing package manifests must not crash runtime boot; malformed packages are skipped or fail invocation with a structured capability error.
- `docs/skill-package-convention.md`, `docs/skill-authoring-guide.md`, `docs/cutover-readiness-criteria.md`, `docs/migration-parity-dashboard.md`, and `docs/legacy-to-vnext-migration-matrix.md` are updated with the exact proof scope and remaining product gaps.
- Focused verification covers the touched MV3/runtime tests. Run `bun run check` unless an unrelated blocker prevents it.

## Not In Scope

- Full visual Skill Studio.
- TypeScript compilation of arbitrary package authoring source.
- Version selection UI or rollback UI.
- Loading every historical plugin format from the old repo.
- Bridge-side MCP export.

## 工作总结

### 实现了什么
- Shared MV3 runtime boot now discovers BrowserVFS skill packages from mem://skills, reads skill.json, registers valid handler.js entries, and invokes them through the existing JS runner path.
- Added restart tests for valid package-backed invocation, audit.tail package-loading evidence, and malformed manifest structured failure.
- Updated skill package, authoring, cutover, parity, migration, batch, and live queue docs for the ISSUE-174 proof scope.

### 实际跑了什么检查
- bun run test -- apps/mv3-shell/test/manifest.spec.ts -t installed package manifest
- bun run test -- apps/mv3-shell/test/manifest.spec.ts
- ./node_modules/.bin/biome check apps/mv3-shell/src/runtime-services.ts apps/mv3-shell/test/manifest.spec.ts docs/skill-package-convention.md docs/skill-authoring-guide.md docs/cutover-readiness-criteria.md docs/migration-parity-dashboard.md docs/legacy-to-vnext-migration-matrix.md docs/backlog/2026-05-27-skill-package-manifest-registers-executable-skill.md docs/next-development-slices-2026-05-26-batch-16.md docs/workflow/live-queue.json
- git diff --check
- bun run check

### 残留风险
- 无

## 相关 commits

- `4e14beb8b8b9` feat(mv3): 执行 Skill package manifest
