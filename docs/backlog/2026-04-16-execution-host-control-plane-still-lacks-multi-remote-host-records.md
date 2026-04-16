---
id: ISSUE-155
title: "Review: execution host control plane still lacks multi-remote host records"
status: done
priority: p1
source: review
created: 2026-04-16
assignee: codex-019d94c7
tags:
  - review
  - execution-host
  - remote-host
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-execution-host
parallel_group: js-runner
depends_on: []
write_scope:
  - packages/js-runner/src/index.ts
  - apps/mv3-shell/src/offscreen.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/migration-parity-dashboard.md
check_cmd: "bun run check"
completed_at: 2026-04-16T05:46:27Z
---

## Goal

把 execution host control plane still lacks multi-remote host records 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- Migration parity now covers the default offscreen host and a single configured remote transport, but the remaining gap is multi remote host discovery and parity.
- Current host control plane still assumes one configured remote host record instead of a first-class set of remote hosts with independent availability and default selection.

## Acceptance

- Host summary and control plane can represent multiple remote host records rather than a single configured remote transport
- Default host selection and degraded health state operate per host record without regressing the offscreen local host path
- Tests cover listing selecting and degrading multiple remote hosts

## Sub Issues

- `ISSUE-157` `Review: multi-remote execution host discovery still lacks a production config path`
  - 原因：本轮把 multi-remote host record 收口到 control plane/runtime seam，但 shared config / storage 仍只支持单个 `automation.remoteTransport`，还没有生产配置与重启恢复路径。

## 工作总结

### 实现了什么
- 将 background execution host control plane 从单个 `remote` 记录提升为可维护多条 remote host record 的 registry，并按 host record 独立处理 list/get/set_default/health/exec 的 default 与 degraded 状态
- 让 remote transport 自带稳定 `hostId` 元数据，offscreen host adapter 对任意非 `local` 的 hostId 统一走 remote exec 路径
- 补齐 manifest 回归：覆盖多 remote host 的 listing / default selection / degraded state，以及 offscreen 对多个 remote hostId 的 exec 路由；并顺手修复当前 write scope 内旧测试的类型断言漂移

### 实际跑了什么检查
- `bunx vitest run apps/mv3-shell/test/manifest.spec.ts`
- `./node_modules/.bin/biome check apps/mv3-shell/src/background.ts apps/mv3-shell/src/offscreen.ts apps/mv3-shell/src/runtime-services.ts apps/mv3-shell/test/manifest.spec.ts`
- `git diff --check`
- `bun run check`（失败：write scope 外 `packages/core/test/core.spec.ts` 仍有既有类型错误，当前报错集中在 649/656/660/662 行对 `entries` 的联合类型访问）

### 残留风险
- 当前 multi-remote host 仍停留在 runtime 注入层；shared config / storage 只支持单个 `automation.remoteTransport`，生产态 multi-host discovery / rehydrate 已转交 `ISSUE-157`
- 本次没有执行 `workflow:done` / queue rebuild：canonical workspace 中 workflow/backlog 控制文件已有并行改动，若此时重建 queue 会把他人的 dispatch 变更混入当前提交；因此仅手工回写当前 issue 与 follow-up issue

## 相关 commits

- `ca17baa08b83` feat(mv3-shell): 支持多远端主机记录
