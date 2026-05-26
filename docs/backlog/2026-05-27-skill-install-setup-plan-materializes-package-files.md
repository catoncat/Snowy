---
id: ISSUE-173
title: "Cutover milestone: skill install setup plan does not materialize package files"
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
  - docs/skill-authoring-guide.md
  - docs/cutover-readiness-criteria.md
  - docs/migration-parity-dashboard.md
  - docs/legacy-to-vnext-migration-matrix.md
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
completed_at: 2026-05-26T17:25:59.622Z
---

## Goal

Continue the old-product replacement loop at the package-install boundary. `ISSUE-172` proved that an installed and enabled executable skill can invoke a real shared capability through the MV3 runtime, but install-time setup payloads still stop at metadata forwarding. The next replacement-quality proof is: a skill package setup plan supplied through `skills.install` must materialize package files into the canonical `mem://skills/<skillId>/...` library, survive runtime restart, then be usable by an enabled skill through the shared runtime.

This is intentionally one vertical milestone. Do not split it into separate setup-plan, BrowserVFS, summary, or audit follow-ups unless a sub-gap blocks the whole proof and cannot be completed inside this write scope.

## Review Finding

- `packages/skill-sdk` can build install-time setup plans with canonical `mem://skills/<skillId>/...` writes.
- `packages/core` now preserves the original `skills.install` payload for the runtime manager.
- `apps/mv3-shell` still routes `skills.install` as lifecycle-only state: the background bridge drops setup payload fields, and the runtime manager only persists lifecycle status.
- As a result, the product can say a skill is installed, but it cannot yet prove that install-time package files were written to the Skill library and consumed after restart.

## Acceptance

- `skills.install` accepts a setup plan payload on the shared MV3 runtime path and materializes valid writes under `mem://skills/<skillId>/...` through BrowserVFS.
- Invalid setup plans are rejected before lifecycle state is updated, including mismatched `skillId`, unsupported phase, malformed writes, or writes outside the target skill package root.
- A test-backed vertical flow covers install with setup plan -> package file write -> restart/rehydrate -> enable -> `skills.invoke` -> skill reads the setup-written file via `memfs.read` -> `audit.tail` records install/enable/invoke and child capability evidence.
- The implementation uses existing shared `skills.*`, `memfs.*`, `skills.summary`, and `audit.tail` surfaces; it must not create a new app-local bootstrap truth.
- `docs/skill-authoring-guide.md`, `docs/cutover-readiness-criteria.md`, `docs/migration-parity-dashboard.md`, and `docs/legacy-to-vnext-migration-matrix.md` are updated with the exact proof scope and remaining product gaps.
- Focused verification covers the touched MV3/runtime tests. Run `bun run check` unless an unrelated blocker prevents it.

## Not In Scope

- Full visual Skill Studio.
- Version selection UI or rollback UI.
- Runtime execution of setup hooks during normal skill invocation.
- Physical deletion of archived skill package contents.

## 工作总结

### 实现了什么
- shared MV3 runtime forwards skills.install setupPlan payloads and materializes valid writes into BrowserVFS before lifecycle state changes
- registered BrowserVFS-backed memfs provider so restarted enabled skills can read setup-written package files through memfs.read
- updated Skill authoring, cutover readiness, parity dashboard, and migration matrix docs with the exact ISSUE-173 proof scope and remaining product gaps

### 实际跑了什么检查
- RED: bun run test -- apps/mv3-shell/test/manifest.spec.ts --testNamePattern="install setup plan" failed before implementation
- GREEN: bun run test -- apps/mv3-shell/test/manifest.spec.ts --testNamePattern="install setup plan"
- GREEN: bun run test -- apps/mv3-shell/test/manifest.spec.ts
- GREEN: git diff --check
- GREEN: bun run check

### 残留风险
- 无

## 相关 commits

- `04c9986862b5` feat(mv3): 落地 Skill 安装包写入闭环
