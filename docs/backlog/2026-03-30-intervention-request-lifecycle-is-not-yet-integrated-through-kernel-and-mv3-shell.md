---
id: ISSUE-068
title: "Follow-up: intervention request lifecycle is not yet integrated through kernel and mv3-shell"
status: open
priority: p1
source: "ISSUE-041 intervention/handoff decision 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - follow-up
  - site-runtime
  - automation
  - intervention
  - kernel
  - mv3-shell
  - plugin-mainline-correction
module_id: intervention-handoff
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on:
  - ISSUE-041
write_scope:
  - docs/
  - packages/kernel/src/
  - packages/kernel/test/
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - apps/mv3-shell/src/runtime-services.js
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/browser-automation-cutover-boundary.md
check_cmd: "bun run check"
---

## Goal

把 `packages/site-runtime` 已产出的 intervention request contract 真正接到 kernel 与 MV3 app integration path，形成可 resolve / cancel / timeout / audit 的运行态闭环。

## Review Finding

- `ISSUE-041` 已完成 intervention / human handoff 的定性，并在 `site-runtime` 落地了最小 request contract。
- 但当前 request 还只停在 package-local 返回值，没有进入 kernel run state，也没有被 MV3 shell / UI / audit 主链消费。
- 如果这层不继续往上接，intervention 仍会停留在“局部能跑”，不能算 cutover 前真正闭环。

## Acceptance

- kernel / app integration path 至少能接住 `SiteInvocationResult.intervention`，并把它提升为可见的 runtime state。
- intervention 至少具备最小 lifecycle：request / resolve(or resume) / cancel / timeout。
- runtime diagnostics / audit 能读到 intervention 的当前状态或最近事件，不再只剩 package-local trace。
- 测试锁住 `site-runtime -> kernel/app -> diagnostics/audit` 的最小 handoff 主链。
