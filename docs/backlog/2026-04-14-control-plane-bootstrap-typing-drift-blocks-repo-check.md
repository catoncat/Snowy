---
id: ISSUE-129
title: "Review: control-plane bootstrap typing drift blocks repo check"
status: done
priority: p1
source: "auto next after ISSUE-128"
created: 2026-04-14
assignee: codex-019d8ba0
tags:
  - review
  - control-plane
  - typing
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-contracts-core
parallel_group: contracts-core
depends_on: []
write_scope:
  - apps/mv3-shell/test/sidepanel-management.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - packages/contracts/src/index.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
completed_at: 2026-04-14T11:54:57.660Z
---

## Goal

把 control-plane bootstrap typing drift blocks repo check 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- Runtime/config bootstrap and resource metadata types drifted
- leaving tests with stale shapes
- Current repo check is blocked by sidepanel/core/contracts expectations that no longer match the typed control-plane surface

## Acceptance

- Shared control-plane/bootstrap types and metadata usage are aligned across contracts/core/mv3 tests
- Targeted sidepanel/core tests pass without type assertions fighting the canonical contracts

## 工作总结

### 实现了什么
- 为 bootstrap resource metadata 增加 canonical helper，避免直接在 const union registry 上读取 bootstrapKey
- 补齐 sidepanel runtime summary fixture 的 InterventionSummary.recent，并改用 shared helper 读取 bootstrap resources
- 将 core config control plane 持久化夹具显式标注为 ConfigBootstrapSummary，消除 fields 类型漂移

### 实际跑了什么检查
- bun x vitest run apps/mv3-shell/test/sidepanel-management.spec.ts packages/core/test/core.spec.ts
- ./node_modules/.bin/biome check apps/mv3-shell/test/sidepanel-management.spec.ts packages/core/src/index.ts packages/core/test/core.spec.ts packages/contracts/src/index.ts
- ./node_modules/.bin/tsc --noEmit --pretty false 2>&1 | rg 'sidepanel-management\.spec|packages/core/test/core\.spec|bootstrapKey|fields|recent'
- bun run check（未通过，见下方风险）

### 残留风险
- repo 级 bun run check 仍被 write_scope 外问题阻塞（manifest diagnostics、loop telemetry、site-runtime 类型错误等）

## 相关 commits

- `533001c5be5b` fix(control-plane): 对齐bootstrap类型与测试
