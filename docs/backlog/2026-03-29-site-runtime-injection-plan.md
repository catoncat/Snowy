---
id: ISSUE-007
title: "Site runtime injection plan and installer split"
status: done
priority: p0
source: "v0 follow-up"
created: 2026-03-29
assignee: agent
tags:
  - site-runtime
  - injection
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
acceptance_ref: docs/next-development-slices-2026-03-29.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T08:54:59.844Z
---

## Goal

把 content/main 注入计划和执行器边界拆清楚。

## Acceptance

- injection plan 有结构化模型
- installer / verifier / runner 边界被测试锁住

## 工作总结

### 2026-03-29 补记

- `buildInjectionPlan()` 已把 `injectionSteps` 与 legacy `worlds` fallback 统一成结构化 plan
- site runtime 已拆出 installer / verifier / runner 边界，并把 trace 固定为 plan/install/invoke/verify phases
- 测试已锁住 structured installer input、verifier failure ordering 和无 installer/verifier 时的最小执行路径

## 相关 commits

- `8302863` `feat(site-runtime): injection plan model and installer split (ISSUE-007)`
- `319c1cd` `chore: mark ISSUE-007 as done`
