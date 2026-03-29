---
id: ISSUE-003
title: "BrowserVFS version retention and rollback helpers"
status: done
priority: p0
source: "v0 follow-up"
created: 2026-03-29
assignee: agent
tags:
  - browser-vfs
  - rollback
kind: slice
epic: EPIC-browser-vfs
parallel_group: browser-vfs
depends_on: []
write_scope:
  - packages/browser-vfs/src/index.ts
  - packages/browser-vfs/test/browser-vfs.spec.ts
acceptance_ref: docs/next-development-slices-2026-03-29.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T08:45:04.360Z
---

## Goal

补齐版本保留数量、rollback 目标选择、snapshot metadata。

## Acceptance

- 支持最近版本选择
- 支持 trusted snapshot 语义占位
- 有对应测试

## Completion

**Commits:** `16b3cb3` (bootstrap with version retention), `f6c14dd` (typecheck fix + mark done)

**Changes:**
- `packages/browser-vfs/src/index.ts`: `VfsSnapshotMetadata` (versionId/createdAt/trusted/sourceUri), `snapshot()` with retention + trusted params, `listSnapshots()` sorted desc, `selectRollbackTarget()` with trusted-first + untrusted fallback, `rehydrate()` preserving version history, `normalizeSnapshotRetention()` default 3 / min 1, `#trimSnapshots()` auto-prune
- `packages/browser-vfs/test/browser-vfs.spec.ts`: 6 tests covering metadata persistence, retention, rollback selection, configurable retention, legacy fallback, rehydrate with history preservation

