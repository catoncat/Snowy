---
id: ISSUE-009
title: "Skill SDK typed facade"
status: done
priority: p0
source: "v0 follow-up"
created: 2026-03-29
assignee: agent
tags:
  - skill-sdk
  - authoring
kind: slice
epic: EPIC-skill-sdk
parallel_group: sdk-docs
depends_on: []
write_scope:
  - packages/skill-sdk/src/index.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
acceptance_ref: docs/next-development-slices-2026-03-29.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T09:04:15.814Z
---

## Goal

让 skill 作者看到稳定、可提示、可类型推导的 facade。

## Acceptance

- `defineSkill()` 不再只是 identity helper
- typed capability facade 有最小测试

## 工作总结

### 2026-03-29 17:14 CST

- 将 `defineSkill()` 从纯声明投影改为默认包装 typed context
- skill handler 现在可直接使用 `ctx.capabilities.memfs.read()` 与 `ctx.capabilities.site.fetchWithSession()`
- 补了 typecheck 驱动的 SDK 测试，覆盖默认 typed facade 和 camelCase alias 的实际调用
- `bun run check` 已通过

## 相关 commits

- `87f82bb` `feat(skill-sdk): wrap defineSkill with typed ctx`
