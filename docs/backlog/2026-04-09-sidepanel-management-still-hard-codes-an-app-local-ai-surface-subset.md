---
id: ISSUE-117
title: "Review: sidepanel management still hard-codes an app-local AI surface subset"
status: done
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: opus
tags:
  - review
  - ai-surface
  - sidepanel
  - control-plane
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-ai-surface
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - apps/mv3-shell/src/sidepanel-management-contract.ts
  - apps/mv3-shell/src/sidepanel/management.ts
  - apps/mv3-shell/test
acceptance_ref: docs/ai-surface-index.md
check_cmd: "bun run check"
---
## Goal

Review how sidepanel management should derive its allowed resources/actions from the shared AI surface without letting MV3-local constants become the de facto truth.

## Review Finding

- `contracts/core` now expose shared resource ids and public capability namespaces, but sidepanel management still keeps a local hard-coded subset of resources and actions.
- The current subset excludes audit/intervention resource consumers and does not project from the shared AI-surface registry, so control-plane consumers can drift from canonical surface changes.
- After config persistence and sidepanel management UI landed, the next drift risk is app-local consumer contracts becoming the de facto truth.

## Acceptance

- Decide the minimal rule for how sidepanel management derives its allowed resources/actions from shared AI-surface truth.
- If projection or registry work is needed, create follow-up slices with tests; if not, document why the current subset is intentionally fixed.
- Keep canonical ownership in `contracts/core` rather than MV3-local constants.

## 工作总结

决定：保持显式声明的管理子集，但通过编译时类型约束 + 测试时 drift 检测确保与共享 AI surface truth 同步。

规则：
- 管理资源 = bootstrap 资源（contracts 注册表中 `bootstrapKey !== undefined` 的条目）
- 管理 action = 显式策管子集（不自动派生，因为管理 UI 不应暴露所有 capability）

具体改动：
- `sidepanel-management-contract.ts`：资源 ID 数组增加 `satisfies readonly AiSurfaceResourceId[]`，编译时验证每个条目是合法的 AI surface 资源 ID
- `sidepanel-management.spec.ts`：新增 2 个 drift-detection 测试——资源 ID 必须匹配 contracts 的 bootstrap 子集，action kind 必须存在于 `BUILTIN_CAPABILITIES`
- 523 测试全部通过，biome lint 无问题

## 相关 commits

- `60c4bb8` feat(ai-surface): 约束 sidepanel management 子集到共享 AI surface truth
