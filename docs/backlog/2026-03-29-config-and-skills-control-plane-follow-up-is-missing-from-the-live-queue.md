---
id: ISSUE-054
title: "Review: config and skills control-plane follow-up is missing from the live queue"
status: done
priority: p1
source: "module coverage sync 2026-03-29"
created: 2026-03-29
assignee: codex-019d3c89
tags:
  - review
  - core
  - ai-surface
  - control-plane
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-contracts-core
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - docs/
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
claimed_at: 2026-03-30T02:19:07.042Z
---

## Goal

把 ai-surface control plane 在 `config.*` / `skills.*` 上剩余的 live gap 明确成下一步可执行 slice。

## Review Finding

- `docs/module-tracking-ledger.json` 已把 `ai-surface-control-plane` 标成 `secondary / partial`，但 live backlog 此前没有任何 open issue 覆盖它。
- `ISSUE-029` 和 `ISSUE-030` 已收口 action boundary 与 bootstrap read path，但 `config.*` / `skills.*` control-plane follow-up 仍未进入 live queue。
- 在这个模块重新获得 live coverage 前，`workflow:plan` 只能返回 module coverage gap，而不能输出完整 batch。

## Acceptance

- Define the next live ai-surface-control-plane slice after the current kernel mainline.
- Decide whether config.* and skills.* control-plane work should stay in one issue or split into concrete follow-up issues.
- Close this review issue only after ai-surface-control-plane no longer has zero live backlog coverage.

## 工作总结

- 对照 `ISSUE-029` / `ISSUE-030`、`docs/ai-native-capability-surface-design.md`、`packages/core/src/index.ts` 与 `apps/mv3-shell/src/background.js` 复核后，确认当前缺口应拆成两个 follow-up：`config.*` 仍是 bootstrap placeholder，`skills.*` 仍停在 `skills.invoke` / `skills.list`。
- live backlog 已新增 `ISSUE-055` `Review: config control-plane action surface is still placeholder-only` 与 `ISSUE-056` `Review: skill lifecycle control-plane actions are not exposed beyond invoke/list`，ai-surface-control-plane 不再是零 live coverage。
- 同步更新了 `docs/ai-surface-index.md`，把缺失的 `skills.install` / `skills.enable` / `skills.disable` / `skills.uninstall` 明确写回 product control plane gap；并更新 `docs/backlog/README.md` 的队列提示与推荐顺序。
- 已运行 `bun run check`；其中 `tsc --noEmit` 通过，但 `biome check .` 被仓库现有的格式化/导入排序漂移阻塞，问题分布在 `package.json`、`biome.json`、`.agents/skills/**/scripts/*.test.ts`、`apps/mv3-shell/manifest.json` 等 write scope 外文件。
- 残留风险：`docs/next-development-slices-2026-03-29-batch-7.md` 仍是拆分前快照，但 live queue 真相源已经转为 `ISSUE-055` / `ISSUE-056` 的 backlog frontmatter。

## Sub Issues

- `ISSUE-055` `Review: config control-plane action surface is still placeholder-only`
- `ISSUE-056` `Review: skill lifecycle control-plane actions are not exposed beyond invoke/list`

## 相关 commits

- `6ebc2a5` `docs(backlog): split ai-surface control-plane follow-ups`
