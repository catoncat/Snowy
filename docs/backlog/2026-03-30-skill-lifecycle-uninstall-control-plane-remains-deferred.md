---
id: ISSUE-069
title: "Review: skill lifecycle uninstall control-plane action remains deferred"
status: done
priority: p1
source: "ISSUE-056 staged subset follow-up 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - core
  - ai-surface
  - control-plane
  - skills
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: follow-up
kind: slice
epic: EPIC-contracts-core
parallel_group: contracts-core
depends_on:
  - ISSUE-056
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - docs/ai-surface-index.md
  - docs/skill-lifecycle-version-engine-boundary.md
  - docs/skill-runtime-site-capability-redesign-2026-03-29.md
  - docs/backlog
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

把 `skills.uninstall` 的 northbound action 语义补齐，并和 archive、物理删除、版本回滚边界统一。

## Review Finding

- `skills.install/enable/disable` 已可作为 staged subset 落地，但 `skills.uninstall` 仍缺少明确 contract。
- 当前 lifecycle engine 只有 `archived` 状态，并未定义 northbound uninstall 到底代表 archive、remove package，还是删除某个 installed version。
- 旧设计里 `installed` 语义已绑定 `mem://skills/...` 写入成功；若直接暴露 uninstall，必须先明确它对 BrowserVFS、trusted version 选择和 rollback 的影响。

## Acceptance

- 明确 `skills.uninstall` 是 archive、remove package、remove installed version，还是两阶段动作。
- 若新增 public action，contracts/core/docs/test 同步收口，并保证与 lifecycle/version engine contract 一致。
- `docs/ai-surface-index.md` 与 lifecycle 边界文档说明 uninstall 的最终口径，不再和 archive/rollback 混用。

## Impact Note

- 影响的 northbound surface：`skills.uninstall` public action、`ctx.skills.uninstall()` facade、typed builtin capability map。
- 影响的消费者：聊天 Agent、Skill runtime、后续接入同一 control plane 的 UI / MCP 消费者。
- 控制面文档同步：需要，已同步 `docs/ai-surface-index.md` 与 lifecycle 边界文档。

## 工作总结

- 在 `packages/contracts` / `packages/core` 补齐 `skills.uninstall`，并把 northbound 语义锁定为“从 active product skill library 归档到 `archived`”。
- `skills.uninstall` 不表示物理删除 `mem://skills/...` 包内容，也不表示清空 `@versions` 历史；相关口径已同步到 lifecycle / runtime 设计文档。
- `ctx.skills` helper、builtin catalog、typed capability facade 与对应测试已同步覆盖 uninstall。
- Doc Freshness Gate 已检查 `docs/agent-bootstrap-context-pack.md`、`docs/module-tracking-ledger.json`、`docs/legacy-to-vnext-migration-matrix.md`、`docs/migration-parity-dashboard.md`、`docs/cutover-readiness-criteria.md`；这些文档未声明该 action 或 cutover 状态，无需同步。
- 已运行：
  - `bun run test -- packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts`
  - `bun run typecheck`
  - `bunx biome check packages/contracts/src/index.ts packages/contracts/test/contracts.spec.ts packages/core/src/index.ts packages/core/test/core.spec.ts`
  - `bun run check`（失败于仓内既有、与本 issue 无关的 Biome formatting / import debt）
- 残留风险：本次只锁定 northbound contract 与 facade；具体 runtime skill manager 如何把 uninstall 落成 archive 执行，仍依赖后续 engine/runtime 接线。

## 相关 commits

- `fe92865 feat(core): add skills uninstall control plane`
