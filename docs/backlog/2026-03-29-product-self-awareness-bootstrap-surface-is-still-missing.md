---
id: ISSUE-030
title: "Review: product self-awareness bootstrap surface is still missing"
status: done
priority: p1
source: "AI-native surface follow-up 2026-03-29"
created: 2026-03-29
assignee: codex
tags:
  - review
  - mv3-shell
  - core
  - runtime
  - ai-surface
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-mv3-shell
parallel_group: mv3-shell
depends_on:
  - ISSUE-025
  - ISSUE-026
write_scope:
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/src/offscreen.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T11:48:21.132Z
---

## Goal

给 Agent 一个最小但高信号的产品自我认知入口，而不是让它只能靠工具列表和 UI 文案猜当前状态。

## Review Finding

- 新设计已经把 `runtime/config/skills/hosts` 摘要列为最小 bootstrap surface。
- 但当前新仓还没有单一入口，把这些高信号状态按可读取 bundle 暴露给聊天 Agent / Skill / UI。
- 没有这层，产品虽然有 action substrate，但还不算真正 AI-native control plane。

## Acceptance

- 存在一个最小 bootstrap read path，至少可读：
  - runtime summary
  - skills summary
  - hosts summary
  - config summary 或明确的 config placeholder contract
- 该入口不要求把所有状态都做成新 tool，而是优先走摘要读取。
- 测试覆盖 healthy / degraded / empty-state 的最小返回口径。

## 工作总结

- 在 `packages/core` 增加 bootstrap summary contract 与 builder，统一产出 `runtime/config/skills/hosts` 摘要包，并为 config 明确 placeholder contract。
- 在 `apps/mv3-shell/src/background.js` 增加单一只读入口 `runtime.bootstrap`，把 background 现有 runtime/host 状态汇总成最小自我认知 bundle，不额外引入新的 tool family。
- 补了一次 bridge-side hardening：`runtime.bootstrap` 现在直接读取 active tab、offscreen/runner 状态和 bridge 提供的 skills/config inventory，不再信任消息体塞进来的摘要，从而更接近真正的 self-awareness read path。
- 在 core 和 MV3 integration tests 中补齐 healthy / degraded / empty-state 覆盖，并同步 AI surface 设计文档、v0 slice、migration matrix、parity dashboard。
- 已运行 `bun run check`。
- 残留风险：当前 bootstrap bundle 仍以摘要和 placeholder 为主，真正的 config/skills/hosts control plane actions 与 audit tail 仍由后续 issue 承接。

## 相关 commits

- `8a75848` `core/mv3: add bootstrap self-awareness bundle`
- `51e838e` `mv3-shell: source bootstrap summaries from runtime state`
