---
id: ISSUE-126
title: "Follow-up: remote host health still lacks a concrete probe and degraded-state handshake"
status: open
priority: p1
source: "ISSUE-125 follow-up 2026-04-10"
created: 2026-04-10
assignee: unassigned
tags:
  - review
  - execution-host
  - remote-host
  - health
  - control-plane
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: follow-up
kind: slice
epic: EPIC-execution-host
parallel_group: js-runner
depends_on: []
write_scope:
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/legacy-to-vnext-migration-matrix.md
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
---

## Goal

把 remote host record 的 first-class control-plane 继续收口到最小 transport-backed health / connect 语义，避免 hosts.health 继续只反映本地标记位。

## Review Finding

- ISSUE-125 已让 remote host 成为可列举/可默认/可执行的一等 record，但 remote connect/health 目前仍只是 control-plane 状态翻转。
- 当前 remote 可用性只能在 host.exec 失败后被动反映，缺少独立于用户命令的 probe/handshake 路径。
- 如果不补这层语义，hosts.health/connect 仍会高估 remote host 可用性，也无法与 local offscreen diagnostics 形成对齐边界。

## Acceptance

- 为 remote host 定义最小 injected probe/handshake contract，并明确它与 host.exec 的关系
- hosts.connect/health 在 remote host 上优先使用 probe 结果表达 healthy/degraded/unknown，而不是只看本地 state flag
- manifest/runtime 测试覆盖 remote probe success、probe failure、以及未提供 probe 时的回退行为
- 文档明确：ISSUE-125 解决的是 first-class record，新的 slice 负责 transport-backed health parity，而不是多 remote host discovery
