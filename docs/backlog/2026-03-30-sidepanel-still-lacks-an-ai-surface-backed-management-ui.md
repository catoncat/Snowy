---
id: ISSUE-075
title: "Review: sidepanel still lacks an AI-surface-backed management UI"
status: open
priority: p2
source: "current plan expansion 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - ui
  - studio
  - skills
  - sidepanel
module_id: skill-runtime-sdk-studio
module_stage: deferred
tracking_kind: gap
kind: slice
epic: EPIC-skill-runtime-sdk
parallel_group: sdk-docs
depends_on:
  - ISSUE-072
write_scope:
  - apps/mv3-shell/src/sidepanel.html
  - apps/mv3-shell/src/runtime-services.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
---

## Goal

把 sidepanel still lacks an AI-surface-backed management UI 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- 当前 sidepanel 仍只是 BBL Next Shell 占位页，settings/runtime/skill management 还没有一个共享 control-plane consumer
- migration matrix 与 parity dashboard 都把 Skill Studio / lifecycle product surface 标成 red/not-started，但 backlog 里还没有对应 vNext slice
- 如果不把 UI 也落票，后续很容易再次用 app-private state 临时拼一套管理面，偏离 Phase 5 的 shared control-plane 方向

## Acceptance

- 明确 Soft Gate 1 是 cutover 前必需还是 cutover 后补，并把该判断同步到相关控制面文档
- 定义最小 sidepanel/management UI scope：至少消费 runtime/skills/hosts 摘要，并通过共享 control-plane 触发管理动作，而不是私有状态改写
- 把 sidepanel 的实现边界、上游 read/write path 与测试入口锁定，避免未来再长出第二套 app-local 管理面

## Decision

- Soft Gate 1 已明确为 **cutover 后补**：Level 2 cutover 不以完整 Skill Studio / sidepanel management UI 为前置，但 Gate G 继续要求 shared AI-surface summary/action 主链保持唯一真相源。
- `ISSUE-085` 已把 sidepanel 从空壳推进到最小 chat shell；该 shell 不等于 management UI，也不能替代 settings/runtime/skills/hosts 的共享 control-plane consumer。

## Scope Lock

- 读面：sidepanel management UI 只通过统一 `resource.read` 消费 `runtime.summary`、`config.summary`、`skills.summary`、`hosts.summary`。
- 写面：sidepanel management UI 只通过 `runtime.capture_diagnostics`、`runtime.clear_error`、`config.update`、`skills.install/enable/disable/uninstall`、`hosts.connect/disconnect/set_default` 触发管理动作。
- 边界：现有 `runtime.chat.*` sidepanel shell 与后续 management UI 必须显式分层；不能把 management state 塞回 chat 私有 bootstrap / mutation path。
- 测试入口：`apps/mv3-shell/test/manifest.spec.ts` 已新增 shared boundary 锁定用例，后续 sidepanel UI 实现必须继续沿这条 read/write path 扩展。

## Sub Issues

- `ISSUE-093` `Review: sidepanel management UI still lacks a shared control-plane consumer`
