---
id: ISSUE-165
title: "Follow-up: execution host control plane still lacks operation-aware host capability summaries"
status: open
priority: p1
source: "ISSUE-160 review 2026-04-17"
created: 2026-04-17
assignee: unassigned
tags:
  - review
  - execution-host
  - local-host
  - control-plane
  - cutover
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: follow-up
kind: slice
epic: EPIC-execution-host
parallel_group: js-runner
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/migration-parity-dashboard.md
  - docs/legacy-to-vnext-migration-matrix.md
acceptance_ref: docs/migration-parity-dashboard.md
check_cmd: "bun run check"
---

## Goal

把 local offscreen host 的 file-only 边界与 exec-capable host 选择语义收口成可执行的 control-plane slice，避免 execution host product cutover 继续把 local/remote host 视为同质默认目标。

## Review Finding

- 当前 local offscreen host 在 runtime 上已明确只支持 read/write/edit，host.exec 需要 remote host path；但 hosts.list/get/summary 仍只暴露 kind/state/default/health，看不出 local host 是 file-only、remote host 才是 exec-capable。
- 因此一旦 defaultHostId=local，operator 只能在 host.exec 运行时报 operation_not_supported 才知道选错 host；exec parity 仍停留在错误后发现，而不是 control-plane 的 first-class 语义。
- ISSUE-125/126/127/134/157 已收口 remote exec、health、transport config 与 multi-remote rehydrate；当前 execution-host-bridge 保持 partial 的更窄原因，已转为 capability-aware host summary/default routing，而不是继续泛指 local adapter 缺 exec。

## Acceptance

- hosts.summary/hosts.get 至少能表达每个 host 的操作能力边界（至少区分 file ops 与 exec 支持），让 local/browser-only host 的 file-only 语义对 operator 可见
- default host / host.exec 路由能基于一等 control-plane 语义区分 exec-capable host 与 file-only local host，不再只能依赖 operation_not_supported 事后暴露边界
- 文档与测试同步锁定 execution-host 的 cutover boundary：local offscreen host 保留 browser-only file adapter，true exec parity 由 exec-capable host path 承担
