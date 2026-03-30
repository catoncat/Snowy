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
module_id: browser-vfs
module_stage: deferred
tracking_kind: follow-up
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

## 工作总结

### 2026-03-29 补记

- BrowserVFS 已补齐 snapshot metadata、retention、rollback target 选择和 replace-style `rehydrate()`
- 测试已覆盖 trusted snapshot、legacy fallback、retention trimming 和回滚重建语义
- 该 slice 的代码落在共享 batch commit 中，后续 `ISSUE-004` 在同一 lane 上继续扩展 package discovery

## 相关 commits

- `8302863` `feat(site-runtime): injection plan model and installer split (ISSUE-007)` 共享 batch，含 BrowserVFS snapshot/rollback 实现
- `f6c14dd` `fix(core): safe cast in typedCapabilities + mark ISSUE-003 done`
