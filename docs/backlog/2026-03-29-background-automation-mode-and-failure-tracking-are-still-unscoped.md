---
id: ISSUE-039
title: "Review: background automation mode and failure tracking are still unscoped"
status: done
priority: p1
source: "browser automation follow-up planning 2026-03-29"
created: 2026-03-29
assignee: copilot
tags:
  - review
  - site-runtime
  - automation
  - background-mode
  - reliability
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
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
---

## Goal

明确 vNext 是否需要最小 background automation mode 与 failure tracking，以及它们在 cutover 前是必需、可后置，还是只保留极简替代物。

## Review Finding

- `docs/legacy-to-vnext-migration-matrix.md` 把 `browser automation / background mode` 标成 `not-started`。
- 旧仓存在 `automation-mode.ts`、`background-failure-tracker.ts` 等能力面，但新仓尚未决定这些是否进入 cutover 前主链。
- 如果不先做边界裁决，后续要么忽略可靠性问题，要么把旧 background automation 心智整包搬回新仓，偏离当前 locked decisions。

## Acceptance

- 明确 background automation mode 在 cutover 前的地位：
  - 必需
  - 可后置
  - 或只保留极简替代物
- 明确 failure tracking 的最小需求是否属于 Operability / automation 主链。
- 若结论要求保留最小 background/failure contract，必须落成明确 follow-up issue。
- 文档需说明它与 active-tab-only、explicit invoke 才注入这两条 locked decision 如何兼容。

## 工作总结

### 完成内容

1. **创建 `docs/background-automation-mode-boundary.md`**
  - 明确 old background mode 不是单点能力，而是一整条 lane：tool filtering、DOM snapshot lane、DOM locator lane、stealth tab、mixed fallback、background failure tracker
  - 裁决结论：
    - background automation mode = **cutover 后可补**
    - background-specific failure tracking = **与 background mode 一起后置**
    - cutover 前仅保留 kernel `no-progress` / diagnostics / verify 作为极简替代物
  - 明确它与 locked decisions 的兼容关系：cutover 前继续坚持 `active-tab-only` 与 `explicit invoke`

2. **确认不新增 follow-up implementation issue**
  - 本次结论不是“保留一个最小 background contract”，而是“整条 background lane 后置”
  - 因此不为了满足 review 而硬拆新的 background-mode implementation issue

3. **同步迁移口径**
  - 更新 `docs/cutover-readiness-criteria.md`：补充 background mode / failure tracking 不属于 cutover 前必需
  - 更新 `docs/legacy-to-vnext-migration-matrix.md`：browser automation / background mode 行改为明确后置 + cutover 前替代物说明
  - 更新 `docs/migration-parity-dashboard.md`：说明 background mode 故意后置，而非遗漏
  - 更新 `docs/browser-automation-cutover-boundary.md`：保持 Tier 2，并补充 failure tracking 与其绑定

### 验证

- `bun run check` ❌ 仍被仓库现有、且本 issue write scope 外的格式化漂移阻塞；本次改动文档文件在 IDE 诊断中无错误
