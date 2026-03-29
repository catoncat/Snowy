---
id: ISSUE-012
title: "Review: site runtime active-tab boundary regression"
status: done
priority: p0
source: "codex review 2026-03-29"
created: 2026-03-29
assignee: agent
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
claimed_at: 2026-03-29T09:41:42.717Z
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

## 工作总结

- 在 `packages/site-runtime/src/index.ts` 删除 `SiteSkillDefinition.requiresActiveTab` 逃生门，并把 invoke 前置校验收口为“必须命中当前 active tab match”，不再允许 skill 定义层关闭该约束。
- 在 `packages/site-runtime/test/site-runtime.spec.ts` 新增两类负向覆盖：不匹配 tab 直接拒绝且不触发安装，以及仅做 active-tab 匹配时不会提前安装 hook，继续把“只有显式 action invoke 才安装”锁死。
- 在 `apps/mv3-shell/manifest.json` 移除默认 `host_permissions: ["<all_urls>"]`，把 MV3 shell 拉回 locked decision 的 active-tab-only 口径。
- 在 `apps/mv3-shell/test/manifest.spec.ts` 补上 manifest 断言，明确默认 host permissions 为空，避免 `<all_urls>` 回流。
- 实际验证执行了 `bun run check`，结果通过：`tsc --noEmit` 通过，Vitest `10/10` 文件、`95/95` 测试通过；当前 write scope 内无残留 blocker。

## 相关 commits

- `bdff4db` `Reinstate active-tab site runtime boundary`

## Sub Issues

- `ISSUE-015` `Review: site runtime manifest exposure follow-up`
  - 原因：`ISSUE-012` 已标记完成后，仍发现 manifest 默认暴露 `page-hook.js` 且缺少 inactive-tab 的 runtime 回归测试。
  - 结果：follow-up 已在 `b148266` 中完成并关闭。
