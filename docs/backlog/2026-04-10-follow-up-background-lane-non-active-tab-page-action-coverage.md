---
id: ISSUE-123
title: "Follow-up: background lane lacks non-active-tab page action coverage"
status: done
priority: p1
source: "ISSUE-118 review 2026-04-10"
created: 2026-04-10
assignee: codex-019d7553
tags:
  - site-runtime
  - automation
  - background
  - page
kind: slice
epic: EPIC-browser-automation
parallel_group: site-runtime
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: follow-up
depends_on:
  - ISSUE-110
write_scope:
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/page-hook.ts
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/backlog/2026-04-09-background-automation-lane-still-lacks-stabilization-and-failure-tracking-scope.md
check_cmd: "bunx vitest run packages/site-runtime/test/site-runtime.spec.ts apps/mv3-shell/test/manifest.spec.ts"
completed_at: 2026-04-10T03:06:53.742Z
---

## Goal

补齐 background lane 在非 active tab 目标上的 `page.*` 行为覆盖，证明当前 lane 不只是 create/invoke/cleanup plumbing，而是已经能稳定承接最小 page automation 动作面。

## Review Finding

- 当前 background lane 已有显式 target / tab create / invoke / teardown 路径，也已有 intervention/failure-tracking 主链验证。
- 但现有 background-lane 测试仍主要锁在 generic `site.runtime.invoke` 与 intervention 路径，缺少对 `page.query` / `page.fill` / `page.click` / `page.press_key` 这类 page automation 行为在非 active tab 场景下的直接覆盖。
- 如果不补这层 targeted coverage，background lane 仍可能停留在 transport plumbing，而不是可回归验证的 page-action runtime path。

## Acceptance

- [x] 至少一条测试通过显式 `automationTarget.lane = background` 跑通 `page.query -> page.fill -> page.click` 或等价多步 page flow
- [x] 至少一条测试验证 `page.press_key` 或另一项 page action 在 non-active-tab background target 上可执行
- [x] active-lane 默认约束保持不变；不得通过放宽默认 active-tab 匹配来“伪支持” background
- [x] 覆盖落在共享 `site-runtime` / `mv3-shell` write scope 的正式测试中，而不是只停留在局部 harness 断言

## 工作总结

### 实现了什么
- 补齐 site-runtime 中 non-active-tab background 的 page.query→fill→click 正式测试覆盖
- 补齐 mv3-shell 中 explicit automationTarget.lane=background 的 page.press_key 集成覆盖与 background tab teardown 断言

### 实际跑了什么检查
- git diff --check
- bunx vitest run packages/site-runtime/test/site-runtime.spec.ts apps/mv3-shell/test/manifest.spec.ts

### 残留风险
- ISSUE-124 仍待补齐 background lane 的 DOM stabilization contract

## 相关 commits

- `b8c5397cbf70` test(automation): 补齐background页面动作覆盖
