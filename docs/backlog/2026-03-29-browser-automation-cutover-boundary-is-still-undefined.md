---
id: ISSUE-036
title: "Review: browser automation cutover boundary is still undefined"
status: open
priority: p1
source: "next-batch planning 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - site-runtime
  - page
  - tabs
  - automation
  - cutover
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on: []
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

明确 browser automation 在 vNext 里的 cutover 前最小必需边界，区分哪些旧 automation 能力必须进入主线、哪些可以后置，避免 site runtime / page.* / tabs.* 在没有产品裁决的情况下无序扩张。

## Review Finding

- `docs/legacy-to-vnext-migration-matrix.md` 里，`browser automation / background mode` 仍是 `not-started`，`tab / page interaction tools` 仍是 `partial`。
- `docs/cutover-readiness-criteria.md` 的 Soft Gate 2 已明确：必须说明哪些旧 automation 能力属于 cutover 前必需。
- 当前仓已具备最小 site runtime / injection chain / page-hook path，但这不等于旧 browser automation 能力已经迁完。
- 若不先锁定 cutover boundary，后续实现容易在 `page.*` / `tabs.*` / `site.*` 上重新回到“能力列表膨胀”，偏离“少量强原语 + 足够上下文”的 locked decisions。

## Acceptance

- 文档明确列出 browser automation 在 cutover 前的最小必需集合，与可后置集合。
- 明确 background mode、stabilization、failure tracking、截图/下载/人工接管等能力分别属于：
  - cutover 前必需
  - cutover 后可补
  - 或暂不纳入主链
- `page.*` / `tabs.*` / `site.*` 的最小 production path 与 site runtime 当前已实现部分建立清晰映射。
- 若结论要求新增 public capability 或 site runtime contract，必须明确落到 backlog follow-up，而不是只停留在口头建议。
- 文档结论与 `migration matrix` / `parity dashboard` / `cutover criteria` 三处口径保持一致。
