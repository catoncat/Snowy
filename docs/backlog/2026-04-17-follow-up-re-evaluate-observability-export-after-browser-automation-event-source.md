---
id: ISSUE-162
title: "Follow-up: re-evaluate observability export after browser automation event sources stabilize"
status: open
priority: p1
source: "next-batch-planner review 2026-04-17"
created: 2026-04-17
assignee: unassigned
tags:
  - review
  - observability
  - export
  - follow-up
module_id: observability-audit
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on:
  - ISSUE-161
write_scope:
  - docs/module-tracking-ledger.json
  - docs/migration-parity-dashboard.md
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - apps/mv3-shell/src/background.ts
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---

## Goal

在 observability.replay 已落地、browser automation 的 page-action handoff 也已补齐后，重新判断 observability 的 deferred export scope 是否仍应继续延迟，还是已经值得拆出更窄的 executable slice。

## Review Finding

- ISSUE-133 已把 timeline/summary/rawEventTail 显式延迟到 site-runtime-browser-automation 与 skill-runtime-sdk-studio 更成熟之后，但当前 browser automation 的关键 runtime 事件链又前进了一步，旧 deferral 边界需要重新校验。
- 如果不重新落票，observability-audit 会继续保持 partial 且无 live owner，planner 也无法区分这是有意识的延迟还是 backlog 漏票。

## Acceptance

- 重新评估 observability-audit 的 deferred_scope 与 deferral_rationale，并把结论同步回 module ledger / parity docs。
- 若仍继续延迟，则写清触发下一次评估的前置条件；若已有足够事件源，则拆出 contracts/core/background 的更窄 export follow-up。
