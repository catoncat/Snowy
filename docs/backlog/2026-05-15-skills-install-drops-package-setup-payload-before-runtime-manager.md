---
id: ISSUE-171
title: "Review: skills.install drops package setup payload before runtime manager"
status: done
priority: p1
source: "planning commit after ISSUE-170"
created: 2026-05-15
assignee: codex-cat
tags:
  - review
  - skill-runtime
  - control-plane
module_id: skill-runtime-sdk-studio
module_stage: deferred
tracking_kind: gap
kind: slice
epic: EPIC-skill-runtime-sdk-studio
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - docs/skill-authoring-guide.md
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run test -- packages/core/test/core.spec.ts"
completed_at: 2026-05-15T09:50:12.716Z
---

## Goal

让 skills.install 的 control-plane 调用保留安装请求中的 package/setup metadata，并把完整 payload 交给 runtime manager，为后续 install-only setup hooks 写入 BrowserVFS 打开接线点。

## Review Finding

- packages/skill-sdk already has runSkillSetupHooks() and docs describe install-only setup plans
- but packages/core strips skills.install input down to skillId before calling manageSkill.
- The migration matrix still marks executable skill setup hooks as partial because runtime wiring remains undefined.

## Acceptance

- SkillManagementRequest carries the original skills.install/enable/disable/uninstall input payload to manageSkill after validating skillId.
- Core tests prove extra install metadata reaches manageSkill while existing string skill lifecycle calls still work.
- Skill authoring docs state that current runtime install wiring preserves setup metadata for the runtime manager
- while actual BrowserVFS writes remain a later slice.

## 工作总结

### 实现了什么
- 让 SkillManagementRequest 保留原始 control-plane input，skills.install typed helper 支持可选 metadata/setupPlan，并在 authoring docs 说明 runtime manager 接线边界。

### 实际跑了什么检查
- bun run test -- packages/core/test/core.spec.ts; bun run typecheck; ./node_modules/.bin/biome check packages/core/src/index.ts packages/core/test/core.spec.ts docs/skill-authoring-guide.md

### 残留风险
- 无

## 相关 commits

- `918db62270d2` fix(skill): 保留安装管理请求载荷
