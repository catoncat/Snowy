---
id: ISSUE-143
title: "Observability export surface: timeline, structured summary, and rawEventTail"
status: done
priority: p1
source: review
created: 2026-04-15
assignee: codex
tags:
  - review
  - observability
  - export
  - timeline
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - packages/site-runtime/src/index.ts
  - packages/core/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
merges:
  - ISSUE-144
completed_at: 2026-04-15T16:19:37.580Z
---

## Goal

补全 observability export surface：统一 timeline event schema、structured run summary export、以及 rawEventTail resource type。

## Review Finding

- 恢复报告要求的 timeline / summary / rawEventTail 级别能力仍未定义，ISSUE-133 将其作为 intentional deferral 记录但未推进。
- site-runtime 和 skill-runtime 尚未产出结构化 timeline event，无法聚合成统一 export。
- run-cycle 的结构化 summary 缺少 accumulator 和 export schema。

## Acceptance

- Contracts define a timeline event schema that site-runtime and skill-runtime can emit
- Core provides a builder that aggregates timeline events into a unified export surface
- Contracts define a structured run summary export schema and rawEventTail resource type
- Core provides a builder that accumulates run-cycle data into exportable summary format
- Test coverage for event aggregation, summary building, and resource read path

## 工作总结

### 实现了什么
- 定义 timeline/summary/rawEventTail observability export contract 与 resource schema
- 在 core/site-runtime 接入事件聚合 builder、export read path 与结构化事件输出

### 实际跑了什么检查
- bun run check
- bun test packages/core/test/core.spec.ts

### 残留风险
- 无

## 相关 commits

- `2d1a2ecaed7f` feat(observability): 补齐导出观测面事件与汇总
