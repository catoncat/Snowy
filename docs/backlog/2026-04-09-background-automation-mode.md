---
id: ISSUE-110
title: Background automation lane 基础设施
status: open
priority: p2
source: next-batch-planner review 2026-04-09
created: 2026-04-09
assignee: unassigned
tags: [site-runtime, automation, background]
kind: slice
epic: EPIC-browser-automation
parallel_group: site-runtime
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
depends_on:
  - ISSUE-112
write_scope:
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/page-hook.ts
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bunx vitest run packages/site-runtime/test/site-runtime.spec.ts apps/mv3-shell/test/manifest.spec.ts"
---

## Goal

为 browser automation 增加显式的 background lane plumbing，让非 active tab 执行成为一条独立路径，同时保持现有 active-tab site runtime contract 不被静默放宽。

## Review Finding

当前 `packages/site-runtime/src/index.ts` 仍然把 match / invoke 绑定到 active tab。剩余缺口不是简单“把 active-tab 校验去掉”，而是新增一条 background automation lane：它应显式创建与路由 background target，并与后续 intervention / confirm 流程对齐。按照 module ledger，`site-runtime-browser-automation` 依赖 `intervention-handoff`，因此本 issue 应在 loop 内 intervention 主线落地后再接入。

## Acceptance

- [ ] background tab 创建与目标选择是显式 lane / target 选择，而不是静默绕过 active-tab 约束
- [ ] page-hook 能在 background lane 下完成 install / invoke，且不破坏现有 active-tab path
- [ ] site-runtime 保持现有 active-tab 行为，同时新增 background lane 的独立 dispatch seam
- [ ] background lane 支持 cleanup / teardown 策略，并有测试覆盖创建、路由与收尾
