---
id: ISSUE-160
title: "Review: local execution host cutover still lacks first-class exec parity"
status: open
priority: p1
source: "next-batch-planner review 2026-04-17"
created: 2026-04-17
assignee: unassigned
tags:
  - review
  - execution-host
  - local-host
  - cutover
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
  - apps/mv3-shell/src/runtime-services.ts
  - docs/migration-parity-dashboard.md
  - docs/legacy-to-vnext-migration-matrix.md
acceptance_ref: docs/migration-parity-dashboard.md
check_cmd: "bun run check"
---

## Goal

在 remote host record、production transport config 与 multi-remote rehydrate 已落地后，重新锚定 execution-host-bridge 的真实剩余 gap，尤其是本地 offscreen host 的 exec parity 与 product cutover 边界。

## Review Finding

- migration parity dashboard 仍把 local execution host adapter 标成 yellow，并指出 broader execution-host cutover 未完成，但当前 backlog 已没有 live issue 继续承接 local host exec parity 的剩余范围。
- 如果不重新落票，execution-host-bridge 会继续停留在 remote host follow-up 已完成、但 local host 与 broader cutover 剩余范围无人认领的 partial 状态。

## Acceptance

- 明确本地 offscreen host 还缺哪些 first-class exec parity / diagnostics / control-plane 语义，并同步回 parity docs。
- 若当前 yellow 只剩文档口径或 cutover boundary 问题，则把剩余范围显式写清；若仍有可执行 gap，则拆成更窄的 implementation slice。
