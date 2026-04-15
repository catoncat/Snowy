---
id: ISSUE-134
title: "Review: execution host still lacks a production remote transport configuration path"
status: open
priority: p1
source: "next-batch-planner review 2026-04-15"
created: 2026-04-15
assignee: unassigned
tags:
  - review
  - execution-host
  - remote-host
  - transport
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

在 remote host record、probe-backed health 与 bridge transport contract 已落地后，明确 execution-host 模块下一步是 production transport configuration、host discovery，还是显式继续 deferred。

## Review Finding

- ISSUE-125/126/127 已把 remote host 从 injectable plumbing 收口到 first-class record + probe + bridge contract，但 migration docs 仍明确保留 concrete production transport config 与 multi remote host discovery/parity 作为剩余 gap。
- 当前 remote transport 仍依赖构造期注入，没有仓库内的生产配置/选择/诊断入口，因此 execution-host-bridge 继续保持 partial。
- 如果不重新落票，remote host 会停留在测试和 bridge 契约都具备、但运营配置路径无人承接的状态。

## Acceptance

- 明确 production remote transport configuration 与 multi-host discovery 中，哪一块是下一条 executable slice，哪一块继续 deferred。
- 若继续实现，follow-up 必须锚定 hosts.* control plane 与 remote transport contract 的边界，而不是把语义重新塞回 app-local glue。
- planning docs 与 migration docs 同步记录 ISSUE-127 之后的真实剩余 gap，避免 execution-host 状态继续停留在笼统 partial。
