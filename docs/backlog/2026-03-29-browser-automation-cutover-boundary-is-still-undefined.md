---
id: ISSUE-036
title: "Review: browser automation cutover boundary is still undefined"
status: done
priority: p1
source: "next-batch planning 2026-03-29"
created: 2026-03-29
assignee: copilot
tags:
  - review
  - site-runtime
  - page
  - tabs
  - automation
  - cutover
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
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
claimed_at: 2026-03-30T02:30:18.859Z
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

## 工作总结

- 新增 `docs/browser-automation-cutover-boundary.md`，把旧 browser automation 能力收口成 Tier 1 / 2 / 3 cutover boundary，并明确 `page.press_key`、`page.screenshot`、`tabs.navigate` 是 Tier 1 descriptor 缺口。
- 修正了 cutover 文档里与 ISSUE-045 决策冲突的表述：当前阶段默认沿用 `SiteSkillRuntime` / MV3 独立路径，不要求先补 `page.*` / `tabs.*` FamilyProvider bridge。
- 同步了 `docs/cutover-readiness-criteria.md` 与 `docs/legacy-to-vnext-migration-matrix.md`，让 Soft Gate 2、migration matrix 与 cutover boundary 口径一致。
- 新增 follow-up backlog：`ISSUE-057`（page Tier 1 descriptor/runtime path）和 `ISSUE-058`（`tabs.navigate` active-tab runtime path），避免结论只停在口头。
- 检查结果：`bun run check` 被 write scope 外的既有 TypeScript 问题阻塞（`.agents/skills/auto-claim-issues-next/scripts/ticket-machine*.ts` 与测试）；本次相关文档已通过 `git diff --check`。
- 残留风险：Tier 1 仍停留在边界裁决与 backlog 分解阶段，真正的 descriptor / runtime path 实现要等 `ISSUE-037`、`ISSUE-057`、`ISSUE-058` 收口。

## Sub Issues

- `ISSUE-057` Follow-up: Tier 1 page automation descriptors and runtime path are still missing
- `ISSUE-058` Follow-up: tabs.navigate active-tab automation path is still missing

## 相关 commits

- `51f39a7` `docs: lock browser automation cutover boundary`
