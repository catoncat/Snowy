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

