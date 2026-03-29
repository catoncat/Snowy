---
id: ISSUE-016
title: "Review: BrowserVFS IndexedDB migration strategy is still implicit"
status: open
priority: p1
source: "next-batch review 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - browser-vfs
  - idb
  - migration
kind: slice
epic: EPIC-browser-vfs
parallel_group: browser-vfs
depends_on: []
write_scope:
  - packages/browser-vfs/src/index.ts
  - packages/browser-vfs/test/browser-vfs.spec.ts
acceptance_ref: project_plan.md
check_cmd: "bun run check"
---

## Goal

把 BrowserVFS 的 IndexedDB schema 演进从隐式实现收口成明确 contract。

## Review Finding

- IndexedDbVfsStore 仍固定打开 schema version 1，upgrade 路径只有单次建表，没有迁移 contract。
- 当前测试覆盖 write-through 和 snapshot/rollback，但不覆盖跨版本 DB 升级或旧数据保留。
- docs/v0-slice.md 仍把 real IndexedDB migration/versioning strategy 标为 deferred。

## Acceptance

- IndexedDB schema version 和 upgrade/migration 边界在代码里显式表达。
- 至少一条测试覆盖旧 schema 到新 schema 的升级路径。
- 迁移后 snapshot/version metadata 仍保持 canonical URI 与 rollback 语义。
