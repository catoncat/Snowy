---
id: ISSUE-008
title: "Site skill fixture invoke path"
status: done
priority: p1
source: "v0 follow-up"
created: 2026-03-29
assignee: agent
tags:
  - site-runtime
  - fixture
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on:
  - ISSUE-006
  - ISSUE-007
write_scope:
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - apps/mv3-shell/src/page-hook.js
acceptance_ref: docs/next-development-slices-2026-03-29.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T09:07:17.128Z
---

## Goal

补一个真实的 site skill fixture 贯通 invoke path。

## Acceptance

- 从 skill action 到 runner 到 verifier 有集成测试

## Sub Issues

- `ISSUE-013` `Review: phase 4 real injection chain is still mocked`

## 工作总结

### 2026-03-29 补记

- 已补 page-hook fixture invoke path，installer 返回结果会进入 runner `ctx.site` 并传给 verifier
- `apps/mv3-shell/src/page-hook.js` 现在提供自包含 fixture API，测试覆盖 `match -> install -> action -> verifier -> trace`
- 该 slice 的代码和 `ISSUE-004` 一起落在共享 batch commit 中；后续 `de478c8` 只补 shared runner-host-core 抽取和状态回写

## 相关 commits

- `94131aa` `feat(browser-vfs): package discovery helpers (ISSUE-004)` 共享 batch，含 site skill fixture invoke path
- `de478c8` `refactor: extract runner-host-core shared module; mark ISSUE-004, ISSUE-008 done`
