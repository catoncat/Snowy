---
id: ISSUE-026
title: "Review: MV3 runtime wiring is still harness-bound"
status: done
priority: p1
source: "next-batch review 2026-03-29"
created: 2026-03-29
assignee: codex
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
claimed_at: 2026-03-29T11:04:36.320Z
---

## Goal

把 MV3 runtime wiring 从“主要依赖 harness 证明”收口成与 locked decisions 一致、可被集成测试锁住的真实运行链路。

## Review Finding

- page-hook bridge 和 offscreen runner bridge 已存在，但当前证明链路主要停留在 harness 级测试，还没有单一 runtime-owned invoke path 把 active-tab action 连接到真实 MV3 bridge。
- v0 deferred 仍把 real Chrome injection / runner RPC / offscreen lifecycle integration 标为未完成。

## Acceptance

- 至少一条公开 runtime invoke path 直接接到 MV3 background/offscreen bridge，而不是测试专用 glue。
- offscreen/page-hook lifecycle 与 health contract 有集成测试锁定。
- 集成路径继续遵守 active-tab-only injection 边界。

## 工作总结

- 在 `apps/mv3-shell/src/background.js` 增加公开 `site.runtime.invoke` 路由，把 background listener、offscreen runner host 和 page-hook bridge 串成单一路径。
- 为该路径补了 MV3 集成测试，锁定了完整 invoke chain、`runtime.diagnostics` 健康快照，以及 inactive tab 下的拒绝行为。
- 已运行 `bun run check`。
- 残留风险：当前公开 path 仍是 MV3 bridge 级 contract，还没有把 site runtime client facade 收口成更高层 public API。

## 相关 commits

- `94b064b` `mv3-shell: add public site runtime invoke path`
