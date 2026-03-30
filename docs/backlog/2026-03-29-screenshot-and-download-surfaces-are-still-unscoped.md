---
id: ISSUE-040
title: "Review: screenshot and download surfaces are still unscoped"
status: done
priority: p1
source: "browser automation follow-up planning 2026-03-29"
created: 2026-03-29
assignee: copilot
tags:
  - review
  - site-runtime
  - automation
  - screenshot
  - download
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on:
  - ISSUE-036
write_scope:
  - docs/
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
---

## Goal

明确 screenshot / download 相关产品面在 vNext 的主链位置，判断它们是 browser automation cutover 前必需，还是应明确后置，避免后续在 capability 和产品面上反复返工。

## Review Finding

- `docs/legacy-to-vnext-migration-matrix.md` 已把 screenshot / visual / download utilities 列为 `not-started`，并把“browser automation / screenshot / download / intervention 是否纳入 cutover 前必需”列为关键未收口问题。
- 当前仓库的最小 site runtime 与 page/tabs 基线，并不能回答截图与下载应作为 substrate、product action 还是后置能力。
- 若不先裁定边界，后续很容易在 `page.*` / `site.*` / product control plane 之间来回摇摆，导致接口命名和权限模型反复变化。

## Acceptance

- 明确 screenshot 与 download 各自属于：
  - cutover 前必需
  - cutover 后可补
  - 或暂不纳入主链
- 明确它们更适合作为 substrate capability、site-runtime follow-up，还是 product/workflow 层能力。
- 若结论要求保留最小 screenshot / download contract，必须落成明确 follow-up issue。
- 文档结论与 `migration matrix`、`parity dashboard`、`cutover criteria` 保持一致。

## 工作总结

### 完成内容

1. **创建 `docs/screenshot-download-surface-boundary.md`**
  - 明确旧仓 screenshot 与 download 不是同一层能力：
    - `page.screenshot` = cutover 前必需的最小视觉原语
    - `screenshot_with_highlight` = cutover 后可补的 diagnostics composite
    - `download_image` = cutover 后可补的 product/workflow export ability
    - `download_chat_images` = 暂不纳入主链
  - 记录旧仓执行事实：screenshot 走 CDP `Page.captureScreenshot`，download 走页面内 `<a download>`，不是 `chrome.downloads`
  - 明确 screenshot 在旧仓里更偏 visual diagnostics / evidence / LLM 补充输入，不是 strict verify canonical path

2. **确认 follow-up 落点**
  - `page.screenshot` 的最小 contract / runtime path 已由 `ISSUE-057` 覆盖，无需新建 issue
  - download 相关 surface 在产品语义未重新定义前不新增实现 issue，避免把旧 tool 名与 chat payload shape 带回主线

3. **同步迁移口径**
  - 更新 `docs/cutover-readiness-criteria.md`：Soft Gate 3 标记为 screenshot/download 边界已裁决
  - 更新 `docs/legacy-to-vnext-migration-matrix.md`：screenshot/download 行从 `not-started` → `review-gap`
  - 更新 `docs/migration-parity-dashboard.md`：visual/download/intervention parity 备注补齐 screenshot/download 裁决状态
  - 更新 `docs/browser-automation-cutover-boundary.md`：将 `screenshot_with_highlight` 收口为 Tier 2 composite，并明确 download 不进 browser automation 主链

### 验证

- `bun run check` ❌ 仍被仓库现有、且本 issue write scope 外的格式化漂移阻塞（例如 `.codex/hooks/workflow-ticket.test.ts` 等）；本次改动文档文件在 IDE 诊断中无错误
