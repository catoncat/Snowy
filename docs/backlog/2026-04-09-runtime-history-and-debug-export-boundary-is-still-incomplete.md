---
id: ISSUE-115
title: "Review: runtime history and debug export boundary is still incomplete"
status: done
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: codex-019d70f6
tags:
  - review
  - observability
  - diagnostics
  - audit
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
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/sidepanel/management.ts
  - apps/mv3-shell/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
completed_at: 2026-04-09T12:12:46.614Z
---

## Goal

Review the remaining operator-facing observability boundary after level-1 diagnostics landed, especially around runtime history and debug export semantics.

## Review Finding

- Level-1 runtime debug snapshot, audit tail, intervention audit, and loop telemetry now exist, but there is still no explicit runtime-history / export contract for inspecting recent runs beyond the latest summary.
- Sidepanel management currently hard-codes `runtime/config/skills/hosts` summaries and does not consume audit or intervention resources as part of a shared operator surface.
- Without a clear export/read boundary, observability can drift between background-private helpers, diagnostics payloads, and UI-specific state.

## Acceptance

- Clarify the minimal operator-facing runtime history / export surface for the current phase, whether as resources, actions, or explicit deferral.
- If gaps remain, create follow-up slices anchored on shared `contracts/core/background` paths rather than app-local one-offs.
- Keep the distinction clear between the landed level-1 diagnostics snapshot and broader observability scope.

## Resolution

- Reviewed the current observability read boundary across `packages/contracts`, `packages/core`, `apps/mv3-shell/src/background.ts`, and sidepanel management bootstrap consumers.
- Conclusion: the narrow remaining mainline gap is not “observability in general”, but the lack of a shared runtime-history contract. `audit.tail` / `audit.intervention` already cover audit resources, and `runtime.capture_diagnostics` already covers the latest snapshot, while recent run/step visibility still leaks through the MV3-private `loop.telemetry` branch.
- Minimal current-phase direction: promote recent runtime history into a shared resource contract and keep bulk debug export / dump semantics explicitly deferred until they can be locked without app-local glue.

## Sub Issues

- `ISSUE-122` `Follow-up: expose runtime history through a shared observability resource surface`
  - 原因：把剩余缺口收窄为 shared runtime-history resource contract，避免把 `loop.telemetry` 的 background 私有分支继续当成 operator-facing 真相源。
  - 结果：后续 slice 聚焦 `contracts/core/background/test`，而 sidepanel consumer projection 继续由已有的 ISSUE-117 单独跟踪。

## 工作总结

### 实现了什么
- 审查当前 observability operator-facing 读面，确认 audit.tail / audit.intervention 与 runtime.capture_diagnostics 已落地，但 recent run/step history 仍缺 shared contract。
- 新增 ISSUE-122，把剩余缺口收窄为 shared runtime-history resource surface，并明确 bulk debug export 继续 deferred。

### 实际跑了什么检查
- bun run workflow:queue:build
- git diff --check

### 残留风险
- bulk debug export / dump 语义仍属后续范围；本票只锁当前阶段的 runtime-history resource 边界。

## 相关 commits

- `c0a8fa678c27` docs(observability): 收口runtime-history review并补follow-up
