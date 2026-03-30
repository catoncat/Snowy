---
id: ISSUE-055
title: "Review: config control-plane action surface is still placeholder-only"
status: in-progress
priority: p1
source: "ISSUE-054 ai-surface control-plane follow-up 2026-03-30"
created: 2026-03-30
assignee: codex-019d3c89
tags:
  - review
  - core
  - ai-surface
  - control-plane
  - config
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: follow-up
kind: slice
epic: EPIC-contracts-core
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/agent-bootstrap-context-pack.md
  - docs/ai-surface-index.md
  - docs/legacy-to-vnext-migration-matrix.md
  - docs/migration-parity-dashboard.md
  - docs/backlog/README.md
  - docs/backlog
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
claimed_at: 2026-03-30T02:34:41.204Z
---

## Goal

把 config.* 从 bootstrap placeholder 提升为明确的 public control-plane slice，并锁定最小 action/resource 边界。

## Review Finding

- AI surface 设计已把 config.* 列为 product control-plane namespace，但当前代码只有 config bootstrap summary placeholder，没有对应 action namespace。
- packages/core/src/index.ts 与 apps/mv3-shell/src/background.js 仍把 config 标成 placeholder contract。
- 如果不先定义 config.update 的最小 contract，后续模型、权限与自动化配置仍会散落在文档和实现细节里。

## Acceptance

- 存在最小 config.* public action set，并以 config.update 作为 vNext 的 canonical mutation 入口。
- config bootstrap summary 与 config mutation path 保持同一套字段边界，不把 UI 步骤重新建模成 capability。
- 若 public capability namespace 或 builtin catalog 变化，同步更新 docs 和 tests。
