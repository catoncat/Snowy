---
id: ISSUE-180
title: "Completion milestone: Skill Studio authoring/update loop is not executable through shared surface"
status: done
priority: p0
source: "anti-fragmentation planning 2026-05-27"
created: 2026-05-26
assignee: codex-loop
claimed_at: 2026-05-26T19:43:18.338Z
tags:
  - review
  - completion
  - studio
  - authoring
  - versioning
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
  - packages/skill-sdk/src/index.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/sidepanel/management.ts
  - apps/mv3-shell/src/sidepanel/App.vue
  - apps/mv3-shell/test/manifest.spec.ts
  - apps/mv3-shell/test/sidepanel-management.spec.ts
  - packages/skill-sdk/test/skill-sdk.spec.ts
  - docs/skill-authoring-guide.md
  - docs/skill-package-convention.md
  - docs/migration-parity-dashboard.md
  - docs/legacy-to-vnext-migration-matrix.md
  - docs/module-tracking-ledger.json
acceptance_ref: docs/skill-package-convention.md
check_cmd: "bun run check"
completed_at: 2026-05-26T19:43:18.338Z
---

## Goal

Turn the existing package convention and setup-plan runtime into a visible product authoring/update loop: create or update package files through the shared Studio surface then persist version summarize invoke rollback and audit it as one chain.

## Review Finding

- ISSUE-172 through ISSUE-179 prove install persist discover manage invoke rollback observe but the remaining Skill Studio completion lane still has no shared authoring or update product path.
- Continuing to split individual fields would hide the real blocker: users still cannot create or update a package through the shared surface and then prove the updated package behaves like an old Plugin replacement.

## Acceptance

- shared surface can create or update a package-backed skill from package convention data without app-local package truth
- update flow writes package files under mem://skills/<skillId> and refreshes the package registry
- previous package state is snapshotted or otherwise preserved so versionSurface and skills.rollback can prove rollback after an update
- updated package can be enabled invoked through skills.invoke and observed through skills.summary and audit.tail
- sidepanel Skills or Studio surface drives the same shared management path instead of a private registry
- docs keep this as a single authoring/update milestone and explicitly leave richer editor polish for Not Now

## 工作总结

### 实现了什么
- shared skills.install now creates/updates package-backed skills from Studio setupPlan, snapshots previous package state, refreshes package registry, exposes rollback target, and proves invoke/summary/audit/rollback

### 实际跑了什么检查
- bun run check

### 残留风险
- 无

## 相关 commits

- `e8fec825b491` feat(studio): 打通 Skill Studio 更新闭环
