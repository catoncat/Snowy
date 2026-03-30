---
id: ISSUE-013
title: "Review: phase 4 real injection chain is still mocked"
status: done
priority: p1
source: "codex review 2026-03-29"
created: 2026-03-29
assignee: agent
tags:
  - review
  - site-runtime
  - mv3-shell
  - phase4
  - injection
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-site-runtime
parallel_group: mv3-shell
depends_on:
  - ISSUE-012
write_scope:
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/src/page-hook.js
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: project_plan.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T09:46:20.264Z
---

## Goal

把 Phase 4 从“抽象 plan + vm fixture”推进到真实的最小 Chrome 注入链路。

## Review Finding

- `InjectionStep` 只有 `scriptId`，installer 还拿不到真正可执行载荷
- MV3 shell 当前只接了 `runner.*` bridge，没形成真实注入链路
- 测试仍用 `vm` fixture 模拟 page hook，不能证明 Chrome 注入成功

## Acceptance

- `InjectionStep` / installer 契约能表达真实注入所需信息，而不只是脚本名
- MV3 shell 具备最小可验证的显式注入路径
- 至少一条测试覆盖真实的“plan -> install -> invoke -> verify”链路，不再只靠 `vm` fixture 证明
- runner 不直接拿到可执行 DOM hook/result 句柄，边界被测试锁住

## 工作总结

- 在 `packages/site-runtime/src/index.ts` 为 `InjectionStep` 补上 `jsPath`，并把 installer 契约扩展为可选的 `invoke` / `verify` 钩子，让 runtime 能表达“安装 extension file → 调用 page hook → 校验结果”的最小真实链路，而不是只传抽象 `scriptId`。
- 在 `apps/mv3-shell/src/background.js` 新增 `createPageHookBridge()`，通过 `chrome.scripting.executeScript` 风格 API 做显式安装、调用和状态读取；MV3 shell 不再只有 `runner.*` bridge。
- 在 `apps/mv3-shell/src/page-hook.js` 把旧的可执行句柄 fixture 改成序列化 bridge API：`install()` 只返回 metadata，真正的 `invoke()` / `verify()` 在页面世界内执行，避免 runner 直接拿到 DOM hook 句柄。
- 在 `packages/site-runtime/test/site-runtime.spec.ts` 用显式 scripting harness 重写 page hook 集成测试，覆盖真实的 `plan -> install -> invoke -> verify` 路径，并断言 runner 看到的安装结果里 `run / invoke / verify` 都是 `undefined`。
- 在 `apps/mv3-shell/test/manifest.spec.ts` 补上 MV3 shell 侧桥接测试，锁住 page hook 能经由 `chrome.scripting.executeScript` 安装、调用、校验。
- 实际验证执行了 `bun run check`，结果通过：`tsc --noEmit` 通过，Vitest `10/10` 文件、`98/98` 测试通过；当前 write scope 内无残留 blocker。

## 相关 commits

- `922925a` `Build explicit page-hook injection bridge`
