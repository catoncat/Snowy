---
id: ISSUE-127
title: "Follow-up: remote execution host transport is still injectable-only"
status: done
priority: p1
source: "ISSUE-126 follow-up 2026-04-10"
created: 2026-04-10
assignee: codex-019d7556
tags:
  - review
  - execution-host
  - remote-host
  - transport
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
completed_at: 2026-04-14T11:28:48.672Z
---

## Goal

把 remote host 的 exec/probe transport 从 ad-hoc injectable callback 继续收口为最小可诊断的 bridge contract，避免 control-plane 已落地但 transport 仍无正式语义。

## Review Finding

- ISSUE-125/126 已补齐 remote host record、default routing 与 probe-backed health parity，但 background runtime 仍通过 sendRemoteExec/sendRemoteProbe 注入回调承接远端路径。
- 当前 remote transport 没有正式的 bridge contract、endpoint/config 语义与诊断边界，导致 remote host 仍更像测试注入 seam，而不是 product-facing transport surface。
- 如果不继续收口，execution-host-bridge 会停留在 control-plane 完整但 transport 仍不可运营、不可配置、不可诊断的半成品状态。

## Acceptance

- 定义 remote exec/probe 的最小 bridge contract，并明确它与 hosts.* control plane 的边界
- manifest/runtime 测试锁定 transport available/unavailable 时的行为，而不是继续依赖 ad-hoc callback 约定
- 文档明确：本 slice 收口 transport contract，不等于多 remote host discovery 或最终生产 transport 实现

## 工作总结

### 实现了什么
- 将 remote exec/probe 从 injectable callback 收口为 remoteTransport bridge contract
- 补齐 transport available/unavailable 退化诊断并保持 remote host record 可见
- 增加并通过 remote transport contract 用例，覆盖 hosts.list/get/connect 与 host.exec 行为
- 同步 migration matrix，明确 ISSUE-127 收口边界与剩余 gap

### 实际跑了什么检查
- bun run test -- apps/mv3-shell/test/manifest.spec.ts
- ./node_modules/.bin/biome check apps/mv3-shell/src/background.ts apps/mv3-shell/src/runtime-services.ts apps/mv3-shell/test/manifest.spec.ts docs/legacy-to-vnext-migration-matrix.md
- bun run check（未通过，见下方风险）

### 残留风险
- repo 级 bun run check 受 write_scope 外的现有类型错误阻塞（contracts/core/kernel/site-runtime 等）

## 相关 commits

- `4c3dcb5d0b2c` feat(mv3-shell): 收口远端传输契约并补齐退化诊断
