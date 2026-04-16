---
id: ISSUE-147
title: "Screenshot action capability is typed but has no runtime binding"
status: done
priority: p1
source: review
created: 2026-04-15
assignee: codex-019d943b
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
completed_at: 2026-04-16T03:05:58.042Z
---

## Goal

把 Screenshot action capability is typed but has no runtime binding 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding


## Acceptance

- Screenshot capability descriptor has a working provider that captures the active tab via chrome.tabs.captureVisibleTab or equivalent; captured image is returned as a typed result; test coverage for capture and error paths

## 工作总结

### 实现了什么
- 将 page.screenshot 从 background 特例接入 runtimeServices.invokePageAction provider
- 补齐 screenshot 的 composed runtime services、capture、active-tab 缺失和 captureVisibleTab 缺失测试

### 实际跑了什么检查
- ./node_modules/.bin/biome check apps/mv3-shell/src/background.ts apps/mv3-shell/src/runtime-services.ts apps/mv3-shell/test/manifest.spec.ts
- bun test apps/mv3-shell/test/manifest.spec.ts
- bun run check（失败：apps/mv3-shell/test/sidepanel-management.spec.ts:241, packages/core/test/core.spec.ts:26）

### 残留风险
- 仓库级 bun run check 仍被 write scope 外既有类型错误阻塞，本 slice 已完成聚焦 lint/test 验证

## 相关 commits

- `9dcd3da97375` fix(mv3-shell): 接上 screenshot runtime 绑定
