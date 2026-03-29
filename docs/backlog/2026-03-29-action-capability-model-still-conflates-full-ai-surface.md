---
id: ISSUE-029
title: "Review: action capability model still conflates full AI surface"
status: done
priority: p1
source: "AI-native surface follow-up 2026-03-29"
created: 2026-03-29
assignee: codex
tags:
  - review
  - contracts
  - core
  - capability-api
  - ai-surface
kind: slice
epic: EPIC-runtime-core
parallel_group: contracts-core
depends_on:
  - ISSUE-023
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - docs/
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T11:15:06.968Z
---

## Goal

把当前 `CapabilityDescriptor` / builtin catalog 的语义收口到“action canonical model”，不要再让它隐含代表整个产品 AI surface。

## Review Finding

- 新的 AI-native surface 设计已经明确：`capability != tool call != full AI surface`
- 但当前 contracts/core 口径仍容易让后续实现者把 descriptor 误当成整个产品能力面的唯一模型。
- 如果不在 contracts/core 层把这个边界锁清楚，后续很容易重新走向细碎 capability 爆炸。

## Acceptance

- contracts/core 明确区分：
  - action capability
  - runtime/bootstrap resources
  - skill/workflow
- `CapabilityDescriptor` 与 `ToolContract` 的 action-only 语义被测试和文档锁住。
- 该 slice 不引入新的重型 descriptor family，只收口现有 action model 边界。

## 工作总结

- 在 `packages/contracts` 增加轻量 AI surface boundary 常量，明确 `CapabilityDescriptor` / `ToolContract` 只代表 action，并把 bootstrap resource keys 固定为 `runtime/config/skills/hosts`。
- 在 `packages/core` 透出同一套边界常量，并把 `runtime.list_capabilities` / `runtime.get_capability` 的描述改成 action-only 口径，避免继续把 capability catalog 误读成完整 AI surface。
- 在 contracts/core 测试中锁定 action/resource/workflow 分层，并同步更新 AI surface 设计文档、v0 slice、migration matrix、parity dashboard。
- 已运行 `bun run check`。
- 残留风险：当前只完成 action-only boundary 和 bootstrap key 分层，真正 resource registry / bootstrap surface 仍由后续 issue 承接。

## 相关 commits

- `4a64670` `contracts/core: lock action-only AI surface boundary`
