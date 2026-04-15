---
id: ISSUE-143
title: "Observability export surface: timeline, structured summary, and rawEventTail"
status: open
priority: p1
source: review
created: 2026-04-15
assignee: unassigned
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
merges: [ISSUE-144]
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
