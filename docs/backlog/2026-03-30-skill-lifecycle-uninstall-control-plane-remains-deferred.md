---
id: ISSUE-069
title: "Review: skill lifecycle uninstall control-plane action remains deferred"
status: open
priority: p1
source: "ISSUE-056 staged subset follow-up 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - core
  - ai-surface
  - control-plane
  - skills
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: follow-up
kind: slice
epic: EPIC-contracts-core
parallel_group: contracts-core
depends_on:
  - ISSUE-056
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - docs/ai-surface-index.md
  - docs/skill-lifecycle-version-engine-boundary.md
  - docs/skill-runtime-site-capability-redesign-2026-03-29.md
  - docs/backlog
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

把 `skills.uninstall` 的 northbound action 语义补齐，并和 archive、物理删除、版本回滚边界统一。

## Review Finding

- `skills.install/enable/disable` 已可作为 staged subset 落地，但 `skills.uninstall` 仍缺少明确 contract。
- 当前 lifecycle engine 只有 `archived` 状态，并未定义 northbound uninstall 到底代表 archive、remove package，还是删除某个 installed version。
- 旧设计里 `installed` 语义已绑定 `mem://skills/...` 写入成功；若直接暴露 uninstall，必须先明确它对 BrowserVFS、trusted version 选择和 rollback 的影响。

## Acceptance

- 明确 `skills.uninstall` 是 archive、remove package、remove installed version，还是两阶段动作。
- 若新增 public action，contracts/core/docs/test 同步收口，并保证与 lifecycle/version engine contract 一致。
- `docs/ai-surface-index.md` 与 lifecycle 边界文档说明 uninstall 的最终口径，不再和 archive/rollback 混用。
