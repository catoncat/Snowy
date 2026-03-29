---
id: ISSUE-002
title: Executable skill invocation service
status: open
priority: p0
source: v0 follow-up
created: 2026-03-29
assignee: unassigned
tags: [core, skills]
kind: slice
epic: EPIC-runtime-core
parallel_group: contracts-core
depends_on: [ISSUE-001]
write_scope:
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - packages/skill-sdk/src/index.ts
acceptance_ref: docs/next-development-slices-2026-03-29.md
check_cmd: bun run check
---

## Goal

在 core 中补出可执行 skill 的统一 invoke service，而不是只有裸 `ctx.skills.invoke()`。

## Acceptance

- skill invocation 有稳定 service 接口
- depth / trace / permission 语义被测住

