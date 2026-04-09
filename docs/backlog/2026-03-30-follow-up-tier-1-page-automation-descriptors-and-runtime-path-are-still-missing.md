---
id: ISSUE-057
title: "Follow-up: Tier 1 page automation descriptors and runtime path are still missing"
status: done
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

## 工作总结

### 实现了什么

- 在 `page-hook.ts` 中补齐了 `page.query`、`page.click`、`page.fill` 三个 Tier 1 page automation action handler：
  - `query`：通过 `document.querySelectorAll(selector)` 查询元素，分配 uid 存入 `elementRefs`，返回序列化的元素列表（tagName、textContent、attributes）
  - `click`：通过 uid 查找之前 query 到的元素，调用 `el.click()` 或 dispatch MouseEvent
  - `fill`：通过 uid 查找元素，设置 `el.value`，dispatch InputEvent + change Event
- 为三个新 action 补齐了 `verify()` 中的 action-specific 校验逻辑
- 扩展了 site-runtime 测试的 DOM sandbox：新增 `querySelectorAll`、mock 元素（button/input/div）、`MouseEvent`/`InputEvent`/`Event` 类
- 新增 2 个端到端测试：
  1. `query` standalone 通过 page-hook bridge 返回序列化元素
  2. `query → fill → query → click` 多步流程完整跑通
- 修复了测试 harness 的 `.js` → `.ts` 文件解析问题（并行工作中 mv3-shell 源文件从 `.js` 重命名为 `.ts`）

### 实际跑了什么检查

- `npx vitest run packages/site-runtime/test/site-runtime.spec.ts` — 21/21 通过
- `npx vitest run packages/site-runtime/test/ apps/mv3-shell/test/` — 86/87 通过（1 个 failure 来自并行工作的 `source-typescript-only.spec.ts`，不在本 slice write scope 内）

### 残留风险

- `apps/mv3-shell/test/source-typescript-only.spec.ts`（并行工作新增的未提交文件）检查 `@ts-nocheck`，与本 slice 无关
- `page-hook.ts` 在 git 中是 untracked（因为并行工作将 `.js` 重命名为 `.ts` 但未提交 rename），本次 commit 只包含了 `.ts` 新文件的创建
- `page.query/click/fill` 目前只有 page-hook 层实现；MV3 background.ts 中的消息路由和 capability bridge 尚未接通（这属于 ISSUE-086 的范围）

## 相关 commits

- `19a1806` feat(site-runtime): add page.query/click/fill production path (ISSUE-057)
