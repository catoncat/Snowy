---
id: ISSUE-002
title: Executable skill invocation service
status: done
priority: p0
source: v0 follow-up
created: 2026-03-29
assignee: agent
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

## Completion

**Commits:** `16b3cb3` (bootstrap with invocation service), `680314d` (route skills.invoke through capability call chain)

**Changes:**
- `packages/core/src/index.ts`: Added `SkillDefinition`, `SkillInvocationServiceOptions`, `SkillInvocationResult` interfaces, `SkillInvocationService` class (register/get/list/invoke) with depth guard, permission isolation, trace isolation, recursion support
- `packages/skill-sdk/src/index.ts`: Re-exported `SkillInvocationService`, `SkillDefinition`, `SkillInvocationResult`
- `packages/core/test/core.spec.ts`: 7 new SkillInvocationService tests covering basic invoke, depth guard, permission check, unknown skill, trace isolation, child invoke, error propagation

