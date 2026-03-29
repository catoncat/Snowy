---
id: ISSUE-033
title: "Review: runtime diagnostics is still bridge-only and not part of the public control plane"
status: open
priority: p1
source: "next-batch operability planning 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - mv3-shell
  - contracts-core
  - diagnostics
  - runtime
  - operability
kind: slice
epic: EPIC-mv3-shell
parallel_group: mv3-shell
depends_on:
  - ISSUE-032
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

把现有 `runtime.diagnostics` 从 MV3 bridge 内部只读入口提升为最小 public control plane action，让 diagnostics 成为 AI-native operability surface 的正式入口。

## Review Finding

- `ISSUE-025` 已在 MV3 shell 补上 `runtime.diagnostics` snapshot，但该入口仍停留在 `apps/mv3-shell` bridge 层。
- 当前 `packages/contracts` / `packages/core` 尚未声明最小 `runtime.capture_diagnostics` public action contract。
- `docs/ai-native-capability-surface-design.md` 已将 `runtime.capture_diagnostics` 列为产品控制面动作；若 diagnostics 不能进入公共能力面，Operability 仍只是 substrate 内部自检，不足以支撑 cutover Gate F。

## Acceptance

- `packages/contracts` / `packages/core` 新增最小 `runtime.capture_diagnostics` action contract。
- 该 action 复用现有 diagnostics snapshot 路径，而不是并行发明第二套实现。
- MV3 shell 明确保证 diagnostics 为只读，不触发 host recovery、offscreen 拉起或其他隐式自愈路径。
- `packages/contracts/test/contracts.spec.ts`、`packages/core/test/core.spec.ts`、`apps/mv3-shell/test/manifest.spec.ts` 覆盖 public action 到 diagnostics snapshot 的路径。
- 文档明确：该 contract 是 Level 1 Operability 的 public diagnostics 入口，不等于完整 observability 系统。
