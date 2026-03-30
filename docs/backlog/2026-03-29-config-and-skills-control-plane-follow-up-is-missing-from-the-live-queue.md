---
id: ISSUE-054
title: "Review: config and skills control-plane follow-up is missing from the live queue"
status: in-progress
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
