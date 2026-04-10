---
id: ISSUE-126
title: "Follow-up: remote host health still lacks a concrete probe and degraded-state handshake"
status: done
priority: p1
source: "ISSUE-125 follow-up 2026-04-10"
created: 2026-04-10
assignee: codex-019d7556
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
completed_at: 2026-04-10T14:26:42.357Z
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

## 工作总结

### 实现了什么
- 新增 injected remote probe/handshake contract，让 remote hosts.connect/health 优先走 probe 结果而不是只看本地 state flag
- 在 background 中缓存 remote host health/degraded/checkedAt 状态，并让 remote exec/probe 共同回写 control-plane 快照
- 补齐 manifest/runtime 测试覆盖 remote probe success、probe failure、无 probe fallback，并更新迁移矩阵边界说明

### 实际跑了什么检查
- bunx vitest run apps/mv3-shell/test/manifest.spec.ts
- ./node_modules/.bin/biome check apps/mv3-shell/src/background.ts apps/mv3-shell/src/runtime-services.ts apps/mv3-shell/test/manifest.spec.ts docs/legacy-to-vnext-migration-matrix.md
- git diff --check
- bun run check（阻塞：write scope 外 TypeScript drift，报错仍集中在 .agents/skills/auto-claim-issues-next/scripts/complete-issue.ts、packages/core/*、packages/kernel/*、packages/site-runtime/test/site-runtime.spec.ts 等）

### 残留风险
- 当前 remote transport 仍是 injectable bridge；本轮只补齐 probe-backed health parity，尚未进入多 remote host discovery / concrete transport 实现

## 相关 commits

- `cd371757a3c8` feat(mv3-shell): 补齐远端主机探活握手
