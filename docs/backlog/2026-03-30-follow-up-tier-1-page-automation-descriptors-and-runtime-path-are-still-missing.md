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
  - plugin-mainline-correction
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

补齐 cutover Tier 1 剩余的 `page.*` production path，重点收口 `page.query/click/fill`，且保持 ISSUE-045 锁定的独立 site-runtime 编排边界。

## Review Finding

- `page.press_key` / `page.screenshot` 已有最小路径，但 `page.query/click/fill` 仍没有 production path，Tier 1 page automation 还没有真正收口。
- 若直接把 page 自动化折叠进 FamilyProvider，会与 ISSUE-045 的当前阶段决策冲突。
- “插件主线纠偏”review 进一步确认：剩余 `page.*` 路径必须继续沿当前 site-runtime 独立编排收口，而不能回到 app-local 私有分叉。

## Acceptance

- 本 issue 显式承接剩余 Tier 1 范围：`page.query`、`page.click`、`page.fill`。
- 至少一条读取路径和一条写入路径经由现有 site-runtime invoke 链路跑通，不要求提前注册 page FamilyProvider。
- 补测试覆盖剩余路径的 active-tab-only、explicit invoke 与 boundary drift。
- 相关文档与 ISSUE-036、ISSUE-045 和 `2026-03-30-plugin-mainline-correction-control.md` 口径一致。
