---
id: ISSUE-023
title: "Review: memfs capability catalog misses BrowserVFS public ops"
status: done
priority: p0
source: "next batch review 2026-03-29"
created: 2026-03-29
assignee: agent
tags:
  - review
  - core
  - browser-vfs
kind: slice
epic: EPIC-contracts-core
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - packages/skill-sdk/src/index.ts
  - packages/skill-sdk/test/skill-sdk.spec.ts
acceptance_ref: project_plan.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T10:43:04.947Z
---

## Goal

把 memfs.* 对 BrowserVFS 公共能力面的 descriptor drift 收口到代码和测试口径。

## Review Finding

- BrowserVFS 已暴露 `edit/stat/stage` 等公共操作，
- 但 builtin `memfs.*` catalog 仍停在 `read/write/list/mkdir/rm/mv/copy/snapshot/rehydrate`。
- Skills cannot reach the full public VFS API through canonical capability ids or the typed facade.

## Acceptance

- builtin catalog adds descriptor coverage for `memfs.edit`、`memfs.stat`、`memfs.stage`。
- typed capability facade and permission filtering expose the same memfs methods.
- tests lock memfs capability surface parity against the BrowserVfs public API.

## 工作总结

### 2026-03-29 补记

- 已在 builtin `memfs.*` catalog 中补齐 `memfs.edit`、`memfs.stat`、`memfs.stage`
- 已把 typed memfs capability map 同步到 `edit/stat/stage`，使 runtime facade 与 SDK authoring facade 对齐
- `packages/core/test/core.spec.ts` 现已锁住 memfs descriptor 覆盖、权限收窄和与 `BrowserVfs` public API 的 surface parity
- `packages/skill-sdk/test/skill-sdk.spec.ts` 已覆盖 skill handler 通过 typed facade 直接调用 `edit/stat/stage`
- 已运行 `bun x vitest run packages/core/test/core.spec.ts packages/skill-sdk/test/skill-sdk.spec.ts` 与 `bun run check`

## 相关 commits

- `bcf7115` `feat(core): align memfs capabilities with BrowserVFS`
