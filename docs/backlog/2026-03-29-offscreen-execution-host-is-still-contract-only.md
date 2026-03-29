---
id: ISSUE-035
title: "Review: offscreen execution host is still contract-only"
status: done
priority: p1
source: "Host adapter follow-up 2026-03-29"
created: 2026-03-29
assignee: codex
tags:
  - review
  - host
  - js-runner
  - mv3-shell
kind: slice
epic: EPIC-js-runner
parallel_group: js-runner
depends_on:
  - ISSUE-032
write_scope:
  - packages/js-runner/src/index.ts
  - packages/js-runner/src/runner-host-core.js
  - packages/js-runner/test/js-runner.spec.ts
  - apps/mv3-shell/src/runner-host-core.js
  - apps/mv3-shell/src/offscreen.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T13:11:33.926Z
---

## Goal

把默认 offscreen execution host 从 contract-only bridge 推进到真实 host adapter，让 `host.read/write/edit/exec` 在共享 runner host path 上成立。

## Review Finding

- `ISSUE-032` 已经把 `host.read/write/edit/exec` 接到 control plane 路由上。
- 但默认 offscreen `createRunnerHostCore()` 仍会把这些请求落到 unknown runner request 分支；当前成功路径还依赖测试里注入的 fake host implementation。

## Acceptance

- The shared runner host core handles host.read/write/edit/exec through an explicit host-adapter contract instead of falling through to an unknown request path.
- The default offscreen/local host path returns structured, tested host-substrate errors when no real adapter is configured.
- `packages/js-runner` and `apps/mv3-shell` stay in sync.
- Migration/control docs reflect `ISSUE-032` as landed plus the remaining adapter gap.

## 工作总结

- 在 `packages/js-runner` 为 shared `createRunnerHostCore()` 增加显式 `hostAdapter` contract，并把 `read/write/edit/exec` 从 unknown runner request fallback 收口到独立 host-substrate 分支。
- 默认 offscreen/local host 仍未接入真实 adapter，但现在会稳定返回结构化 `adapter_missing` error；`apps/mv3-shell` mirror 与 `packages/js-runner` 保持同步。
- 补齐 `packages/js-runner/test/js-runner.spec.ts` 与 `apps/mv3-shell/test/manifest.spec.ts`：既覆盖显式 host adapter 成功路径，也覆盖默认 `createHost` 路径下的结构化缺省错误。
- 同步更新迁移控制面文档 wording，明确 `ISSUE-032` 已完成 contract/routing，当前剩余 gap 是真实 local/remote adapter 仍未实现。
- 已运行 `bun run check`。
- 残留风险：默认 local host 仍没有真实执行 adapter；该缺口已拆到 `ISSUE-038`。

## Sub Issues

- `ISSUE-038` `Review: real local execution host adapter is still missing`

## 相关 commits

- `c8f8bbf` `fix(js-runner): route host substrate through host adapter`
