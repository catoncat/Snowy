---
id: ISSUE-039
title: "Review: background automation mode and failure tracking are still unscoped"
status: open
priority: p1
source: "browser automation follow-up planning 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - site-runtime
  - automation
  - background-mode
  - reliability
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
