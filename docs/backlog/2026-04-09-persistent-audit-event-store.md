---
id: ISSUE-105
title: Audit retention 策略与 durable read path 对齐
status: done
priority: p1
source: next-batch-planner review 2026-04-09
created: 2026-04-09
assignee: unassigned
tags: [observability, audit, persistence]
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
depends_on: []
write_scope:
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/test/manifest.spec.ts
  - apps/mv3-shell/test/runtime-chat.spec.ts
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bunx vitest run apps/mv3-shell/test/manifest.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts"
---

## Goal

把当前已有的 audit 持久化从“固定条数的本地 tail”收敛成明确的 retention policy 与 durable read path，使 `audit.tail` / `audit.intervention` 的持久化语义跨 restart 一致可预期。

## Review Finding

`apps/mv3-shell/src/background.ts` 已经有基于 Chrome storage 的 audit store，`audit.tail` 也已经能够跨 session 保留；因此剩余缺口不再是“从零实现持久化”，而是 retention 仍停留在固定 cap 的实现细节，`audit.intervention` 的 durable 行为也主要通过 runtime services 间接暴露，缺少统一的 durable read contract 与裁剪策略。

## Acceptance

- [x] audit persistence 有明确 retention 规则，而不只是 hard-coded 的固定条数上限
- [x] retained `audit.tail` 与 `audit.intervention` 在 extension restart 后都能按同一 durable 语义读取
- [x] background audit store 在写入与加载时执行 retention 裁剪，而不是仅在内存数组层面截断
- [x] 测试覆盖：load / save、retention trim、restart 后资源读取一致性

## 工作总结

- 新增 `AUDIT_RETENTION_DEFAULTS`（maxEntries: 500, maxAgeMs: 7 天）替换硬编码 `AUDIT_MAX_ENTRIES = 64`
- 新增 `trimByRetention(entries, retention)` helper，按 maxAgeMs 和 maxEntries 双维度裁剪
- `createChromeAuditStore` 在 `load()` 和 `save()` 两个路径都执行 retention trim
- `createBackgroundRunnerBridge` 新增 `auditRetention` 参数，支持外部配置
- 新增 2 个测试：count-based trim（8 条写入 → 5 条保留 + restart 验证）、time-based trim（4 天前条目在 load 时被裁剪）
- 注意：pre-existing test "rehydrates pending interventions across bridge restart" 在本次改动前已失败，与本 issue 无关

## 相关 commits

- `13755ca` feat(audit): 引入 retention 策略替换硬编码 cap
