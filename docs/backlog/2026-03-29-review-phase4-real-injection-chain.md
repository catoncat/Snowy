---
id: ISSUE-013
title: "Review: phase 4 real injection chain is still mocked"
status: open
priority: p1
source: "codex review 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - site-runtime
  - mv3-shell
  - phase4
  - injection
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
