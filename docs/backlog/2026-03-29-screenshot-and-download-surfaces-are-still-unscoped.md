---
id: ISSUE-040
title: "Review: screenshot and download surfaces are still unscoped"
status: open
priority: p1
source: "browser automation follow-up planning 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - site-runtime
  - automation
  - screenshot
  - download
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
