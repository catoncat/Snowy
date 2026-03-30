---
id: ISSUE-067
title: "Review: kernel is still not the runtime center in app integration"
status: open
priority: p0
source: "plugin-mainline correction review 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - follow-up
  - kernel
  - architecture
  - plugin-mainline-correction
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on:
  - ISSUE-066
write_scope:
  - packages/kernel/src/kernel-facade.ts
  - packages/kernel/test/kernel-facade.spec.ts
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - packages/js-runner/src/index.ts
  - packages/js-runner/test/js-runner.spec.ts
  - apps/mv3-shell/src/runtime-services.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---

## Goal

让 browser-side kernel 在真实 app integration path 中成为 runner/site orchestration 的中枢，而不是 package-local skeleton。

## Review Finding

- `createKernel()` 已具备 registry/providers dispatch wiring，但 app integration 仍然绕过 kernel，直接在 `runtime-services` 中调用 `SiteSkillRuntime` 与 runner host。
- `runtime-services` 还向 `createKernel()` 传入未被 kernel 消费的 `runnerHost`，说明 app 和 kernel 之间的集成边界仍未真正收口。
- 当前测试主要证明 package 内部子系统可工作，还没有证明“app -> kernel -> runner/site” 的真实主链成立。

## Acceptance

- app integration 至少一条 runner step 和一条 site step 通过 kernel-owned orchestration 完成，不再以 app 旁路直调作为主路径。
- kernel integration 所需的 runner/site 依赖以显式、可测试的方式进入 kernel 层，而不是在 app 层静默旁路。
- 增加端到端测试，证明 `session/run/step -> kernel -> runner/site -> turn/result` 在 app integration path 上成立。
- 文档与测试都明确：kernel 是 browser-side brain mainline，而不是只在 `packages/kernel` 内自洽。
