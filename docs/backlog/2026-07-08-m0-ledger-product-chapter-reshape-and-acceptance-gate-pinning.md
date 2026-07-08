---
id: ISSUE-192
title: "M0 收尾：module ledger 产品章节重排与 release acceptance gate 冻结"
status: open
priority: p1
source: "docs/product-roadmap-2026-07-08.md M0"
created: 2026-07-08
assignee: unassigned
tags:
  - ready-for-agent
  - product-m0
  - workflow
  - truth-repair
kind: slice
epic: EPIC-product-mainline
parallel_group: sdk-docs
module_id: repo-workflow-dx
module_stage: deferred
tracking_kind: doc-debt
depends_on: []
write_scope:
  - docs/module-tracking-ledger.json
  - scripts/release-acceptance.ts
  - docs/migration-parity-dashboard.md
  - docs/legacy-to-vnext-migration-matrix.md
  - docs/cutover-readiness-criteria.md
acceptance_ref: docs/product-roadmap-2026-07-08.md
check_cmd: "bun run release:acceptance && bun run workflow:queue:build"
---

## Goal

完成复刻章节关闭的台账收尾：让 module ledger 反映产品章节的模块框架，同时把 `release:acceptance` 的 ledger 检查冻结为 Level 2 历史证据 gate，使后续新增产品模块不会破坏复刻章节的可复现证据。

## Context

- `scripts/release-acceptance.ts` 的 `checkModuleLedger()` 当前要求「所有非 deferred 模块 status=shipped」；一旦按产品章节新增 mainline 模块（尚未 shipped），历史 gate 会误报失败。
- roadmap（`docs/product-roadmap-2026-07-08.md`）定义了产品章节的四条主线：M1 可日用、M2 视觉化 Agent、M3 Skill/新一代油猴脚本、M4 极致探索；ledger 需要能承载这些模块，供 queue builder 校验和排序。
- parity / migration 文档已转为复刻章节历史参考，但文件头没有标注，容易被后进 agent 当成 live truth。

## Acceptance

- [ ] `docs/module-tracking-ledger.json` 增加产品章节模块（建议：`product-daily-usability`、`agent-vision-loop`、`skill-userscript-loop`、`agent-frontier`，命名可调整），stage / tracking_order 与 roadmap 的 M1-M4 对应；复刻章节模块保留并标注章节归属（例如新增 `chapter` 字段或 summary 注记）。
- [ ] `scripts/release-acceptance.ts` 的 ledger 检查改为显式冻结模块列表（Level 2 证据涉及的模块集），新增产品模块不影响该 gate；检查语义在输出 detail 里说明「replication chapter frozen evidence」。
- [ ] `docs/migration-parity-dashboard.md`、`docs/legacy-to-vnext-migration-matrix.md`、`docs/cutover-readiness-criteria.md` 文件头加「复刻章节历史证据，产品章节规划见 roadmap」横幅；不得破坏 `release-acceptance.ts` 依赖的字符串检查。
- [ ] 改动后 `bun run release:acceptance` 仍为 `ok: true`。
- [ ] 改动后 `bun run workflow:queue:build` 通过，既有 backlog issue 的 module 校验不回归。
- [ ] M1 三张票（ISSUE-189/190/191）如需要，可在本票内迁移到新产品模块 id 并重建 queue；迁移与否在工作总结写明。

## Not Now

- 不删除任何复刻章节文档。
- 不改 backlog / queue / lease 机制本身。
- 不在本票顺手做任何产品代码改动。
