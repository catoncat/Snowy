---
id: ISSUE-026
title: "Review: MV3 runtime wiring is still harness-bound"
status: open
priority: p1
source: "next-batch review 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - mv3-shell
  - site-runtime
  - integration
kind: slice
epic: EPIC-site-runtime
parallel_group: mv3-shell
depends_on: []
write_scope:
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/src/offscreen.js
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: project_plan.md
check_cmd: "bun run check"
---

## Goal

把 MV3 runtime wiring is still harness-bound 收口到 locked decisions 和测试口径。

## Review Finding

- page-hook bridge 和 offscreen runner bridge 已存在，但当前证明链路主要停留在 harness 级测试，还没有单一 runtime-owned invoke path 把 active-tab action 连接到真实 MV3 bridge。
- v0 deferred 仍把 real Chrome injection / runner RPC / offscreen lifecycle integration 标为未完成。

## Acceptance

- 至少一条公开 runtime invoke path 直接接到 MV3 background/offscreen bridge，而不是测试专用 glue。
- offscreen/page-hook lifecycle 与 health contract 有集成测试锁定。
- 集成路径继续遵守 active-tab-only injection 边界。
