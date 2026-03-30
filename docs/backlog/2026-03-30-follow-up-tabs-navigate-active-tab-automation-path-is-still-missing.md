---
id: ISSUE-058
title: "Follow-up: tabs.navigate active-tab automation path is still missing"
status: open
priority: p1
source: "ISSUE-036 cutover boundary 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - follow-up
  - site-runtime
  - tabs
  - automation
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: follow-up
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on:
  - ISSUE-037
write_scope:
  - docs/
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/browser-automation-cutover-boundary.md
check_cmd: "bun run check"
---

## Goal

补齐 tabs.navigate 的 Tier 1 contract 与 active-tab automation runtime path，且不把 tabs.* 提前折叠成当前阶段的必需 FamilyProvider。

## Review Finding

- ISSUE-036 已锁定 tabs.navigate 是 cutover 前必需，但当前 catalog 只有 tabs.list/get_active。
- active-tab-only 是 locked decision，因此 tabs.navigate 必须先收口为最小导航原语，而不是回到全量 tab 管理列表。

## Acceptance

- 新增 tabs.navigate descriptor，并保持 active-tab-only 边界清晰。
- tabs.navigate 通过现有 MV3 runtime path 跑通最小 round-trip，不要求提前注册 tabs FamilyProvider。
- 补测试覆盖导航行为与 active tab 元数据约束。
- 相关文档与 ISSUE-036 口径一致。
