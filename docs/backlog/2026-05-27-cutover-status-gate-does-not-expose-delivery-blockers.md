---
id: ISSUE-187
title: "Cutover status gate does not expose delivery blockers"
status: done
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
completed_at: 2026-05-26T21:41:10.205Z
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

## 工作总结

### 实现了什么
- 新增 release:cutover:status，把 release acceptance、Git publication、live queue 和 workflow lease 汇总成 cutover-facing 状态门禁
- 更新 release decision packet 和 source-of-truth map，明确 delivery blocker 不等于 implementation gap，不应继续拆 deferred 小票

### 实际跑了什么检查
- bun run release:acceptance
- bun run release:cutover:status（预期 ok:false：acceptance green，但当前 issue lease/worktree 与 main ahead origin/main 是交付 blocker）
- ./node_modules/.bin/biome check scripts/release-cutover-status.ts package.json
- git diff --check && git diff --cached --check

### 残留风险
- 外部 cutover 仍需 release branch / PR / push 决策；当前状态门禁会把未发布提交报告为 blocker

## 相关 commits

- `1df51cd84561` feat(release): 增加 cutover 状态门禁
