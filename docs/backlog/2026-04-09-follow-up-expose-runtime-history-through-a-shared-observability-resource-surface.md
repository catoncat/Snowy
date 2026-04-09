---
id: ISSUE-122
title: "Follow-up: expose runtime history through a shared observability resource surface"
status: done
priority: p1
source: "ISSUE-115 review 2026-04-09"
created: 2026-04-09
assignee: codex-019d70f6
tags:
  - review
  - follow-up
  - observability
  - diagnostics
  - audit
  - runtime-history
  - debug-export
module_id: observability-audit
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on:
  - ISSUE-115
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
completed_at: 2026-04-09T12:18:24.002Z
---

## Goal

Define the minimal shared runtime-history read surface for operators so recent run/step visibility no longer depends on MV3-private helpers, while bulk debug export remains explicitly deferred.

## Review Finding

- `audit.tail` and `audit.intervention` already exist as shared resources, and `runtime.capture_diagnostics` already covers the latest snapshot, but recent runtime history still lacks a shared `contracts/core` resource id.
- `apps/mv3-shell` currently special-cases `loop.telemetry` inside background read routing, which means recent run/step visibility is available only through an app-private branch instead of the canonical AI-surface registry.
- sidepanel management hard-coded subsets are a separate consumer-projection problem tracked elsewhere; the narrower gap here is the missing runtime-history/export contract itself.

## Acceptance

- Recent run/step history is exposed through a shared `contracts/core` resource contract (or an explicitly documented equivalent), not only through MV3-private `loop.telemetry` handling.
- `runtime.capture_diagnostics` remains the latest snapshot entrypoint, while bulk debug export / dump semantics stay explicitly deferred unless this slice can lock them without app-local glue.
- MV3 background read path and tests use the shared runtime-history contract, and the review no longer relies on background-private helper names as truth.

## 工作总结

### 实现了什么
- 在 contracts/core 增加 shared runtime.history resource contract 与 builder，让 recent loop/run history 进入 canonical AI-surface resource registry。
- background 的 resource.read 现在通过 shared runtime.history 返回历史视图，并把旧的 loop.telemetry 分支降为兼容 alias 而不再作为真相源。
- runtime-chat 与 contracts/core 回归测试改为走 runtime.history，锁住 shared resource 读面。

### 实际跑了什么检查
- bunx vitest run apps/mv3-shell/test/runtime-chat.spec.ts --testNamePattern=records loop telemetry into runtime.history and audit.tail for tool executions
- bunx vitest run packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts
- ./node_modules/.bin/biome check packages/contracts/src/index.ts packages/contracts/test/contracts.spec.ts packages/core/src/index.ts apps/mv3-shell/src/background.ts apps/mv3-shell/test/runtime-chat.spec.ts
- git diff --check

### 残留风险
- bulk debug export / dump 语义仍显式 deferred；sidepanel consumer projection 仍由 ISSUE-117 单独跟踪。

## 相关 commits

- `49a916c38d39` feat(observability): 暴露shared runtime history资源
