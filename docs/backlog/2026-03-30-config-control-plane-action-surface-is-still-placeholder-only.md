---
id: ISSUE-055
title: "Review: config control-plane action surface is still placeholder-only"
status: done
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
  - docs/cutover-readiness-criteria.md
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

## Impact Note

- northbound surface：新增 public `config.update` action，并把 `config` 提升为正式 public capability namespace；`runtime.bootstrap` 的 `config` summary 也从 placeholder-only 变成与 mutation path 同结构的读面。
- 影响消费者：聊天 Agent / Skill runtime 可以通过 `config.update` 走统一 control plane；MV3 bootstrap/bridge、未来 UI 与 system 投影都复用同一条 `config` 语义面。
- 文档同步：已更新 `docs/ai-surface-index.md`、`docs/agent-bootstrap-context-pack.md`、`docs/migration-parity-dashboard.md`、`docs/cutover-readiness-criteria.md`；`docs/legacy-to-vnext-migration-matrix.md` 已检查，当前口径无需额外改动。

## Sub Issues

- `ISSUE-056` `Review: skill lifecycle control-plane actions are not exposed beyond invoke/list`

## 工作总结

- 在 `packages/contracts` / `packages/core` 新增最小 `config.update` action contract，并把 `config` 纳入 public capability namespace 与 builtin catalog。
- 在 `apps/mv3-shell/src/background.js` 新增 `config.update` 路由、结构化 patch 校验与内存态 config summary；`runtime.bootstrap` 现在返回与 mutation path 对齐的 `config` 读面，不再停留在 placeholder-only contract。
- Doc Freshness Gate：
  - 已更新 `docs/ai-surface-index.md`
  - 已更新 `docs/agent-bootstrap-context-pack.md`
  - 已更新 `docs/migration-parity-dashboard.md`
  - 已更新 `docs/cutover-readiness-criteria.md`
  - 已检查 `docs/legacy-to-vnext-migration-matrix.md`，现有描述已覆盖本次落地
- 实际检查：
  - `bun run typecheck`
  - `bunx @biomejs/biome check packages/contracts/src/index.ts packages/contracts/test/contracts.spec.ts packages/core/src/index.ts packages/core/test/core.spec.ts apps/mv3-shell/src/background.js apps/mv3-shell/test/manifest.spec.ts`
  - `bun run test -- packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts apps/mv3-shell/test/manifest.spec.ts`
  - `bun run check`（仓库级 lint 仍被 write scope 外既有 Biome 问题阻塞：`package.json`、`biome.json`、`vitest.config.ts`、各 package `package.json`、`.agents/skills/**`）
- 残留风险：
  - `skills.*` lifecycle control plane 仍未落地，由 `ISSUE-056` 继续收口。
  - 仓库级 `bun run check` 目前不能全绿，需后续单独清理全局 Biome 噪音。

## 相关 commits

- `22d92e8` `feat(control-plane): add config update action`
