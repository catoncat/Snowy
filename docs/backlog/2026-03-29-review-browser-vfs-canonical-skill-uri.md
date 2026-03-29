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

- `resolveMemUri()` 已把 `mem://skills/...` 当作 library alias，`discoverPackages("mem://skills")` 也能工作；root discovery 已不是 blocker
- 但 `stat()`、`list()`、`discoverPackages()`、snapshot metadata `sourceUri` 等对外结果仍回吐 `mem://library/skills/...`
- 这会把 public skill URI 心智重新拖回底层 scope 视角

## Acceptance

- `mem://skills/<id>/...` 在 stat/list/discoverPackages/snapshot/sourceUri 等对外接口里保持 canonical round-trip
- `mem://skills` 可被枚举，且返回结果继续使用 `mem://skills/...` 口径
- tests 覆盖 public skill URI 不再暴露 `mem://library/skills/...` 作为主输出
