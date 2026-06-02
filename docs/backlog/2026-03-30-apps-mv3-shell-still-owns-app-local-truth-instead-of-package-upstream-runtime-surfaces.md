---
id: ISSUE-066
title: "Review: apps/mv3-shell still owns app-local truth instead of package-upstream runtime surfaces"
status: done
priority: p0
source: "plugin-mainline correction review 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - follow-up
  - mv3-shell
  - architecture
  - plugin-mainline-correction
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-mv3-shell
parallel_group: mv3-shell
depends_on:
  - ISSUE-065
write_scope:
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/src/runtime-services.js
  - apps/mv3-shell/test/manifest.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - docs/
acceptance_ref: docs/reviews/2026-03-30-plugin-mainline-correction-control.md
check_cmd: "bun run check"
---

## Goal

把 `apps/mv3-shell` 收口成真正的 MV3 container / bridge，让 `packages/*` 成为公共 runtime surface 的真实上游。

## Review Finding

- `apps/mv3-shell/src/runtime-services.js` 虽然已有 `dispatchCapability()` 和最小 provider wiring，但当前没有真实调用者进入这条主链。
- `apps/mv3-shell/src/background.js` 仍手写 `runtime/hosts/host/page/tabs/config` 的路由、辅助函数和局部状态，形成 app-local truth。
- `SiteSkillRuntime` 相关编排仍在 app 内按请求临时拼装，而不是通过 package-owned integration 入口暴露。

## Acceptance

- `background.js` 只保留 MV3 listener、Chrome API transport、offscreen/page-hook 生命周期与最薄的 bridge glue，不再手写产品真相。
- `background.js` 与 `runtime-services.js` 之间重复的 tab/config/helper 逻辑被消除；代表性 public path 改为走 package-upstream 入口。
- 至少一条 control-plane path 和一条 page/site path 明确走 package-owned runtime surface，而不是 app 内第二套实现。
- 测试显式锁定“apps 只是 MV3 container，packages 才是上游 runtime truth”这条边界。

## Impact Note

- 影响的 northbound surface：`config.update`、`tabs.get_active`、`tabs.navigate`、`page.press_key`、`site.runtime.invoke` 的 app integration path。
- 影响的消费者：聊天 Agent、Skill runtime、后续 MV3 bridge / UI / system 复用同一路径的消费者。
- 控制面文档同步：已执行 Doc Freshness Gate；本次不改 public capability catalog、workflow、cutover 状态，控制面文档无需改写。

## 工作总结

- 在 `packages/core` 新增 package-owned config / tabs helper，把 `config.update` 与 `tabs.*` 的运行时语义从 `background.js` 下沉到 package 上游。
- 在 `packages/site-runtime` 新增 single-action invoke helper，把临时 `SiteSkillRuntime` 拼装从 app 内移到 package-owned integration 入口。
- `apps/mv3-shell/src/runtime-services.js` 改为只接 Chrome transport、runner host、page-hook installer，并通过 package helper 暴露 `dispatchCapability()`、`invokeSiteSkill()`、`invokePageAction()`。
- `apps/mv3-shell/src/background.js` 删除 app-local config/tabs/page/site 编排，改为薄路由到 runtime services；只保留 MV3 listener、offscreen transport、host lifecycle、bootstrap glue。
- 测试补了三层边界：
  - `packages/core/test/core.spec.ts` 锁定 config/tabs 共享 helper 可通过 public capability dispatch 工作
  - `packages/site-runtime/test/site-runtime.spec.ts` 锁定 single-action helper 是 package-owned invoke surface
  - `apps/mv3-shell/test/manifest.spec.ts` 锁定 background 会把 tabs/config/page 路径委托给 composed runtime services，而不是自己再实现一套
- 已执行 Doc Freshness Gate，检查：
  - `docs/ai-surface-index.md`
  - `docs/agent-bootstrap-context-pack.md`
  - `docs/module-tracking-ledger.json`
  - `docs/legacy-to-vnext-migration-matrix.md`
  - `docs/migration-parity-dashboard.md`
  - `docs/cutover-readiness-criteria.md`
- 上述文档当前都不需要改：本次没有新增 public action，也没有改变 workflow / cutover 判断，只改变 app integration ownership。
- 已运行：
  - `bun run test -- packages/core/test/core.spec.ts packages/site-runtime/test/site-runtime.spec.ts apps/mv3-shell/test/manifest.spec.ts`
  - `bun run typecheck`
  - `bunx biome check packages/core/src/index.ts packages/core/test/core.spec.ts packages/site-runtime/src/index.ts packages/site-runtime/test/site-runtime.spec.ts apps/mv3-shell/src/background.js apps/mv3-shell/src/runtime-services.js apps/mv3-shell/test/manifest.spec.ts`
  - `bun run check`（失败于仓内既有、与本 issue 无关的全局 Biome debt）
- 残留风险：`hosts.* / host.* / runtime.bootstrap` 仍有 app-owned glue；本 issue 已把代表性 control-plane 与 page/site path 拉回 package 上游，但 Gate 2 的 kernel-centered integration 仍需后续 issue 继续收口。

## 相关 commits

- `a8bbecf refactor(mv3-shell): route runtime paths through package surfaces`
