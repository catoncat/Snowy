---
id: ISSUE-102
title: "Follow-up: add level-1 runtime debug snapshot to observability surface"
status: done
priority: p1
source: "next-batch planning 2026-04-09"
created: 2026-04-09
assignee: codex-019d700a
tags:
  - observability
  - diagnostics
  - runtime
  - debug-snapshot
module_id: observability-audit
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on:
  - ISSUE-095
write_scope:
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bunx vitest run apps/mv3-shell/test/manifest.spec.ts"
completed_at: 2026-04-09T03:48:52.592Z
---

## Goal

Upgrade `runtime.capture_diagnostics` into a level-1 runtime debug snapshot so operators can inspect recent runtime failures and loop activity without falling back to old-repo diagnostics.

## Review Finding

- `ISSUE-063` landed shared runtime summary resources, `ISSUE-095` landed loop telemetry / `loop.step` audit, and `runtime.capture_diagnostics` already exists on the public control plane.
- The current diagnostics action is still mostly a liveness snapshot of bridge / runner / site state, so the repo does not yet meet the recovery report's remaining observability surface: level-1 runtime debug snapshot, error lifecycle summary, and minimal run/step visibility.
- `docs/cutover-readiness-criteria.md` still says runtime problems should not require falling back to old-repo diagnostics, but the current snapshot is not yet operator-usable enough to satisfy that gate.

## Scope

1. Extend `runtime.capture_diagnostics` with a stable level-1 runtime debug snapshot built from existing runtime state.
2. Include minimal recent error lifecycle summary and recent loop / step visibility by reusing existing runtime state, audit, and telemetry surfaces rather than introducing parallel storage.
3. Add MV3 integration coverage for healthy, degraded, recent-error, and recent-loop-activity diagnostics snapshots.

## Acceptance

- `runtime.capture_diagnostics` returns a stable level-1 runtime debug snapshot for operator debugging.
- The snapshot includes minimal error lifecycle summary and recent loop / step visibility in addition to the current bridge / runner / site liveness state.
- `apps/mv3-shell/test/manifest.spec.ts` verifies healthy, degraded, recent-error, and recent-loop-activity diagnostics paths.

## 工作总结

### 实现了什么
- 扩展 runtime.capture_diagnostics，补齐 error lifecycle 调试摘要
- 在 diagnostics snapshot 暴露 loop run / telemetry / loop.step audit 可见性

### 实际跑了什么检查
- bunx biome check apps/mv3-shell/src/background.ts apps/mv3-shell/test/manifest.spec.ts
- bunx vitest run apps/mv3-shell/test/manifest.spec.ts

### 残留风险
- 无

## 相关 commits

- `0a03af8767b7` feat(observability): 补齐 runtime 调试快照
