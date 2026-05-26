---
id: ISSUE-187
title: "Cutover status gate does not expose delivery blockers"
status: open
priority: p0
source: "anti-fragmentation release/cutover gate 2026-05-27"
created: 2026-05-27
assignee: codex-cutover-status
tags:
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
  - package.json
  - scripts/release-cutover-status.ts
  - docs/release-cutover-decision-packet-2026-05-27.md
  - docs/source-of-truth-map.md
acceptance_ref: docs/release-cutover-decision-packet-2026-05-27.md
check_cmd: "bun run release:cutover:status"
---

## Goal

把 repo-side Level 2 acceptance、live queue/lease 和 Git publication 状态合成一个 cutover-facing status gate，让外部 release / old-mainline cutover 前能直接看到当前是否只是交付边界未完成，而不是继续生成默认 implementation queue。

## Review Finding

- `bun run release:acceptance` 已能证明 repo-side evidence refresh，但它不表达当前分支是否已经发布到 remote、live queue 是否为空、lease 是否释放。
- 当前 `main` 领先 `origin/main` 多个提交；如果只看 acceptance green，下一轮 agent 或决策人可能误以为外部 cutover 已经可执行，或者反过来又开始拆 deferred 小票填 queue。

## Acceptance

- 新增 `bun run release:cutover:status`，运行 repo-side acceptance 并汇总 Git branch/upstream/ahead/behind、worktree cleanliness、queue entry、active lease 等状态。
- status gate 在 repo-side evidence green 但 delivery/publishing 未完成时给出结构化 blocker，而不是把它误判成新的 implementation gap。
- release decision packet 和 source-of-truth map 指向该 status gate，明确失败原因若只是 publication / external decision，则不得默认开 deferred 小票。
