---
id: ISSUE-186
title: "Cutover decision: external acceptance packet is not explicit"
status: open
priority: p0
source: "external cutover decision boundary 2026-05-27"
created: 2026-05-26
assignee: unassigned
tags:
  - review
  - cutover
  - release
  - decision
  - milestone
module_id: old-product-replacement-loop
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-cutover-product-completion
parallel_group: mv3-shell
depends_on: []
write_scope:
  - scripts/release-acceptance.ts
  - docs/release-cutover-decision-packet-2026-05-27.md
  - docs/level-2-cutover-acceptance-2026-05-27.md
  - docs/cutover-readiness-criteria.md
  - docs/source-of-truth-map.md
acceptance_ref: docs/level-2-cutover-acceptance-2026-05-27.md
check_cmd: "bun run check"
---

## Goal

把 repo-side Level 2 ready 状态转换成外部 cutover 决策包，明确推荐接受当前证据、需要的 fresh command、允许的后续分支，以及哪些 deferred breadth 不应再默认开票。

## Review Finding

- 仓库已有 release:acceptance gate 和 Level 2 acceptance pack，但外部决策人仍需要从多个文档拼出推荐动作、证据命令、剩余边界和禁止回退到碎片化 planning 的规则。
- 当前继续做普通 implementation issue 会偏离目标；真正缺的是把 browser plugin refactor 的 repo-side completion 交给 release/cutover acceptance。

## Acceptance

- 新增 release cutover decision packet，包含推荐决策、fresh evidence command、repo-side evidence summary、allowed decision options、not-now/deferred 列表和 post-decision actions
- Level 2 acceptance 与 cutover readiness 文档指向该 decision packet 作为外部 release acceptance 入口
- source-of-truth map 明确 queue 为空且 release:acceptance 通过后，不再生成默认 implementation queue，而是走 decision packet 的三分支
