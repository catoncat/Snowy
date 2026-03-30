---
id: ISSUE-041
title: "Review: intervention and human handoff surface is still undecided"
status: done
priority: p1
source: "browser automation follow-up planning 2026-03-29"
created: 2026-03-29
assignee: codex-019d3d46
tags:
  - review
  - site-runtime
  - automation
  - intervention
  - human-handoff
  - plugin-mainline-correction
module_id: intervention-handoff
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on:
  - ISSUE-036
write_scope:
  - docs/
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

明确 intervention / human handoff 能力在 vNext 的产品主链位置，判断它应作为 browser automation cutover 前必需面、可后置能力，还是只保留 workflow 层约定。

## Review Finding

- `docs/legacy-to-vnext-migration-matrix.md` 把 interventions / human handoff 标为 `not-started`，且仍未决定其主链位置。
- 对 browser automation 来说，intervention 既关系到失败恢复，也关系到用户确认与控制权交接；如果边界不先裁定，后续容易把 UI 私有流程与 AI Surface 混在一起。
- 当前仓强调 AI-native control plane、少量强原语与 audit/confirm 语义，因此 intervention 是否升格为正式能力面，需要先有明确 review 结论。

## Acceptance

- 明确 intervention / human handoff 在 cutover 前的地位：
  - 必需
  - 可后置
  - 或仅保留 workflow 约定
- 明确它与 confirm gate、audit、browser automation failure path 的关系。
- 若结论要求新增正式 capability 或 product control plane surface，必须拆出明确 follow-up issue。
- 文档结论与 locked decisions、AI Surface 设计和 migration matrix 口径一致。

## Impact Note

- northbound surface：不新增新的 public capability namespace；改为在 `packages/contracts` 定义通用 `InterventionRequest` contract，并让 `packages/site-runtime` 以 `SiteInvocationResult.intervention` 暴露最小 runtime handoff。
- 影响消费者：kernel / MV3 app / UI 后续需消费 `intervention` request 并补 lifecycle；聊天 Agent / Skill runtime 的高风险 pre-dispatch 确认继续走 core confirm gate，不与 intervention 混成一套 action。
- 文档同步：已更新 `docs/ai-native-capability-surface-design.md`、`docs/ai-surface-index.md`、`docs/browser-automation-cutover-boundary.md`、`docs/cutover-readiness-criteria.md`、`docs/legacy-to-vnext-migration-matrix.md`、`docs/migration-parity-dashboard.md`、`docs/screenshot-download-surface-boundary.md`、`docs/agent-bootstrap-context-pack.md`、`docs/reviews/2026-03-30-plugin-mainline-correction-control.md`；已检查 `docs/module-tracking-ledger.json`，当前口径无需改动。

## Sub Issues

- `ISSUE-068` `Follow-up: intervention request lifecycle is not yet integrated through kernel and mv3-shell`

## 工作总结

- 结论已锁定：intervention / human handoff 是 browser automation cutover 前必需，但当前不升格为新的 public capability family，也不留在 UI 私有流程；它先落在 `kernel/site-runtime` 之间的 runtime handoff contract。
- 在 `packages/contracts` 新增 `InterventionRequest`、kind/trigger vocabulary 与 `E_INTERVENTION_REQUIRED` 错误码；在 `packages/site-runtime` 新增 action-level intervention policy 和 `SiteInvocationResult.intervention`，让 verify failure / runtime blocked 能返回结构化 handoff request。
- 补了 site-runtime tests，锁定两条主链：
  - verifier failed -> structured takeover request
  - runtime blocked -> structured input request
- Doc Freshness Gate：
  - 已更新 `docs/ai-native-capability-surface-design.md`
  - 已更新 `docs/ai-surface-index.md`
  - 已更新 `docs/browser-automation-cutover-boundary.md`
  - 已更新 `docs/cutover-readiness-criteria.md`
  - 已更新 `docs/legacy-to-vnext-migration-matrix.md`
  - 已更新 `docs/migration-parity-dashboard.md`
  - 已更新 `docs/screenshot-download-surface-boundary.md`
  - 已更新 `docs/agent-bootstrap-context-pack.md`
  - 已更新 `docs/reviews/2026-03-30-plugin-mainline-correction-control.md`
  - 已检查 `docs/module-tracking-ledger.json`
- 实际检查：
  - `bun run typecheck`
  - `bunx biome check packages/contracts/src/index.ts packages/contracts/test/contracts.spec.ts packages/core/src/index.ts packages/site-runtime/src/index.ts packages/site-runtime/test/site-runtime.spec.ts docs/ai-native-capability-surface-design.md docs/ai-surface-index.md docs/browser-automation-cutover-boundary.md docs/cutover-readiness-criteria.md docs/legacy-to-vnext-migration-matrix.md docs/migration-parity-dashboard.md docs/agent-bootstrap-context-pack.md docs/reviews/2026-03-30-plugin-mainline-correction-control.md docs/screenshot-download-surface-boundary.md docs/backlog/2026-03-30-intervention-request-lifecycle-is-not-yet-integrated-through-kernel-and-mv3-shell.md`
  - `bun run test -- packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts packages/site-runtime/test/site-runtime.spec.ts`
  - `bun run check`（仓库级 lint 仍被 write scope 外既有 Biome 问题阻塞：`package.json`、`biome.json`、`vitest.config.ts`、各 package `package.json`、`.agents/skills/**`、`packages/skill-sdk/**`、`.codex/hooks/workflow-ticket.test.ts`）
  - `bun run workflow:queue:build`
- 残留风险：
  - intervention request 目前还是 package-local result，尚未进入 kernel / MV3 / diagnostics / audit 主链；由 `ISSUE-068` 继续收口。
  - core confirm gate 仍是最小 boolean callback；未来若要统一 request/resolve lifecycle，需在不打破现有 permission gate 的前提下上提到 kernel 层。

## 相关 commits

- `ce57792` `docs(backlog): add plugin mainline correction gates`
- `657c8d2` `feat(site-runtime): formalize intervention handoff contract`
