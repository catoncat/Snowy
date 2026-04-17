---
id: ISSUE-159
title: "Review: provider routing still lacks a shared control-plane update surface"
status: done
priority: p1
source: "next-batch-planner review 2026-04-17"
created: 2026-04-17
assignee: codex
tags:
  - review
  - ai-surface
  - provider-routing
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
  - docs/ai-surface-index.md
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
completed_at: 2026-04-17T13:37:06.933Z
---

## Goal

在 action projection controls 已收口后，明确 provider/profile routing 的下一条 northbound control-plane slice，避免 provider policy 继续停留在 kernel-local runtime seam。

## Review Finding

- ISSUE-150 已把 provider capability taxonomy 与 non-kernel route resolution 收回到 contracts/kernel，但当前 AI surface 仍没有统一的 provider policy summary/update surface，operator 无法通过 shared control-plane 管理 routing overrides。
- 若不在 ai-surface-control-plane 模块明确这条 northbound 边界，provider-profile-routing 会继续表现成实现已落地、但真正的 product control-plane 入口仍缺位。

## Acceptance

- contracts/core 明确 provider routing 对应的最小 shared action/resource surface，或显式记录当前阶段 deferral 边界与后续更窄 follow-up。
- ai-surface docs 与 tests 能说明 provider policy state 如何被读取或更新，而不是回退到 app-local settings glue。

## 工作总结

### 实现了什么
- 在 contracts/core 明确 provider routing 的最小 shared config surface
- 把 northbound 边界收敛到 config.summary/config.update 的 model.provider/model.model/model.baseUrl
- 把更深的 routing override 显式延后到 ISSUE-163

### 实际跑了什么检查
- bun run test -- packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts
- ./node_modules/.bin/biome check packages/contracts/src/index.ts packages/core/src/index.ts packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts
- git diff --check
- bun run check（失败：packages/core/test/core.spec.ts 666/673/677/679 的既有联合类型错误，与本次变更无关）

### 残留风险
- docs/ai-surface-index.md 当前不在 biome 处理范围内，本次依赖定向测试、schema 锁定与 git diff --check
- 更深的 profile/default/fallback/lane override 仍未通过 shared control-plane 暴露，已显式留给 ISSUE-163

## 相关 commits

- `4486250c23c4` fix(control-plane): 收口 provider 路由共享面
