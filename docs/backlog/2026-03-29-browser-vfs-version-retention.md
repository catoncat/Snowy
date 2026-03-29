---
id: ISSUE-003
title: "BrowserVFS version retention and rollback helpers"
status: in-progress
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

