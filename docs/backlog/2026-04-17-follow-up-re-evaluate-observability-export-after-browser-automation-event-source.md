---
id: ISSUE-162
title: "Follow-up: re-evaluate observability export after browser automation event sources stabilize"
status: done
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
completed_at: 2026-04-17T14:18:40.000Z
---

## Goal

在 observability.replay 已落地、browser automation 的 page-action handoff 也已补齐后，重新判断 observability 的 deferred export scope 是否仍应继续延迟，还是已经值得拆出更窄的 executable slice。

## Review Finding

- ISSUE-133 已把 timeline/summary/rawEventTail 显式延迟到 site-runtime-browser-automation 与 skill-runtime-sdk-studio 更成熟之后，但当前 browser automation 的关键 runtime 事件链又前进了一步，旧 deferral 边界需要重新校验。
- 如果不重新落票，observability-audit 会继续保持 partial 且无 live owner，planner 也无法区分这是有意识的延迟还是 backlog 漏票。

## Acceptance

- 重新评估 observability-audit 的 deferred_scope 与 deferral_rationale，并把结论同步回 module ledger / parity docs。
- 若仍继续延迟，则写清触发下一次评估的前置条件；若已有足够事件源，则拆出 contracts/core/background 的更窄 export follow-up。

## 工作总结

### 实现了什么
- 重新核对 `ISSUE-133`、`ISSUE-143`、`ISSUE-161` 与当前 contracts/core/background 事实后，确认旧的 blanket deferral 已失真：`timeline/summary/rawEventTail` 不再应整体等待 `skill-runtime-sdk-studio` shipped 才重新评估。
- 同步 `docs/module-tracking-ledger.json`，并确认 `docs/migration-parity-dashboard.md` 已与该结论一致：schema/builder 已 landed，当前剩余主线缺口已收窄为 shared MV3 projection。
- 新增 `ISSUE-166`，把下一条 executable slice 明确锁定为 `packages/contracts` / `packages/core` / `apps/mv3-shell/src/background.ts` 的 shared export read path。

### 实际跑了什么检查
- `python3 -m json.tool docs/module-tracking-ledger.json >/dev/null`
- `git diff --check`
- `bun run workflow:queue:build`
- `bun run check`（失败：`packages/core/test/core.spec.ts` 695/702/706/708 的既有联合类型错误，与本次 observability re-evaluation/doc truth repair 无关）

### 残留风险
- 本次没有直接实现 `ISSUE-166` 的 contracts/core/background 投影；它仍是 observability-audit 的下一条主线可执行 slice

## 相关 commits

- `e184bc97aeb7` docs(observability): 重评导出延迟边界
