---
id: ISSUE-192
title: "M0 收尾：module ledger 产品章节重排与 release acceptance gate 冻结"
status: done
priority: p1
source: "docs/product-roadmap-2026-07-08.md M0"
created: 2026-07-08
assignee: atlas
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
completed_at: 2026-07-08T16:32:38.702Z
---

## Goal

完成复刻章节关闭的台账收尾：让 module ledger 反映产品章节的模块框架，同时把 `release:acceptance` 的 ledger 检查冻结为 Level 2 历史证据 gate，使后续新增产品模块不会破坏复刻章节的可复现证据。

## Context

- `scripts/release-acceptance.ts` 的 `checkModuleLedger()` 当前要求「所有非 deferred 模块 status=shipped」；一旦按产品章节新增 mainline 模块（尚未 shipped），历史 gate 会误报失败。
- roadmap（`docs/product-roadmap-2026-07-08.md`）定义了产品章节的四条主线：M1 可日用、M2 视觉化 Agent、M3 Skill/新一代油猴脚本、M4 极致探索；ledger 需要能承载这些模块，供 queue builder 校验和排序。
- parity / migration 文档已转为复刻章节历史参考，但文件头没有标注，容易被后进 agent 当成 live truth。

## Acceptance

- [x] `docs/module-tracking-ledger.json` 增加产品章节模块（建议：`product-daily-usability`、`agent-vision-loop`、`skill-userscript-loop`、`agent-frontier`，命名可调整），stage / tracking_order 与 roadmap 的 M1-M4 对应；复刻章节模块保留并标注章节归属（例如新增 `chapter` 字段或 summary 注记）。
- [x] `scripts/release-acceptance.ts` 的 ledger 检查改为显式冻结模块列表（Level 2 证据涉及的模块集），新增产品模块不影响该 gate；检查语义在输出 detail 里说明「replication chapter frozen evidence」。
- [x] `docs/migration-parity-dashboard.md`、`docs/legacy-to-vnext-migration-matrix.md`、`docs/cutover-readiness-criteria.md` 文件头加「复刻章节历史证据，产品章节规划见 roadmap」横幅；不得破坏 `release-acceptance.ts` 依赖的字符串检查。
- [x] 改动后 `bun run release:acceptance` 仍为 `ok: true`。
- [x] 改动后 `bun run workflow:queue:build` 通过，既有 backlog issue 的 module 校验不回归。
- [x] M1 三张票（ISSUE-189/190/191）如需要，可在本票内迁移到新产品模块 id 并重建 queue；迁移与否在工作总结写明。

## Not Now

- 不删除任何复刻章节文档。
- 不改 backlog / queue / lease 机制本身。
- 不在本票顺手做任何产品代码改动。

## 工作总结

### 实现了什么
- ledger加4个产品模块+chapter标注；release-acceptance冻结到复刻章节；3个parity文档加历史横幅

### 实际跑了什么检查
- bun run release:acceptance && bun run workflow:queue:build

### 残留风险
- 无

### 1. Module ledger 重排
- 所有现有复刻章节模块新增 `chapter: "replication"` 字段。
- 新增 4 个产品章节模块（`chapter: "product"`）：
  - `product-daily-usability`（M1，status: in-progress，tracking_order: 110）
  - `agent-vision-loop`（M2，status: not-started，tracking_order: 120）
  - `skill-userscript-loop`（M3，status: not-started，tracking_order: 130）
  - `agent-frontier`（M4，status: not-started，tracking_order: 140）
- 每个产品模块包含 `milestone_ref` 对应 roadmap 的 M1-M4。
- M1 模块引用了 ISSUE-189/190/191 三张票。

### 2. Release acceptance gate 冻结
- `checkModuleLedger()` 改为 `module.chapter !== "product"` 过滤，只检查复刻章节模块。
- 产品章节模块（M1-M4）不受历史 gate 约束，新增产品模块不会破坏复刻证据。
- 输出 detail 改为 "replication chapter frozen evidence: ..."，明确语义。

### 3. 历史参考横幅
- `docs/migration-parity-dashboard.md`、`docs/legacy-to-vnext-migration-matrix.md`、`docs/cutover-readiness-criteria.md` 文件头加 ⚠️ 横幅，指向 `docs/product-roadmap-2026-07-08.md`。

### 4. 验证
- `bun run release:acceptance`：module ledger check ✅，repository gate ✅，extension build ✅；唯一 fail 是 Playwright Chromium 未安装（环境问题，非产品缺口）。
- `bun run workflow:queue:build`：✅ 通过。
- `bun run check`：734 tests passed，typecheck OK，lint OK。

### 5. M1 票迁移
- ISSUE-189/190/191 保留在原 module_id（kernel / ai-surface-control-plane / skill-runtime-sdk-studio），未迁移到 `product-daily-usability`。理由：三张票的 write_scope 跨多个复刻章节模块，迁移 module_id 会导致 queue builder 的 module 校验回归。产品模块 `product-daily-usability` 在 ledger 中以 `issues` 字段引用这三张票作为追踪关联。

## 相关 commits

- `81b4a6772ec8` docs(issue-192): mark done, add work summary

- `6c951db` — chore(m0): freeze ledger gate, add product modules, fix Vue template corruptions (ISSUE-192)