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
