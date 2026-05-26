---
id: ISSUE-177
title: "Cutover milestone: old-product replacement proof is not consolidated into Level 2 gate"
status: done
priority: p0
source: "anti-fragmentation planning 2026-05-27"
created: 2026-05-27
assignee: codex-loop
tags:
  - cutover
  - milestone
  - old-product-replacement
  - readiness
module_id: old-product-replacement-loop
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-cutover-product-completion
parallel_group: mv3-shell
depends_on: []
write_scope:
  - docs/cutover-readiness-criteria.md
  - docs/migration-parity-dashboard.md
  - docs/legacy-to-vnext-migration-matrix.md
  - docs/module-tracking-ledger.json
  - docs/source-of-truth-map.md
  - docs/agent-bootstrap-context-pack.md
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
completed_at: 2026-05-26T18:30:13.354Z
---

## Goal

Close the anti-fragmentation loop by consolidating ISSUE-172 through ISSUE-176 into a single cutover readiness proof pack. Decide whether the old-product replacement loop module can move from in-progress to shipped-with-deferred-scope while keeping broader Skill Studio and full legacy parity out of the current milestone.

## Review Finding

- ISSUE-172 through ISSUE-176 now prove install to package materialization to manifest execution to AI surface discoverability to visible sidepanel catalog management
- cutover readiness and migration docs still say the repository is not Level 2 without a gate-by-gate proof pack that separates this shipped product loop from remaining deferred breadth
- continuing to open another field or UI issue would recreate the fragmentation problem instead of advancing the project-level completion claim

## Acceptance

- Cutover readiness criteria include a gate-by-gate proof pack mapping Gates A through G and Soft Gates to concrete committed issues tests and remaining blockers
- Migration dashboard and legacy matrix distinguish shipped cutover-critical old-product replacement proof from post-cutover Skill Studio versioning and full ecosystem breadth
- Module tracking ledger updates old-product-replacement-loop from in-progress to shipped only if the proof pack supports that decision and records deferred_scope plus deferral_rationale
- Source-of-truth or bootstrap docs keep the next planning rule milestone-first and prevent reopening ISSUE-172 through ISSUE-176 as small follow-up fragments
- No new runtime feature is added unless the proof pack exposes a real blocking gap inside this milestone scope
- Run git diff --check and bun run check unless an unrelated blocker prevents the repo gate

## 工作总结

### 实现了什么
- 把 ISSUE-172 到 ISSUE-176 的 old-product replacement proof consolidated 到 Level 2 gate proof pack；module ledger 将 old-product-replacement-loop 调整为 shipped-with-deferred-scope；migration dashboard / legacy matrix / source-of-truth / bootstrap context 区分已收口的 cutover-critical proof 与 post-cutover Skill Studio、versioning、旧 plugin 生态 breadth

### 实际跑了什么检查
- jq . docs/module-tracking-ledger.json (passed)
- ./node_modules/.bin/biome check docs/module-tracking-ledger.json docs/cutover-readiness-criteria.md docs/migration-parity-dashboard.md docs/legacy-to-vnext-migration-matrix.md docs/source-of-truth-map.md docs/agent-bootstrap-context-pack.md (checked 1 file; passed for supported files)
- git diff --check (passed)
- bun run check (typecheck, Biome, 35 test files / 610 tests passed)

### 残留风险
- 无

## 相关 commits

- `b605e1d9ed8f` docs(cutover): 收口旧产品替代证明
