---
id: ISSUE-178
title: "Completion milestone: Skill Studio version surface is missing from shared catalog"
status: done
priority: p0
source: "completion planning 2026-05-27"
created: 2026-05-27
assignee: codex-loop
tags:
  - review
  - completion
  - studio
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
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/sidepanel/management.ts
  - apps/mv3-shell/src/sidepanel/App.vue
  - apps/mv3-shell/test/manifest.spec.ts
  - apps/mv3-shell/test/sidepanel-management.spec.ts
  - docs/module-tracking-ledger.json
  - docs/migration-parity-dashboard.md
  - docs/legacy-to-vnext-migration-matrix.md
  - docs/ai-surface-index.md
acceptance_ref: docs/skill-lifecycle-version-engine-boundary.md
check_cmd: "bun run check"
completed_at: 2026-05-26T18:46:21.208Z
---

## Goal

Promote Skill Studio/versioning from deferred breadth into the next completion milestone by exposing a shared version/rollback readiness surface through skills.summary and the sidepanel catalog.

## Review Finding

- After ISSUE-177
- old-product replacement proof is green but migration dashboard still marks Skill Studio/lifecycle product surface red.
- Contracts and BrowserVFS already define lifecycle/version and rollback primitives
- but shared skills.summary and the sidepanel catalog do not expose that engine-level product surface.

## Acceptance

- module ledger records a new skill-studio-completion-loop as the active completion lane with rationale, without rewriting historical skill-runtime-sdk-studio backlog metadata
- skills.summary items expose a shared version surface for package-backed skills
- including active version identity
- snapshot root
- rollback policy
- and rollback target when known
- sidepanel Skills catalog derives and renders version/rollback readiness only from shared skills.summary items; no app-local package truth
- migration matrix/dashboard/docs distinguish this milestone from full authoring studio and old plugin ecosystem migration
- focused contracts/core/MV3 sidepanel/runtime tests pass
- plus git diff --check

## 工作总结

### 实现了什么
- 新增 shared skills.summary versionSurface，package-backed skill 会暴露 active manifest version、snapshot root、rollback policy 与 rollback target；sidepanel Skills catalog 从同一 shared summary 渲染 versions 信息；迁移矩阵/dashboard/AI Surface 文档同步 Skill Studio completion lane 状态

### 实际跑了什么检查
- bun run test -- packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts apps/mv3-shell/test/sidepanel-management.spec.ts apps/mv3-shell/test/manifest.spec.ts
- bun run typecheck
- ./node_modules/.bin/biome check touched files
- git diff --check
- bun run check

### 残留风险
- 无

## 相关 commits

- `e181503fb966` feat(studio): 暴露 Skill 版本面
