---
id: ISSUE-056
title: "Review: skill lifecycle control-plane actions are not exposed beyond invoke/list"
status: open
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
