---
id: ISSUE-118
title: "Review: background automation lane still lacks stabilization and failure-tracking scope"
status: done
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: codex-019d750c
tags:
  - review
  - site-runtime
  - automation
  - background
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-browser-automation
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/page-hook.ts
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
completed_at: 2026-04-10T02:21:00.578Z
---

## Goal

Review the next post-plumbing slice for background automation so the lane advances from transport wiring to stable, operator-trustworthy behavior.

## Review Finding

- Background lane plumbing now exists, but the recovery report still treats broader browser automation stabilization, DOM lane behavior, and failure tracking as unfinished.
- The current background contract mostly covers create/invoke/cleanup; it has not yet re-verified failure tracker behavior, DOM stabilization, or broader page action coverage in non-active-tab runs.
- Without a scoped follow-up, background automation risks stopping at transport plumbing rather than operator-trustworthy automation behavior.

## Acceptance

- Clarify the minimal post-plumbing scope for background-lane stabilization and failure tracking in the current phase.
- If concrete gaps remain, open executable follow-up slices on shared `site-runtime/MV3` paths with targeted tests.
- Keep active-lane and background-lane boundaries explicit instead of silently broadening one path into the other.

## Resolution

- 对照当前 `packages/site-runtime` / `apps/mv3-shell` 代码与测试复核后，background lane 已不再只是 transport plumbing：显式 background target、tab create / teardown、page-hook invoke，以及 intervention-driven failure tracking 都已有主链测试覆盖。
- 因此本轮 minimal post-plumbing scope 不再需要再发明一套 background-specific failure tracker；failure-tracking 的当前落点就是 `verify/runtime_blocked -> intervention -> diagnostics/bootstrap/audit/rehydrate` 这条主链。
- 剩余 gap 已收窄为两块：
  1. non-active-tab background target 上的 `page.*` 行为覆盖仍不足；
  2. DOM stabilization 仍缺正式 contract 与 targeted test。
- 这两块都应继续落在共享 `site-runtime` / `mv3-shell` 路径上作为 follow-up，而不是通过放宽默认 active-tab path 来“顺带支持”。

## Sub Issues

- `ISSUE-123` `Follow-up: background lane lacks non-active-tab page action coverage`
  - 原因：把当前 background lane 从 generic invoke/teardown 进一步锁到 `page.query/fill/click/press_key` 的 non-active-tab 行为覆盖。
  - 结果：明确 page automation 在 background target 上的最小可回归面，不把 active-tab 默认路径静默放宽。
- `ISSUE-124` `Follow-up: background lane still lacks DOM stabilization contract`
  - 原因：当前仍缺 runtime-owned stabilization seam，无法区分“页面尚未 ready”和“真正需要 intervention/failure recovery”。
  - 结果：把 recovery report 中剩余的 stabilization gap 收窄成可执行 slice，而不是继续停留在抽象 review 结论。

## 工作总结

### 实现了什么
- 复核 background lane 当前主链，确认 failure-tracking 已由 intervention/diagnostics/audit/rehydrate 覆盖
- 新增 ISSUE-123 与 ISSUE-124，把剩余 gap 收窄为 non-active-tab page action coverage 与 DOM stabilization contract

### 实际跑了什么检查
- bun run workflow:queue:build
- git diff --check
- bunx vitest run packages/site-runtime/test/site-runtime.spec.ts apps/mv3-shell/test/manifest.spec.ts

### 残留风险
- ISSUE-123/124 未落地前，background lane 仍缺 non-active-tab page action 覆盖与 DOM stabilization 正式 contract

## 相关 commits

- `6e75826b80c2` docs(workflow): 收口ISSUE-118并补background follow-up
