---
id: ISSUE-056
title: "Review: skill lifecycle control-plane actions are not exposed beyond invoke/list"
status: done
priority: p1
source: "ISSUE-054 ai-surface control-plane follow-up 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - core
  - ai-surface
  - control-plane
  - skills
  - plugin-mainline-correction
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: follow-up
kind: slice
epic: EPIC-contracts-core
parallel_group: contracts-core
depends_on:
  - ISSUE-055
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - packages/skill-sdk/src/index.ts
  - docs/ai-surface-index.md
  - docs/backlog/README.md
  - docs/backlog
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

把 skills.* 的 product control-plane gap 明确成独立 live slice，区分 lifecycle management 与 skills.invoke/list。

## Review Finding

- 设计文档已把 skills.install、skills.enable、skills.disable、skills.uninstall 列为产品控制面动作，但 builtin catalog 目前只有 skills.invoke 和 skills.list。
- 当前 contracts 已有 lifecycle state machine 与 trusted flag 规则，但还没有 northbound action surface 承接这些状态变更。
- ISSUE-028 已补齐 lifecycle/version engine contract，因此下一步是 product-facing skills control plane，而不是继续停在 model-only inventory。

## Acceptance

- 明确 skills.install、skills.enable、skills.disable、skills.uninstall 是一次落地还是 staged subset，并记录最小集合。
- 新动作与现有 lifecycle contract、trusted 语义和 skills summary 保持一致。
- 若新增 public action，补齐 contracts/core/docs/test 的边界锁定。

## Impact Note

- 影响的 northbound surface：`skills.install`、`skills.enable`、`skills.disable` 现已进入 builtin action surface；`skills.uninstall` 仍保持 deferred。
- 影响的消费者：聊天 Agent、skill runtime、未来管理 UI 都会通过同一套 `skills.*` control-plane action 读到这组动作；external export 只间接受 descriptor 变化影响。
- 控制面文档：已更新 `docs/ai-surface-index.md`；已检查 `docs/agent-bootstrap-context-pack.md`、`docs/module-tracking-ledger.json`、`docs/legacy-to-vnext-migration-matrix.md`、`docs/migration-parity-dashboard.md`、`docs/cutover-readiness-criteria.md`，当前无需同步。

## 工作总结

- 在 `packages/contracts` 新增 staged subset 常量 `SKILL_CONTROL_PLANE_ACTIONS`，明确本轮只落地 `skills.install/enable/disable`，并显式排除 `skills.uninstall`。
- 在 `packages/core` 补齐三个 builtin descriptor、`manageSkill` runtime hook、`ctx.skills.install/enable/disable` helper 和 typed capability facade 暴露。
- 在 `packages/contracts/test` 与 `packages/core/test` 锁住 staged subset、builtin catalog、runtime dispatch、权限门和 typed facade 行为。
- 更新 `docs/ai-surface-index.md`，把 skills control-plane staged subset 标成已落地；新增 follow-up `ISSUE-069` 收口 `skills.uninstall` 边界。
- 已运行 `bun test packages/contracts/test/contracts.spec.ts`、`bun test packages/core/test/core.spec.ts`、`bunx biome check packages/contracts/src/index.ts packages/contracts/test/contracts.spec.ts packages/core/src/index.ts packages/core/test/core.spec.ts`。
- 已运行 `bun run check`；失败原因是仓内既有、与本 slice 无关的 repo-wide Biome 格式债，包含 `biome.json`、`package.json`、`tsconfig.json`、`.agents/skills/**` 等文件。
- 残留风险：当前只收口了 northbound control-plane surface；实际 install/enable/disable 状态变更仍依赖调用方注入 `manageSkill` 实现。

## Sub Issues

- `ISSUE-069` `Review: skill lifecycle uninstall control-plane action remains deferred`

## 相关 commits

- `c9682ff` `contracts/core: add staged skill lifecycle actions`
