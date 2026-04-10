---
id: ISSUE-119
title: "Review: execution host control plane still assumes a single local/offscreen host"
status: open
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - review
  - execution-host
  - remote-host
  - offscreen
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
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
---
## Goal

Review the remaining execution-host control-plane gap after remote-exec plumbing landed, especially around multi-host and remote-host semantics.

## Review Finding

- Remote exec adapter plumbing and offscreen integration are landed, but ISSUE-073 explicitly left multi-host control-plane semantics and concrete remote transport out of scope.
- Current hosts/runtime wiring still effectively assumes one local/offscreen host, so remote execution remains injectable plumbing more than a managed execution-host surface.
- Without a fresh review, `execution-host-bridge` can look more complete than the actual host selection, health, and control-plane semantics support.

## Acceptance

- Decide the minimal vNext boundary for multi-host and remote-host management in the current phase.
- Either create follow-up slices for host selection/control-plane semantics or document explicit deferment and module-status rationale.
- Distinguish landed remote-exec plumbing from true execution-host control-plane parity.

## Resolution

- 对照 `packages/contracts` / `packages/core` 与 MV3 runtime 代码后，可以确认 northbound model 本身并不局限于单 host：contract 已支持 `ExecutionHostKind = "local" | "remote"`，core 侧 host snapshot / default-host 纯函数也支持多 host record。
- 但当前真正运行中的 `apps/mv3-shell` control plane 仍把 host identity 收窄成单一 `local`：
  - `background.ts` 的 `resolveHostId()` 直接拒绝任何非 `local` 的 host id；
  - `hosts.list/get/connect/disconnect/health` 只会返回或操作 `describeLocalHost()`；
  - `host.exec` 虽可经 offscreen composite adapter 走 remote exec path，但成功结果中的 `hostId` 仍沿用 `local`，remote host 不是可被列举、选择、健康检查或默认化的控制面实体。
- 因此当前阶段的最小边界应明确为：
  1. `hosts.*` control plane 目前只管理 **single local/offscreen host**；
  2. remote exec adapter 只是 `host.exec` 的 substrate-level injectable transport；
  3. 这**不等于** remote-host / multi-host control-plane parity 已完成。
- 为避免 `execution-host-bridge` 被误判为“已完成 remote host 管理”，本轮新增 follow-up：
  - `ISSUE-125` `Follow-up: execution host control plane still lacks first-class remote host records`

## Sub Issues

- `ISSUE-125` `Follow-up: execution host control plane still lacks first-class remote host records`
  - 原因：把当前“remote exec 可注入，但 remote host 仍借用 local identity”的 gap 收敛成单独可执行 slice。
  - 结果：后续明确收口 remote host record、host selection/default routing、以及 control-plane 与 substrate 语义对齐，而不是继续把 remote success 计入 `local` host。
