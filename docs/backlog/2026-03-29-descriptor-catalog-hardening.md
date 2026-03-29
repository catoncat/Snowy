---
id: ISSUE-001
title: "Descriptor catalog hardening"
status: done
priority: p0
source: "v0 follow-up"
created: 2026-03-29
assignee: agent
tags:
  - contracts
  - core
  - capability-api
kind: slice
epic: EPIC-runtime-core
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
acceptance_ref: docs/next-development-slices-2026-03-29.md
check_cmd: "bun run check"
---

## Goal

把 v0 的 descriptor/catalog 从单文件原型推进到更稳的公共契约。

## Acceptance

- builtin catalog 不再只是零散常量
- namespace coverage 有明确测试
- projection / descriptor 校验继续保持单一真相源

## Sub Issues

- `ISSUE-029` `Review: action capability model still conflates full AI surface`

## 工作总结

### 2026-03-29 补记

- 当前 contracts 层已经提供 `CapabilityDescriptor` canonical model、tool projection 和 lifecycle 基线
- core 侧 public capability registry / runtime ctx 以这套 contracts 基线为前提继续展开
- 该 slice 在当前历史里没有独立的 post-claim 提交；按 write scope 追溯，落地基线来自仓库 bootstrap

## 相关 commits

- `16b3cb3` `feat: bootstrap bbl-next runtime scaffold`
