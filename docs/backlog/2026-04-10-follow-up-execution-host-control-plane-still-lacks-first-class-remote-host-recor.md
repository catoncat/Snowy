---
id: ISSUE-125
title: "Follow-up: execution host control plane still lacks first-class remote host records"
status: done
priority: p1
source: "ISSUE-119 review 2026-04-10"
created: 2026-04-10
assignee: codex-019d7556
tags:
  - review
  - execution-host
  - remote-host
  - control-plane
  - multi-host
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: follow-up
kind: slice
epic: EPIC-execution-host
parallel_group: js-runner
depends_on: []
write_scope:
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/offscreen.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
completed_at: 2026-04-10T05:33:26.733Z
---

## Goal

把 remote exec plumbing 从 injectable transport 提升为 first-class execution host control-plane 语义，而不是继续复用 local/offscreen host identity 伪装 remote success。

## Review Finding

- contracts/core 已支持 local|remote host record，但 MV3 background 仍把 hosts.* 硬编码为单一 local host。
- offscreen remote exec adapter 已可执行命令，但 host.exec 成功路径仍沿用 hostId=local，remote host 还不是可列举/可选择/可健康检查的控制面实体。
- 如果不单独收口，execution-host-bridge 会继续表现成“remote exec plumbing 已完成”，但真实缺的是 host identity、selection、default routing 与 control-plane parity。

## Acceptance

- hosts.list/get/connect/disconnect/health 不再硬编码只有 local host；remote host 至少能作为一等 record 被列举与读取。
- host.exec 的 remote path 与 host identity / default host 选择语义显式一致，不再默认把 remote success 记到 local host 身上。
- manifest/runtime tests 与文档明确区分 local offscreen host lifecycle 和 remote host control-plane 管理边界。

## 工作总结

### 实现了什么
- 在 background hosts.* 中新增 remote host record，并允许 remote 被 list/get/connect/disconnect/health/set_default
- 将 host.exec 改为按 host identity 直接路由：remote 直连 sendRemoteExec，local 继续走 offscreen/local host
- 收紧默认 offscreen host 路由，保证 local 只承担读写编辑，remote host 才执行远端 exec，并同步更新迁移矩阵说明

### 实际跑了什么检查
- bunx vitest run apps/mv3-shell/test/manifest.spec.ts
- ./node_modules/.bin/biome check apps/mv3-shell/src/background.ts apps/mv3-shell/src/offscreen.ts apps/mv3-shell/test/manifest.spec.ts
- git diff --check
- bun run check（阻塞：write scope 外 TypeScript drift，报错集中在 .agents/skills/auto-claim-issues-next/scripts/complete-issue.ts、packages/core/*、packages/kernel/*、packages/site-runtime/test/site-runtime.spec.ts 等）

### 残留风险
- 尚未实现 concrete remote transport/health handshake 与多 remote host discovery；当前仍是 injectable remote bridge 的 first-class control-plane 版本

## 相关 commits

- `6082d3b4e5f1` feat(mv3-shell): 补齐远端主机控制面记录
