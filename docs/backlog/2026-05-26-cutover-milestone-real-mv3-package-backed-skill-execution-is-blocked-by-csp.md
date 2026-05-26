---
id: ISSUE-184
title: "Cutover milestone: real MV3 package-backed skill execution is blocked by CSP"
status: done
priority: p0
source: "real Chromium UAT 2026-05-27"
created: 2026-05-26
assignee: codex-cutover
tags:
  - review
  - cutover
  - uat
  - mv3
  - skill
  - release
module_id: old-product-replacement-loop
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-cutover-product-completion
parallel_group: mv3-shell
depends_on: []
write_scope:
  - package.json
  - scripts/release-smoke-mv3-real-browser.ts
  - apps/mv3-shell/manifest.json
  - apps/mv3-shell/vite.config.ts
  - apps/mv3-shell/src/runner-sandbox.html
  - apps/mv3-shell/src/runner-sandbox.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/src/offscreen.ts
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/cutover-readiness-criteria.md
  - docs/level-2-uat-scenario-2026-05-27.md
  - docs/level-2-cutover-acceptance-2026-05-27.md
acceptance_ref: docs/level-2-cutover-acceptance-2026-05-27.md
check_cmd: "bun run check"
completed_at: 2026-05-26T21:21:26.472Z
---

## Goal

Turn the real browser UAT failure into the next cutover milestone: package-backed skills must execute in a real Chromium MV3 extension without relying on unsafe-eval, so the old plugin replacement proof is backed by runtime evidence rather than only harness tests.

## Review Finding

- Real Chromium UAT loaded the vNext MV3 extension and completed skills.install/skills.enable/skills.summary/runtime.bootstrap
- but runtime.event.dispatch failed when handler.js execution reached the JS runner because MV3 CSP blocks new Function/unsafe-eval.
- The current Level 2 UAT document records a Vitest harness proof; that evidence is too weak for release acceptance because it does not cover real extension CSP.

## Acceptance

- A durable real-browser smoke script launches Playwright Chromium with apps/mv3-shell/dist loaded as an unpacked MV3 extension and drives install -> enable -> runtime.event.dispatch -> audit.tail through chrome.runtime messaging.
- The smoke reproduces the current CSP failure before the production fix and passes after the fix.
- Package-backed skill handler execution in the MV3 runtime no longer depends on unsafe-eval/new Function for the release UAT path.
- Level 2 UAT/acceptance docs state the real Chromium evidence and no longer imply that harness-only proof is sufficient for release cutover.

## 工作总结

### 实现了什么
- 新增真实 Chromium MV3 release smoke，加载 apps/mv3-shell/dist 并通过 chrome.runtime 驱动 package-backed Skill event UAT
- 为 MV3 offscreen runner 增加 sandbox iframe 执行路径，在 sandbox CSP 中隔离 unsafe-eval，并通过 gateway 回调 shared capability context
- 更新 Level 2 UAT、cutover acceptance 和 readiness 文档，把 release-facing proof 从 harness-only 提升为真实 MV3 CSP 证据

### 实际跑了什么检查
- bun run build
- bun run release:smoke:mv3
- bun run test -- apps/mv3-shell/test/manifest.spec.ts -t 'dispatches runtime events to enabled package-backed skill subscriptions'
- bun run test -- apps/mv3-shell/test/manifest.spec.ts -t 'declares the MV3 offscreen-ready shell'
- ./node_modules/.bin/biome check <touched files>
- bun run check
- git diff --check
- git diff --cached --check

### 残留风险
- 无

## 相关 commits

- `7bb7f720539d` fix(mv3): 用 sandbox 执行 Skill 包处理器
