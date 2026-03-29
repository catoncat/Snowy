---
id: ISSUE-036
title: "Review: audit tail is still missing for host control plane changes"
status: open
priority: p1
source: "next-batch operability planning 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - mv3-shell
  - audit
  - hosts
  - runtime
  - operability
kind: slice
epic: EPIC-mv3-shell
parallel_group: mv3-shell
depends_on:
  - ISSUE-033
write_scope:
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
---

## Goal

为 Operability 补一个最小 `audit tail` 读面，先覆盖 host control plane 的关键变更，让 Agent/UI 至少能追踪最近的 host 连接与默认值变化。

## Review Finding

- 当前仓已有 `hosts.connect`、`hosts.disconnect`、`hosts.set_default`，但没有最小 audit tail 来追踪这些产品级变更。
- `docs/ai-native-capability-surface-design.md` 已明确：audit 在 v1 应先作为可读 runtime resource，而不是直接上复杂 event stream。
- `docs/cutover-readiness-criteria.md` 的 Gate F / Gate G 要求 audit 至少覆盖 host 连接变化；如果没有 audit tail，diagnostics 只能给静态快照，无法支撑连续调试和状态回放。

## Acceptance

- runtime bootstrap 或专门 runtime/audit 读路径可以返回最近 audit entries。
- 最小 audit 范围至少覆盖：
  - `hosts.connect`
  - `hosts.disconnect`
  - `hosts.set_default`
- 每条 audit entry 至少包含：
  - `timestamp`
  - `kind`
  - `hostId`
  - `status`
  - 必要的错误摘要
- `apps/mv3-shell/test/manifest.spec.ts` 覆盖 host control plane 变更会写入并可读回 audit tail。
- 文档明确：config 变更与 skill 生命周期 audit 仍由后续 issue 继续扩展，不在本 slice 内一次性吞并。
