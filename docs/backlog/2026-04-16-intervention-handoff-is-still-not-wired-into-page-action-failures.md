---
id: ISSUE-152
title: "Review: intervention handoff is still not wired into page action failures"
status: done
priority: p1
source: review
created: 2026-04-16
assignee: sable
tags:
  - review
  - intervention
  - handoff
module_id: intervention-handoff
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-intervention
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
completed_at: 2026-04-17T09:26:11Z
---

## Goal

把 intervention handoff is still not wired into page action failures 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- Cutover criteria still list intervention lifecycle integration as an unfinished Tier 1 gap for production browser automation paths.
- Current intervention primitives exist, but page query click and fill failures are not yet formalized as shared handoff requests with preserved runtime context.

## Acceptance

- Site runtime can convert page.query page.click and page.fill production failures into structured intervention requests with tab and action context
- Intervention requests round-trip through the shared handoff surface without losing verifier trace or session context
- Tests cover failure-to-intervention behavior for query click and fill paths

## 工作总结

### 实现了什么
- 在 `packages/site-runtime` 为 production `bbl.page` 的 `query` / `click` / `fill` 路径补了 implicit takeover handoff policy；这样 page action 的 verify/runtime failure 会直接进入 shared intervention request contract，而不需要新增 app-local glue。
- 保持现有 MV3 runtime-services / kernel handoff 主链不变：page action 一旦拿到 `intervention` 结果，仍由既有 `kernel.requestIntervention(session.id, ...)` 负责挂上 session context 并进入 shared lifecycle。
- 补齐 site-runtime 定向测试，分别锁住 `page.query` / `page.click` 的 `verify_failed` handoff，以及 `page.fill` 的 `runtime_blocked` handoff。

### 实际跑了什么检查
- `bun run test -- packages/site-runtime/test/site-runtime.spec.ts`
- `./node_modules/.bin/biome check packages/site-runtime/src/index.ts packages/site-runtime/test/site-runtime.spec.ts`
- `bun run check`（失败：write scope 外 `packages/core/test/core.spec.ts` 仍有既有类型错误，当前报错集中在 649/656/660/662 行对 `entries` 的联合类型访问）

### 残留风险
- 本次未执行 `workflow:done` / queue rebuild：canonical workspace 中 `docs/workflow/live-queue.json` 与 backlog 控制文件已有并行改动，且 live lease 仍由其他 session 持有；若直接重建 queue，会把当前并行 workflow 状态一并改写。
- page action -> shared handoff 的 session round-trip 沿用既有 runtime-services / kernel 路径；本次没有进入正在并行修改的 MV3 测试文件，避免与 `ISSUE-157` 发生写冲突。

## 相关 commits

- `7642bfe` `fix(site-runtime): 接通页面动作接管请求`
