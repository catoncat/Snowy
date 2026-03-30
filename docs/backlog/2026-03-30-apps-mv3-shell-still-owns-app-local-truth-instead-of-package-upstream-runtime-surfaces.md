---
id: ISSUE-066
title: "Review: apps/mv3-shell still owns app-local truth instead of package-upstream runtime surfaces"
status: open
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
