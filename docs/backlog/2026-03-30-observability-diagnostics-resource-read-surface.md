---
id: ISSUE-063
title: "observability: diagnostics resource read surface"
status: done
priority: p2
source: review
created: 2026-03-30
assignee: codex-019d3d46
tags:
  - review
  - follow-up
  - observability
  - plugin-mainline-correction
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
acceptance_ref: docs/ai-surface-index.md
check_cmd: "bun run check"
---

## Goal

把 observability: diagnostics resource read surface 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- AI surface has actions for diagnostics but no resource read surfaces for runtime summary
- audit tail summary
- config summary

## Acceptance

- Resource surface types defined in contracts for runtime/audit/config summaries
- At least one resource surface implemented and tested

## Impact Note

- northbound surface：在 `packages/contracts` / `packages/core` 新增轻量 resource ids 与 typed resource documents，明确 `runtime.summary`、`config.summary`、`skills.summary`、`hosts.summary`、`audit.tail` 不属于 action catalog，但属于统一 AI surface。
- 影响消费者：聊天 Agent / Skill / UI / bridge 现在可以共享同一套 summary/audit payload type 与 builder，不必把 `runtime.capture_diagnostics` 或 `runtime.bootstrap` 当作资源真相源。
- 文档同步：已更新 `docs/ai-surface-index.md`、`docs/agent-bootstrap-context-pack.md`、`docs/migration-parity-dashboard.md`、`docs/legacy-to-vnext-migration-matrix.md`；已检查 `docs/cutover-readiness-criteria.md` 与 `docs/module-tracking-ledger.json`，当前口径无需额外改动。

## 工作总结

- 在 `packages/contracts` 上提 bootstrap summary / audit resource payload 类型，并新增轻量 resource ids 与 resource document contract，明确 action / resource 边界。
- 在 `packages/core` 新增 `createBootstrapSummaryResources()`、`createRuntimeSummaryResource()`、`createConfigSummaryResource()`、`createSkillsSummaryResource()`、`createHostsSummaryResource()`、`createAuditTailResource()`，让 runtime/config/skills/hosts summary 与 audit tail 有 package-owned builder，而不是只停在 app bridge 私有读面。
- Doc Freshness Gate：
  - 已更新 `docs/ai-surface-index.md`
  - 已更新 `docs/agent-bootstrap-context-pack.md`
  - 已更新 `docs/migration-parity-dashboard.md`
  - 已更新 `docs/legacy-to-vnext-migration-matrix.md`
  - 已检查 `docs/cutover-readiness-criteria.md`
  - 已检查 `docs/module-tracking-ledger.json`
- 实际检查：
  - `bun run typecheck`
  - `bunx biome check packages/contracts/src/index.ts packages/contracts/test/contracts.spec.ts packages/core/src/index.ts packages/core/test/core.spec.ts docs/ai-surface-index.md docs/migration-parity-dashboard.md docs/legacy-to-vnext-migration-matrix.md docs/agent-bootstrap-context-pack.md`
  - `bun run test -- packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts`
  - `bun run check`（仓库级 lint 仍被 write scope 外既有 Biome 问题阻塞：`package.json`、`biome.json`、`vitest.config.ts`、各 package `package.json`、`.agents/skills/**`、`apps/mv3-shell/manifest.json`）
  - `bun run workflow:queue:build`
- 残留风险：
  - 当前只是轻量 resource contract + builder；统一 northbound resource registry 与 app integration path 仍未收口。
  - 仓库级 `bun run check` 目前不能全绿，仍受全局 Biome 基线漂移影响。

## 相关 commits

- `882598e` `feat(observability): add resource summary contracts`
