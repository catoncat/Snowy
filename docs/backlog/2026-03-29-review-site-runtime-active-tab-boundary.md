---
id: ISSUE-012
title: "Review: site runtime active-tab boundary regression"
status: open
priority: p0
source: "codex review 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - site-runtime
  - mv3-shell
  - permissions
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - apps/mv3-shell/manifest.json
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/locked-decisions-2026-03-29.md
check_cmd: "bun run check"
---

## Goal

把 site runtime 拉回 `active-tab metadata only + explicit invoke` 的锁定口径，去掉当前后门。

## Review Finding

- `requiresActiveTab?: boolean` 允许 skill 绕过 active-tab/match 校验
- manifest 仍声明 `<all_urls>`，和 active-tab-only 心智冲突
- 当前实现开始把 site/runtime 边界做松了

## Acceptance

- site skill invoke 必须始终经过 active-tab match，不允许在定义层关闭该约束
- manifest 权限和测试口径与 locked decisions 对齐，不再默认全站放开
- site-runtime 测试覆盖“不匹配 tab 不能 invoke”与“只有显式 action 才会安装 hook”
