---
id: ISSUE-082
title: "Follow-up: resource metadata registry and audience projection are still lookup-only"
status: done
priority: p1
source: "ISSUE-072 follow-up planning 2026-03-31"
created: 2026-03-31
assignee: codex-019d6d61
tags:
  - review
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-contracts-core
parallel_group: contracts-core
depends_on:
  - ISSUE-072
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - docs/
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

把 Follow-up: resource metadata registry and audience projection are still lookup-only 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- Current repo now has a unified lookup surface
- but resource metadata still lives in scattered constants/docs rather than a first-class registry.

## Acceptance

- Define a first-class resource metadata registry for current AI surface resource ids
- including audience/projection/read-owner metadata.
- Keep readAiSurfaceResource()/MV3 resource.read as the lookup path
- but stop relying on ad-hoc switch ownership for registry metadata.
- Tests and docs lock registry coverage for all current resource ids.

## 工作总结

### 实现了什么

1. `packages/contracts/src/index.ts`
   - 新增 `AiSurfaceResourceMetadata`
   - 新增 `AI_SURFACE_RESOURCE_PROJECTIONS` / `AI_SURFACE_RESOURCE_READ_OWNERS`
   - 新增 `AI_SURFACE_RESOURCE_METADATA_REGISTRY`
   - 新增 `getAiSurfaceResourceMetadata()` / `listAiSurfaceResourcesForAudience()`
2. `packages/core/src/index.ts`
   - `readAiSurfaceResource()` 继续保持统一 lookup path
   - 但 resource ownership 不再靠 ad-hoc `switch` 注释语义维护，改为先经过 contracts registry metadata
3. 测试补齐
   - `packages/contracts/test/contracts.spec.ts` 锁住 registry coverage、audience projection、全量 typed resource documents
   - `packages/core/test/core.spec.ts` 锁住所有已注册 resource id 都能走统一 read path 读出 document
4. 文档更新
   - `docs/ai-surface-index.md` 改为以 registry + audience projection 为当前口径

### 实际跑了什么检查

- `bun run test packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts`
- `./node_modules/.bin/biome check --write packages/contracts/src/index.ts packages/contracts/test/contracts.spec.ts packages/core/src/index.ts packages/core/test/core.spec.ts`

### 残留风险

- 当前工作树还有 ISSUE-082 外的未提交改动，`bun run check` 仍可能被别的 in-flight 文件拦住；本 issue 本次以定向测试 + 定向 biome 校验完成收口

## 相关 commits

- `3b8faec` feat(ai-surface): add resource metadata registry
