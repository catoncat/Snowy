---
id: ISSUE-014
title: "Review: BrowserVFS canonical skill URI drift"
status: done
priority: p1
source: "codex review 2026-03-29"
created: 2026-03-29
assignee: agent
tags:
  - review
  - browser-vfs
  - uri
  - canonical-model
module_id: browser-vfs
module_stage: deferred
tracking_kind: gap
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
claimed_at: 2026-03-29T09:49:09.075Z
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

## 工作总结

- 在 `packages/browser-vfs/src/index.ts` 把 public skill package URI 的回吐统一收口到 canonical `mem://skills/...` 口径，不再让 `stat()`、`list()`、`discoverPackages()`、`listSnapshots()` 与 snapshot `sourceUri` 暴露 `mem://library/skills/...`。
- 新增 URI canonicalization helper，并在 snapshot 读取路径上对已存 metadata 做返回时归一化，避免对外接口把底层 library scope 当主输出。
- 在 `packages/browser-vfs/test/browser-vfs.spec.ts` 更新 discovery / snapshot 断言，并补了 stat、list、listSnapshots 的 canonical round-trip 覆盖，锁定 `mem://skills` 作为公开技能包 URI。
- 实际验证执行了 `bun run check`，结果通过：`tsc --noEmit` 通过，Vitest `10/10` 文件、`97/97` 测试通过；当前 write scope 内无残留 blocker。

## 相关 commits

- `c8344f4` `fix(browser-vfs): canonicalize public skill uris`
