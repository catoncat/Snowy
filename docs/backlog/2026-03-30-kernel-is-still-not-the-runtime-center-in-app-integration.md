---
id: ISSUE-067
title: "Review: kernel is still not the runtime center in app integration"
status: done
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

## Impact Note

- 影响的 northbound surface：`page.press_key`、`site.runtime.invoke` 所走的 app integration path，以及 `createBackgroundRuntimeServices()` 的 kernel wiring 方式。
- 影响的消费者：MV3 background bridge、site runtime / page hook 路径，以及依赖 bootstrap / intervention 的上层 UI 或 Agent。
- 控制面文档同步：已同步 `docs/kernel-skeleton-design.md`；其余 Doc Freshness Gate 文档仅需检查，无需改写口径。

## 工作总结

- `packages/kernel/src/kernel-facade.ts` 新增显式 `executeRunnerStep` / `executeSiteStep` 注入口，kernel 现在能把 runner step 与 site step 当成一等 loop step 编排，而不是只会调 capability provider。
- `apps/mv3-shell/src/runtime-services.js` 不再直接旁路 `JsRunnerHost` / `invokeSingleActionSiteSkill()`；`invokePageAction()` 与 `invokeSiteSkill()` 现在先激活 run，再经 `kernel.executeStep()` 进入 site step，并由 site step 内部回调一个 kernel-owned runner step。
- `packages/site-runtime/src/index.ts` 新增外部 `executeRunner` 注入点，使 app 层可在不旁路 site-runtime 安装/校验逻辑的前提下，把 runner 执行收回 kernel。
- 测试已补齐：
  - `packages/kernel/test/kernel-facade.spec.ts` 覆盖 runner/site executor 注入。
  - `packages/site-runtime/test/site-runtime.spec.ts` 覆盖 kernel-owned runner injection。
  - `apps/mv3-shell/test/manifest.spec.ts` 新增 direct runtime-services 集成测试，锁定 page/site 路径都会产生 2 个 kernel step（runner + site），并保持 bridge 端到端行为不回退。
- Doc Freshness Gate 已检查 `docs/ai-surface-index.md`、`docs/agent-bootstrap-context-pack.md`、`docs/module-tracking-ledger.json`、`docs/legacy-to-vnext-migration-matrix.md`、`docs/migration-parity-dashboard.md`、`docs/cutover-readiness-criteria.md`；本次只需同步 `docs/kernel-skeleton-design.md` 的 app integration 规则，其余文档口径不变。
- 已运行：
  - `bun test packages/kernel/test/kernel-facade.spec.ts packages/site-runtime/test/site-runtime.spec.ts apps/mv3-shell/test/manifest.spec.ts packages/js-runner/test/js-runner.spec.ts`
  - `bunx biome check packages/kernel/src/kernel-facade.ts packages/kernel/test/kernel-facade.spec.ts packages/site-runtime/src/index.ts packages/site-runtime/test/site-runtime.spec.ts apps/mv3-shell/src/runtime-services.js apps/mv3-shell/test/manifest.spec.ts packages/js-runner/src/index.ts packages/js-runner/test/js-runner.spec.ts docs/kernel-skeleton-design.md docs/module-tracking-ledger.json docs/workflow/live-queue.json`
  - `bun run check`
- 残留风险：当前 kernel-owned orchestration 已接回 page/site app path，但 broader capability dispatch 仍可在 app 层直走 `dispatchCapabilityCall()`；本 issue 只收口 review finding 指向的 runner/site bypass。

## 相关 commits

- `42e09c4` `feat(kernel): route app runtime through kernel`
