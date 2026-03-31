---
id: ISSUE-070
title: "observability: unify audit.tail and cover config/skill lifecycle changes"
status: done
priority: p1
source: "next-batch planning 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - observability
  - audit
  - plugin-mainline-correction
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on:
  - ISSUE-066
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/src/runtime-services.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
---

## Goal

把 observability: unify audit.tail and cover config/skill lifecycle changes 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- observability-audit 模块当前没有 open issue，形成 module coverage gap。
- canonical audit contract 仍是 host-only，装不下 config.update 与 staged skills lifecycle 事件。
- app 侧仍以 audit.host / audit.intervention 分叉读面暴露状态，没有形成统一 audit.tail 真相源。

## Acceptance

- audit.tail 扩成统一 control-plane audit contract，至少覆盖 hosts.*、config.update 与 staged skills lifecycle 事件。
- MV3 shell 的 config.update 与已接入的 skills lifecycle 会写入同一条 audit tail。
- app integration 提供单一 audit.tail 读路径或资源文档，现有私有 audit.* 读面不再是主真相源。
- 测试锁住持久化、sessionId 关联和 tail 顺序稳定。

## Sub Issues

- `ISSUE-081` `Follow-up: workflow queue builder output is not biome-stable`

## Impact Note

- northbound surface：`packages/contracts` / `packages/core` 的 `audit.tail` 已从 host-only entry 扩成 control-plane audit contract；`apps/mv3-shell` 现在把 `config.update`、`skills.install/enable/disable/uninstall` 与 `hosts.*` 统一写入同一条 audit tail，并公开 `audit.tail` 作为主读路径。
- 影响消费者：聊天 Agent / Skill / UI / bridge 侧读面现在可以共享同一份 `audit.tail` resource document；MV3 shell 不再需要把 host audit 当成单独真相源，skills/config 变更也不再游离在 audit 外。
- 文档同步：已更新 `docs/ai-surface-index.md`、`docs/agent-bootstrap-context-pack.md`、`docs/legacy-to-vnext-migration-matrix.md`、`docs/migration-parity-dashboard.md`、`docs/cutover-readiness-criteria.md`；已检查 `docs/module-tracking-ledger.json`，当前无需改动。

## 工作总结

- 在 `packages/contracts` 把 `audit.tail` 从 host-only payload 扩成最小 control-plane audit contract，新增 config / skills / control-plane audit vocabulary，并保留 host audit entry 作为 union 成员。
- 在 `packages/core` 让 `createAuditTailResource()` 接受统一 control-plane audit entries，并补测试锁住 mixed entries 的 resource payload。
- 在 `apps/mv3-shell/src/runtime-services.js` 增加最小 in-memory skill manager，让 `skills.install/enable/disable/uninstall` 通过真实 app integration path 进入 runtime capability dispatch，而不是只停留在 package 测试里。
- 在 `apps/mv3-shell/src/background.js` 把 `audit.tail` 变成主读路径：`config.update`、`skills.*` lifecycle 与 `hosts.*` 现在共用同一条 persisted audit tail；`audit.host` 只保留为 host-only compatibility alias。
- `runtime.bootstrap` 现在会读取 composed runtime session，并从 runtime skill records 生成更可靠的 skills summary / recentChange，不再把 sessionId 静默丢掉。
- Doc Freshness Gate：
  - 已更新 `docs/ai-surface-index.md`
  - 已更新 `docs/agent-bootstrap-context-pack.md`
  - 已更新 `docs/legacy-to-vnext-migration-matrix.md`
  - 已更新 `docs/migration-parity-dashboard.md`
  - 已更新 `docs/cutover-readiness-criteria.md`
  - 已检查 `docs/module-tracking-ledger.json`
- 实际检查：
  - `bun test packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts apps/mv3-shell/test/manifest.spec.ts`
  - `bun run typecheck`
  - `bun run check`

## 相关 commits

- `eec6f04` `feat(observability): unify audit tail control plane`
