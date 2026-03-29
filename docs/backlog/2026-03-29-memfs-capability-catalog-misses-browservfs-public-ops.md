---
id: ISSUE-023
title: "Review: memfs capability catalog misses BrowserVFS public ops"
status: in-progress
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
