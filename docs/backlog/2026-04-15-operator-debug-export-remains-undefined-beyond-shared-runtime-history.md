---
id: ISSUE-133
title: "Review: operator debug export remains undefined beyond shared runtime history"
status: done
priority: p1
source: "next-batch-planner review 2026-04-15"
created: 2026-04-15
assignee: opus-worker
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

## 工作总结

### 裁决：当前阶段 observability 止于已交付边界，更广 export 显式延迟

经过对 contracts/core/background 三层实现、cutover-readiness-criteria Gate F、recovery report Phase D 建议的全面审查，得出以下结论：

#### 已交付范围（满足 Gate F）

| Surface | Type | Location |
|---|---|---|
| `runtime.capture_diagnostics` | action | contracts → core → background |
| `runtime.history` | resource | contracts → core → background |
| `audit.tail` | resource | contracts → core → background |
| `audit.intervention` | resource | contracts → core → background |
| kernel diagnostics facade | internal API | kernel → background bridge |
| error lifecycle tracking | internal state | background (exposed via diagnostics snapshot) |
| provider routing diagnostics | internal state | background (exposed via diagnostics snapshot) |

Recovery report Phase D 列出的五项 observability 建议全部已完成：
1. ✅ public `runtime.diagnostics` action
2. ✅ Level 1 runtime debug snapshot
3. ✅ audit tail resource
4. ✅ error lifecycle summary
5. ✅ run history / step history

Gate F 标准 —— "出故障时，不必回到旧仓才能定位核心 runtime 问题" —— 已满足。

#### 显式延迟范围

以下能力来自旧仓更广视野，不属于当前阶段 cutover 前置：

- **timeline export**：跨子系统的时间线事件编排，当前事件源（site-runtime、skill-runtime）自身还是 partial，生成 timeline 缺少足够上游事件
- **structured summary export**：超出 point-in-time snapshot 的聚合导出，需要更多 run cycle 数据积累
- **rawEventTail**：未过滤事件流，需要先确定哪些子系统产出 raw event
- **shared debug dump/export action**：批量导出入口，在上述三项就绪前增加空合约无实际价值

#### 延迟条件

当以下模块达到 shipped 状态后，重新评估是否需要 export surface：
- `site-runtime-browser-automation`
- `skill-runtime-sdk-studio`

#### operator-facing truth 路径确认

所有 operator-facing observability 均通过 shared resource/action paths 暴露：
- actions 走 `RUNTIME_CONTROL_PLANE_ACTIONS`
- resources 走 `AI_SURFACE_RESOURCE_IDS`
- 实现细节在 background.ts 内部，但 public surface 在 contracts/core
- 无 background/sidepanel 私有 helper 旁路

#### 文档同步

- `docs/module-tracking-ledger.json` 的 `observability-audit` 条目已补充 `shipped_scope`、`deferred_scope`、`deferral_rationale` 字段
- module status 保持 `partial`（因为 deferred scope 仍存在），但 partial 的含义已从"半完成无人承接"变为"已交付核心 + 显式延迟剩余"

### 聚焦验证

- 无代码改动（纯 review + planning doc 同步），无需 lint/test 验证
- `docs/module-tracking-ledger.json` JSON 结构有效性已确认

## 相关 commits

<!-- 待提交后补充 commit hash -->
