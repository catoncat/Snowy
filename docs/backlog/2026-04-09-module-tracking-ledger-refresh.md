---
id: ISSUE-107
title: "Module tracking ledger 与 kernel skeleton 状态校准"
status: done
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: codex-019d70f6
tags:
  - doc-debt
  - workflow
  - planning
kind: doc-debt
epic: EPIC-workflow
parallel_group: sdk-docs
module_id: repo-workflow-dx
module_stage: deferred
tracking_kind: doc-debt
depends_on:
  - ISSUE-103
  - ISSUE-104
  - ISSUE-111
  - ISSUE-112
write_scope:
  - docs/module-tracking-ledger.json
  - docs/kernel-skeleton-design.md
acceptance_ref: docs/source-of-truth-map.md
check_cmd: "bun run workflow:queue:build"
completed_at: 2026-04-09T11:42:20.613Z
---

## Goal

在当前 mainline gap issue 收敛后，校准 `docs/module-tracking-ledger.json` 与 `docs/kernel-skeleton-design.md` 的状态描述，使 planning truth 与实际 landed behavior 保持一致。

## Review Finding

当前 ledger 与 kernel skeleton 的“实现状态”段落确实已经落后于代码，但这类文档刷新不应该基于乐观推断提前完成。现在更稳妥的做法是先等本轮 mainline gap（compaction 语义、diagnostics contract、provider routing、loop intervention）收口，再统一刷新 module status 与 kernel 后续阶段说明；否则容易在本轮 backlog 尚未完成前又把文档写成过度乐观的 shipped 状态。

## Acceptance

- [ ] `docs/module-tracking-ledger.json` 的 `updated_at` 与各 module status 反映当下已 landed 的代码 / 测试现实，而不是对 open issue 的预支判断
- [ ] `docs/kernel-skeleton-design.md` 的实施状态与后续扩展层描述同步到当前 landed 状态
- [ ] 文档刷新不把仍处于 open 的 mainline gap 误记为已收口
- [ ] 变更完成后重建 live queue，确认 planning truth 与 dispatch truth 对齐

## 工作总结

### 实现了什么
- 刷新 module tracking ledger 的 updated_at、代码根路径与 provider-profile-routing 状态口径
- 补齐 kernel skeleton 文档的 2026-04-09 落地快照，不把当前仓库误记为 shipped/parity complete
- 重建 live queue，确认 planning truth 与 dispatch truth 对齐

### 实际跑了什么检查
- bun run workflow:queue:build

### 残留风险
- 无

## 相关 commits

- `2373125f757e` docs(workflow): 校准 module ledger 与 kernel skeleton
