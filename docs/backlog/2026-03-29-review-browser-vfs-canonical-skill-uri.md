---
id: ISSUE-014
title: "Review: BrowserVFS canonical skill URI drift"
status: open
priority: p1
source: "codex review 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - browser-vfs
  - uri
  - canonical-model
kind: slice
epic: EPIC-browser-vfs
parallel_group: browser-vfs
depends_on:
  - ISSUE-004
write_scope:
  - packages/browser-vfs/src/index.ts
  - packages/browser-vfs/test/browser-vfs.spec.ts
acceptance_ref: project_plan.md
check_cmd: "bun run check"
---

## Goal

把 `mem://skills/<id>/...` 重新收口为 BrowserVFS 对外的 canonical skill package URI，不把底层 scope 泄露出去。

## Review Finding

- `mem://skills/...` 目前会在 stat/sourceUri 等接口回吐成 `mem://library/...`
- `list("mem://skills")` 直接报错，skill package 根目录还不是一等入口
- 这会把 public skill URI 心智重新拖回底层 scope 视角

## Acceptance

- `mem://skills/<id>/...` 在 read/stat/list/snapshot/sourceUri 等接口里保持一致
- `mem://skills` 可被枚举，用于 skill package discovery
- tests 覆盖 canonical URI round-trip，不再暴露 `mem://library/skills/...` 作为对外主口径
