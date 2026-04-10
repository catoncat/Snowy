---
id: ISSUE-124
title: "Follow-up: background lane still lacks DOM stabilization contract"
status: done
priority: p1
source: "ISSUE-118 review 2026-04-10"
created: 2026-04-10
assignee: codex-019d7556
tags:
  - site-runtime
  - automation
  - background
  - stabilization
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
completed_at: 2026-04-10T04:36:37.120Z
---

## Goal

为 background lane 定义并落地最小 DOM stabilization contract，让非 active tab 的 page/site 动作在“元素尚未稳定 / 页面尚未 ready”场景下有正式 runtime 语义，而不是把失败、等待、重试混成调用方约定。

## Review Finding

- 当前 background lane 已能显式创建 tab、安装 page-hook、执行 action，并通过 intervention/audit 暴露失败结果。
- 但代码里还没有正式的 stabilization seam：没有 runtime-owned 的 delayed DOM readiness、settle budget、或 verify-before-ready 处理契约。
- recovery report 仍把 DOM lane / verifier / stabilization 视为 browser automation 主能力的一部分；如果这一层继续缺位，background lane 的 operator-trustworthy 语义仍不完整。

## Acceptance

- [ ] 明确最小 stabilization contract（例如 wait/settle/retry budget 或 verifier-driven readiness），而不是依赖调用方 ad-hoc sleep
- [ ] `site-runtime`、`mv3-shell background`、`page-hook` 的职责边界明确，不把 stabilization 偷塞到单一 transport 层
- [ ] 至少一条测试覆盖 delayed DOM readiness / not-ready-first 的场景，并证明 stabilization budget 耗尽前不会过早终结为 verify failure
- [ ] intervention / failure-tracking 与 stabilization 的边界清晰：stabilization 负责“尚未 ready”的运行态等待，intervention 负责预算耗尽后的人工接管或失败恢复

## 工作总结

### 实现了什么
- 为 site-runtime 引入结构化 stabilization contract，并把 verifier 结果区分为 verified/not_ready/failed
- 为 page-hook/page-hook-bridge 落地 selector_present readiness seam，并把 not_ready 透传给 runtime
- 为 background lane 透传 stabilization 配置，并补齐 delayed-ready 与 budget-exhausted 测试覆盖

### 实际跑了什么检查
- bunx vitest run packages/site-runtime/test/site-runtime.spec.ts apps/mv3-shell/test/manifest.spec.ts
- ./node_modules/.bin/biome check packages/site-runtime/src/index.ts packages/site-runtime/test/site-runtime.spec.ts apps/mv3-shell/src/background.ts apps/mv3-shell/src/page-hook-bridge.ts apps/mv3-shell/src/page-hook.ts apps/mv3-shell/test/manifest.spec.ts
- git diff --check

### 残留风险
- 当前 DOM stabilization 仅先落地 selector_present seam；更复杂 readiness signal 仍需后续 slice 扩展

## 相关 commits

- `2fa03a8905fc` feat(site-runtime): 落地后台DOM稳定化契约
