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

## 工作总结

### 2026-03-29 补记

- BrowserVFS 已新增 `PACKAGE_MARKER`、`discoverPackages()` 和 `isPackageRoot()`，可在 skill root 与自定义 root 下做无 shell discovery
- 测试已覆盖有无 `SKILL.md` 标记、workspace 自定义 root、空目录和 package root 判断
- 该 slice 和 `ISSUE-008` 一起落在同一批代码提交里

## 相关 commits

- `94131aa` `feat(browser-vfs): package discovery helpers (ISSUE-004)`
- `de478c8` `refactor: extract runner-host-core shared module; mark ISSUE-004, ISSUE-008 done`
