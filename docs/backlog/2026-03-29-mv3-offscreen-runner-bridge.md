---
id: ISSUE-006
title: "MV3 offscreen runner bridge"
status: done
priority: p0
source: "v0 follow-up"
created: 2026-03-29
assignee: agent
tags:
  - mv3-shell
  - js-runner
kind: slice
epic: EPIC-js-runner
parallel_group: mv3-shell
depends_on:
  - ISSUE-005
write_scope:
  - apps/mv3-shell/manifest.json
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/src/offscreen.html
  - apps/mv3-shell/src/offscreen.js
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/next-development-slices-2026-03-29.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T08:53:00.551Z
---

## Goal

把 runner host 挂到 MV3 offscreen lifecycle 上。

## Acceptance

- background 能管理 offscreen host 生命周期
- bridge contract 被测试约束

## Sub Issues

- `ISSUE-013` `Review: phase 4 real injection chain is still mocked`

## 工作总结

### 2026-03-29 17:00 CST

- 已实现 background -> offscreen 的最小 runner bridge
- 已补 `runner.ensure_host` / `runner.invoke` / `runner.cancel` / `runner.health` 协议
- 已让 background 管理 offscreen document 创建、host 就绪态和 bridge timeout
- 已补 `mv3-shell` 侧桥接测试，当前 `apps/mv3-shell/test/manifest.spec.ts` 共 5 项通过
- 当前未改 `status` 为 `done`，因为仓库级 `bun run typecheck` 被并行中的 `packages/site-runtime/test/site-runtime.spec.ts` 变更阻塞；该测试要求的新导出尚未在 `packages/site-runtime/src/index.ts` 实现

### 2026-03-29 17:07 CST

- 已提交 `feat: add mv3 offscreen runner bridge`
- 已确认 `bun x vitest run apps/mv3-shell/test/manifest.spec.ts` 通过（6/6）
- 已确认全仓 `bun run typecheck` 与 `bun run test` 通过
- 后续 `de478c8` 已把 runner host 核心抽到共享 `packages/js-runner/src/runner-host-core.js`，`apps/mv3-shell` 侧改为 mirror + sync test，不再保留独立实现

## 相关 commits

- `b9b11d9` `feat: add mv3 offscreen runner bridge`
- `de478c8` `refactor: extract runner-host-core shared module; mark ISSUE-004, ISSUE-008 done`
