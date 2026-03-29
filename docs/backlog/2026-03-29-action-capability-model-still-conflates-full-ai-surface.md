---
id: ISSUE-029
title: "Review: action capability model still conflates full AI surface"
status: open
priority: p1
source: "AI-native surface follow-up 2026-03-29"
created: 2026-03-29
assignee: unassigned
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

