---
id: ISSUE-015
title: "Review: site runtime manifest exposure follow-up"
status: done
priority: p1
source: "follow-up after ISSUE-012 completion drift"
created: 2026-03-29
assignee: agent
tags:
  - review
  - site-runtime
  - mv3-shell
  - permissions
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: follow-up
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/site-runtime/test/site-runtime.spec.ts
  - apps/mv3-shell/manifest.json
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/locked-decisions-2026-03-29.md
check_cmd: "bun run check"
---

## Goal

把 site runtime manifest exposure follow-up 收口到 locked decisions 和测试口径。

## Review Finding

- ISSUE-012 was already marked done
- but manifest still exposed page-hook via web_accessible_resources and runtime coverage lacked the inactive-tab rejection case

## Acceptance

- manifest no longer exposes page-hook via broad web_accessible_resources by default
- inactive tab invoke is rejected before install
- bun run check passes

## 工作总结

- 在 `apps/mv3-shell/manifest.json` 移除 `web_accessible_resources` 对 `src/page-hook.js` 的默认 `<all_urls>` 暴露，把 MV3 shell 收回到 active-tab-only 的默认边界。
- 在 `apps/mv3-shell/test/manifest.spec.ts` 补上断言，明确默认没有 `web_accessible_resources` 暴露，防止全站访问面悄悄回流。
- 在 `packages/site-runtime/test/site-runtime.spec.ts` 新增 inactive-tab 负向回归测试，锁定“即使 URL 命中，只要 tab 不活跃也不能 invoke，更不能触发安装”。
- 实际验证执行了 `bun run check`，结果通过：`tsc --noEmit` 通过，Vitest `10/10` 文件、`96/96` 测试通过；本 follow-up 无残留 blocker。

## 相关 commits

- `b148266` `fix(site-runtime): restore active-tab boundary`
