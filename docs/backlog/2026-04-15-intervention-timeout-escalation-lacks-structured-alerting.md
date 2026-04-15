---
id: ISSUE-136
title: "Intervention cross-endpoint coordination and timeout governance"
status: open
priority: p1
source: review
created: 2026-04-15
assignee: unassigned
tags:
  - review
  - intervention
  - timeout
  - cross-tab
module_id: intervention-handoff
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-intervention
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/kernel/src/intervention-controller.ts
  - packages/contracts/src/index.ts
  - apps/mv3-shell/src/background.ts
  - packages/kernel/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
merges: [ISSUE-142]
---

## Goal

补全 intervention 的跨端协调与超时治理：超时/未解决的 intervention 产生结构化审计条目，跨 tab/window 的 intervention 状态同步。

## Review Finding

- Intervention 超时或长时间未解决时没有结构化审计/告警机制，operator 无法从 audit.tail 发现积压的 intervention。
- Intervention 状态在单 session 内持久化，但跨 tab/window 不可见也不可解决，限制了多窗口工作流。

## Acceptance

- When an intervention request times out or remains unresolved beyond a configurable threshold the system emits a structured audit entry with escalation metadata; timeout-triggered audit entries appear in audit.tail resource
- Intervention requests created in one tab are visible and resolvable from another tab or window; state synchronization uses a shared channel not polling
- Test coverage for timeout audit emission and cross-tab state visibility
