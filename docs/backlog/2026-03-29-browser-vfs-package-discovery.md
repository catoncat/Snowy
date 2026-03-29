---
id: ISSUE-004
title: BrowserVFS package discovery helpers
status: done
priority: p1
source: v0 follow-up
created: 2026-03-29
assignee: agent
tags: [browser-vfs, skills]
kind: slice
epic: EPIC-browser-vfs
parallel_group: browser-vfs
depends_on: [ISSUE-003]
write_scope:
  - packages/browser-vfs/src/index.ts
  - packages/browser-vfs/test/browser-vfs.spec.ts
acceptance_ref: docs/next-development-slices-2026-03-29.md
check_cmd: bun run check
---

## Goal

提供 skill package 发现和目录扫描助手，替代任何 shell 式查找。

## Acceptance

- 可以枚举 `mem://library/skills/*`
- package root 判断逻辑明确

