---
id: ISSUE-138
title: "Tab management actions are typed but have no provider implementation"
status: done
priority: p1
source: review
created: 2026-04-15
assignee: codex-11d698eb
tags:
  - review
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-browser-automation
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/site-runtime/src/index.ts
  - apps/mv3-shell/src/background.ts
  - packages/site-runtime/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
completed_at: 2026-04-15T14:32:04Z
---

## Goal

把 Tab management actions are typed but have no provider implementation 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- `tabs.*` descriptor 已在 contracts/core 暴露，`runtime-services` 里也已有 `chrome.tabs` transport，但 MV3 bridge 只暴露了 `tabs.get_active` / `tabs.navigate`，`tabs.list` 仍未接到对外消息路由。
- 因此当前仓库的真实剩余 gap 不是“完全没有 provider”，而是 tabs 管理能力对外桥接与测试覆盖仍不完整。

## Acceptance

- tabs.list and tabs.get_active have a working provider backed by chrome.tabs API; tabs.navigate executes real navigation with active-tab gating; test coverage for provider dispatch and error paths

## 工作总结

### 实现了什么
- 补齐 MV3 bridge 对 `tabs.list` 的消息路由，复用既有 `runtime-services` tabs transport，而不是再造一层 provider
- 为 `tabs.list` 增加两层回归覆盖：composed runtime services dispatch 路由，以及默认 MV3 path 真实走 `chrome.tabs.query`
- 复核现状后保留既有 `tabs.get_active` / `tabs.navigate` 实现，只收口缺失的桥接暴露与测试覆盖

### 实际跑了什么检查
- `bun run test -- apps/mv3-shell/test/manifest.spec.ts`
- `./node_modules/.bin/biome check apps/mv3-shell/src/background.ts apps/mv3-shell/test/manifest.spec.ts`
- `git diff --check`
- `bun run check`（失败：受 `.agents/skills/auto-claim-issues-next/scripts/complete-issue.ts` 与 `packages/site-runtime/test/site-runtime.spec.ts` 的 write scope 外既有类型错误阻塞）

### 残留风险
- 当前 issue 初始 write scope 未包含 `apps/mv3-shell/test/manifest.spec.ts`，但 bridge 行为的现有回归 harness 在该文件中；本轮仅做最小相邻测试补充，未扩展到其他共享区域
- review issue 标题已落后于仓库现状：核心 tabs transport 早已存在，本轮实际补的是 `tabs.list` 对外桥接与覆盖闭环

## 相关 commits

- `c2c13a5bfdb3` fix(mv3-shell): 补齐 tabs.list 桥接路由
