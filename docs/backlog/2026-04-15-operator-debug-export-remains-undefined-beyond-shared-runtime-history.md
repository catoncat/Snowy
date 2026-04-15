---
id: ISSUE-133
title: "Review: operator debug export remains undefined beyond shared runtime history"
status: open
priority: p1
source: "next-batch-planner review 2026-04-15"
created: 2026-04-15
assignee: unassigned
tags:
  - review
  - observability
  - debug-export
  - runtime-history
module_id: observability-audit
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---

## Goal

在 runtime.capture_diagnostics 与 runtime.history 已落地后，重新界定 operator-facing observability 是否还需要 shared debug export surface，还是应明确停在当前边界。

## Review Finding

- level-1 diagnostics snapshot、audit.tail / audit.intervention 与 shared runtime.history 已经落地，但 planning truth 仍把 observability 记为 partial，缺少新的 live ownership。
- 恢复报告里提到的 timeline / summary / rawEventTail 级别能力，目前仍没有 package-owned export contract 或显式 deferral 记录。
- 如果不把这条边界重新落票，observability 会继续处于“已补最近历史，但更广 export 语义没人承接”的半完成状态。

## Acceptance

- 明确当前阶段 observability 是否止于 runtime.capture_diagnostics + runtime.history，还是还需要一条 shared debug export / dump surface。
- 若 export 仍属后续范围，把 deferral 边界同步回 planning docs / module status；若需要继续做，拆出更窄的 contracts/core/background follow-up。
- 保持 operator-facing truth 在 shared resource/action paths，而不是回退到 background 或 sidepanel 私有 helper。
