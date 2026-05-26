---
id: ISSUE-179
title: "Completion milestone: Skill rollback is read-only and cannot be triggered from shared Studio surface"
status: done
priority: p0
source: "completion planning 2026-05-27"
created: 2026-05-26
assignee: codex-loop
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
completed_at: 2026-05-26T19:10:26.661Z
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

## 工作总结

### 实现了什么
- 将 skills.rollback 纳入 contracts/core/shared MV3 management surface，并让 runtime 通过 BrowserVFS rehydrate 还原 latest trusted 或显式 versionUri
- sidepanel Skills catalog 仅根据 shared versionSurface.rollbackTarget 启用 rollback，并通过 shared management action 发送 versionUri
- 同步 AI surface、version boundary、migration dashboard/matrix 与 module ledger，把本轮口径固定为旧产品替代闭环推进而非小票碎片化

### 实际跑了什么检查
- bunx vitest run apps/mv3-shell/test/manifest.spec.ts -t 'rolls back an installed package' --reporter=verbose
- bun run test -- packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts apps/mv3-shell/test/sidepanel-management.spec.ts apps/mv3-shell/test/manifest.spec.ts
- bun run typecheck
- ./node_modules/.bin/biome check <touched files>
- git diff --check
- bun run check

### 残留风险
- 无

## 相关 commits

- `a9a7867c9318` feat(studio): 支持 Skill 回滚
