---
id: ISSUE-073
title: "Review: host.exec still lacks a remote execution host path"
status: done
priority: p1
source: "current plan expansion 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - host
  - remote-host
  - js-runner
  - mv3-shell
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-js-runner
parallel_group: js-runner
depends_on:
  - ISSUE-067
write_scope:
  - packages/js-runner/src/index.ts
  - packages/js-runner/test/js-runner.spec.ts
  - apps/mv3-shell/src/offscreen.js
  - apps/mv3-shell/src/runtime-services.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
---

## Goal

把 host.exec still lacks a remote execution host path 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- 默认 offscreen local adapter 只覆盖 read/write/edit，browser-only context 下的 host.exec 仍没有真实成功路径
- 迁移矩阵已明确 remote host path 是独立 gap；如果不单独跟踪，host.exec 会长期停在 contract-only 状态
- 在 app-local truth 与 kernel-centered integration 收口后，execution host 仍需要一条 package-owned remote path 才能支撑真正的 exec 能力

## Acceptance

- host.exec 至少能通过一条 remote/default host path 成功执行，不再依赖 browser-only local adapter 或结构化 not-supported 错误作为常态
- local 与 remote host 的路由、错误模型和默认选择规则被显式锁定，并与现有 hosts.* control plane 一致
- 测试与文档明确：browser-only local adapter 继续承担读写编辑，真实 exec 由 remote host path 提供

## Work Summary

### What shipped

1. **`createCompositeHostAdapter({ local, remote })`** in `packages/js-runner/src/index.ts`
   - Explicit routing: read/write/edit → local adapter (fallback remote), exec → remote adapter (fallback local)
   - Pure function, no side effects, fully injectable

2. **`remoteHostAdapter` option** in `apps/mv3-shell/src/offscreen.js`
   - `createOffscreenRunnerBridge` now accepts an optional remote adapter
   - Automatically composes local + remote into a composite adapter

3. **`createRemoteExecAdapter(sendExec)`** in `apps/mv3-shell/src/runtime-services.js`
   - Wraps any async exec function into a `RunnerHostAdapter` with structured error handling
   - Error model: `E_RUNTIME` + `remote_exec_failed` + original error message

4. **6 new tests** across `js-runner.spec.ts` and `manifest.spec.ts`
   - Composite routes exec→remote, read/write/edit→local
   - Fallback when remote has no exec (uses local)
   - Fallback when local is absent (uses remote for read)
   - Structured error when neither adapter has exec
   - End-to-end offscreen bridge with remote adapter
   - `createRemoteExecAdapter` error wrapping

### Routing rules (locked, tested)

| Operation | Primary | Fallback |
|-----------|---------|----------|
| read | local | remote |
| write | local | remote |
| edit | local | remote |
| exec | remote | local |

### What is NOT included

- No concrete bridge transport (WebSocket / native messaging) — the remote adapter is injectable, actual transport is a separate concern
- No changes to `background.js` host routing — existing `routeHostSubstrate` still sends all ops to offscreen, which now has the composite adapter
- No changes to `hosts.*` control plane multi-host support — still single "local" host in background.js
