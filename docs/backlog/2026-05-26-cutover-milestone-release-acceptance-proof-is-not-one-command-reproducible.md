---
id: ISSUE-185
title: "Cutover milestone: release acceptance proof is not one-command reproducible"
status: done
priority: p0
source: "anti-fragmentation release acceptance gate 2026-05-27"
created: 2026-05-26
assignee: codex-release
tags:
  - review
  - cutover
  - release
  - uat
  - milestone
module_id: old-product-replacement-loop
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-cutover-product-completion
parallel_group: mv3-shell
depends_on: []
write_scope:
  - package.json
  - scripts/release-acceptance.ts
  - docs/cutover-readiness-criteria.md
  - docs/level-2-cutover-acceptance-2026-05-27.md
  - docs/level-2-uat-scenario-2026-05-27.md
  - docs/module-tracking-ledger.json
  - docs/source-of-truth-map.md
acceptance_ref: docs/level-2-cutover-acceptance-2026-05-27.md
check_cmd: "bun run check"
completed_at: 2026-05-26T21:28:08.002Z
---

## Goal

把 repo-side Level 2 evidence complete 状态收敛成一个可复跑的 release acceptance gate/readout，让外部 cutover decision 不再需要从多个 done issue 和文档段落手工拼证据。

## Review Finding

- 当前 Level 2 proof pack 已记录 repo-side gate evidence complete，但只有 build/check/smoke 分散命令和文档说明；下一轮 agent 或 release reviewer 仍需要手工判断证据是否齐全。
- queue 为空后继续拆 deferred breadth 会制造碎片化；更符合当前阶段的是提供一个集成型 acceptance command，把 build、real Chromium MV3 smoke、repo gate 与关键文档 freshness 绑定到一个 readout。

## Acceptance

- 新增 bun run release:acceptance，能从干净构建开始执行 build、real Chromium MV3 smoke 和 repo check
- release acceptance readout 校验 Level 2 acceptance pack、UAT scenario、cutover readiness 和 module ledger 的关键状态，失败时给出明确错误
- cutover/acceptance 文档记录该命令是外部 release acceptance 前的 repo-side evidence refresh 入口
- live queue 重建后只出现这一条 release acceptance milestone，而不是多个局部 deferred follow-up

## 工作总结

### 实现了什么
- 新增 bun run release:acceptance，把 build、real Chromium MV3 smoke、repo check 和关键文档/ledger freshness 校验收敛成一个 repo-side evidence refresh readout
- 同步 Level 2 acceptance、UAT、cutover readiness、source-of-truth 和 module ledger，让下一步只进入外部 acceptance、明确 UAT 或命名 deferred breadth，而不是继续拆小票

### 实际跑了什么检查
- bun run release:acceptance
- ./node_modules/.bin/biome check <touched files>
- git diff --check
- git diff --cached --check

### 残留风险
- 无

## 相关 commits

- `42d42ddefe6d` feat(release): 增加验收证据刷新命令
