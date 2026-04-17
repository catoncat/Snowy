---
id: ISSUE-157
title: "Review: multi-remote execution host discovery still lacks a production config path"
status: done
priority: p1
source: "ISSUE-155 follow-up 2026-04-16"
created: 2026-04-16
assignee: sable
tags:
  - review
  - execution-host
  - remote-host
  - multi-host
  - config
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: follow-up
kind: slice
epic: EPIC-execution-host
parallel_group: js-runner
depends_on:
  - ISSUE-155
write_scope:
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/legacy-to-vnext-migration-matrix.md
acceptance_ref: docs/migration-parity-dashboard.md
check_cmd: "bun run check"
completed_at: 2026-04-17T09:23:43.294Z
---

## Goal

把 multi-remote host record 从 injectable test seam 继续收口到 production config / discovery / rehydrate 路径，避免 `ISSUE-155` 完成后多 host 仍只能靠构造期注入出现。

## Review Finding

- `ISSUE-155` 已让 host control plane 可以并行维护多个 remote host record，并按 host record 独立处理 default / degraded / exec 路由。
- 当前多 host 集合仍只能通过 `createBackgroundRunnerBridge({ remoteTransports })` 注入，shared config / storage 仍只支持单个 `automation.remoteTransport`。
- 如果不继续落票，multi-remote parity 会停留在 runtime seam，无法进入真实配置、重启恢复与运营诊断链路。

## Acceptance

- shared config / storage 能表达多个 remote host transport record，并为每条 record 保留稳定 `hostId`
- background bridge 重启后可从配置中恢复多条 remote host record，`hosts.list/get/set_default` 保持一致
- config summary 继续做 secret sanitization，并补齐 multi-remote config / rehydrate 测试

## 工作总结

### 实现了什么
- 将 automation.remoteTransports[] 接入 config.update/config.summary 与独立 storage 持久化
- 补齐 multi-remote host 的 restart rehydrate 与 manifest 回归测试

### 实际跑了什么检查
- bunx vitest run apps/mv3-shell/test/manifest.spec.ts
- ./node_modules/.bin/biome check apps/mv3-shell/src/runtime-services.ts apps/mv3-shell/test/manifest.spec.ts docs/legacy-to-vnext-migration-matrix.md docs/migration-parity-dashboard.md
- git diff --check

### 残留风险
- bun run check 仍被 write scope 外 packages/core/test/core.spec.ts:649/656/660/662 的既有类型错误阻塞

## 相关 commits

- `74a5a70fe81f` feat(mv3-shell): 支持多远端主机配置恢复
