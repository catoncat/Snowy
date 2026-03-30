---
id: ISSUE-041
title: "Review: intervention and human handoff surface is still undecided"
status: open
priority: p1
source: "browser automation follow-up planning 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - site-runtime
  - automation
  - intervention
  - human-handoff
module_id: intervention-handoff
module_stage: mainline
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
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

明确 intervention / human handoff 能力在 vNext 的产品主链位置，判断它应作为 browser automation cutover 前必需面、可后置能力，还是只保留 workflow 层约定。

## Review Finding

- `docs/legacy-to-vnext-migration-matrix.md` 把 interventions / human handoff 标为 `not-started`，且仍未决定其主链位置。
- 对 browser automation 来说，intervention 既关系到失败恢复，也关系到用户确认与控制权交接；如果边界不先裁定，后续容易把 UI 私有流程与 AI Surface 混在一起。
- 当前仓强调 AI-native control plane、少量强原语与 audit/confirm 语义，因此 intervention 是否升格为正式能力面，需要先有明确 review 结论。

## Acceptance

- 明确 intervention / human handoff 在 cutover 前的地位：
  - 必需
  - 可后置
  - 或仅保留 workflow 约定
- 明确它与 confirm gate、audit、browser automation failure path 的关系。
- 若结论要求新增正式 capability 或 product control plane surface，必须拆出明确 follow-up issue。
- 文档结论与 locked decisions、AI Surface 设计和 migration matrix 口径一致。
