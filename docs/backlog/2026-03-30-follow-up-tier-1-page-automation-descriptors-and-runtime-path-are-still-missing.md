---
id: ISSUE-057
title: "Follow-up: Tier 1 page automation descriptors and runtime path are still missing"
status: in-progress
priority: p1
source: "ISSUE-036 cutover boundary 2026-03-30"
created: 2026-03-30
assignee: copilot
tags:
  - review
  - follow-up
  - site-runtime
  - page
  - automation
  - descriptor
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: follow-up
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on:
  - ISSUE-037
  - ISSUE-040
write_scope:
  - docs/
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/browser-automation-cutover-boundary.md
check_cmd: "bun run check"
---

## Goal

补齐 cutover Tier 1 所需的 page.press_key/page.screenshot 与最小 page automation production path，且保持 ISSUE-045 锁定的独立 site-runtime 编排边界。

## Review Finding

- ISSUE-036 已锁定 page.press_key 与 page.screenshot 属于 Tier 1，但当前 catalog 与 runtime path 仍未收口。
- 若直接把 page 自动化折叠进 FamilyProvider，会与 ISSUE-045 的当前阶段决策冲突。

## Acceptance

- 新增 page.press_key 与 page.screenshot descriptor，并保持 public namespace 收敛。
- 最少一条 page automation production path 经由现有 site-runtime invoke 链路跑通，不要求提前注册 page FamilyProvider。
- 补测试覆盖 press_key 或 screenshot 的 active-tab-only 与 explicit invoke 边界。
- 相关文档与 ISSUE-036 和 ISSUE-045 口径一致。
