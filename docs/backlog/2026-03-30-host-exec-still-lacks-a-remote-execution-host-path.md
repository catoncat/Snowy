---
id: ISSUE-073
title: "Review: host.exec still lacks a remote execution host path"
status: open
priority: p1
source: "current plan expansion 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - host
  - remote-host
  - js-runner
  - mv3-shell
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-js-runner
parallel_group: js-runner
depends_on:
  - ISSUE-067
write_scope:
  - packages/js-runner/src/index.ts
  - packages/js-runner/test/js-runner.spec.ts
  - apps/mv3-shell/src/offscreen.js
  - apps/mv3-shell/src/runtime-services.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
---

## Goal

把 host.exec still lacks a remote execution host path 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- 默认 offscreen local adapter 只覆盖 read/write/edit，browser-only context 下的 host.exec 仍没有真实成功路径
- 迁移矩阵已明确 remote host path 是独立 gap；如果不单独跟踪，host.exec 会长期停在 contract-only 状态
- 在 app-local truth 与 kernel-centered integration 收口后，execution host 仍需要一条 package-owned remote path 才能支撑真正的 exec 能力

## Acceptance

- host.exec 至少能通过一条 remote/default host path 成功执行，不再依赖 browser-only local adapter 或结构化 not-supported 错误作为常态
- local 与 remote host 的路由、错误模型和默认选择规则被显式锁定，并与现有 hosts.* control plane 一致
- 测试与文档明确：browser-only local adapter 继续承担读写编辑，真实 exec 由 remote host path 提供
