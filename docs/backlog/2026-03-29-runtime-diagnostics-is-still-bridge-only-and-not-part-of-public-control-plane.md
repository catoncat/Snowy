---
id: ISSUE-033
title: "Review: runtime diagnostics is still bridge-only and not part of the public control plane"
status: done
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
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
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

## 工作总结

- 在 `packages/contracts` 新增 canonical 常量 `RUNTIME_CONTROL_PLANE_ACTIONS`，将 `runtime.capture_diagnostics` 纳入最小 runtime control-plane action set。
- 在 `packages/core` 的 runtime builtin catalog 中新增 `runtime.capture_diagnostics` descriptor（read-only、low risk、明确不触发 recovery）。
- 在 `apps/mv3-shell` background bridge 中将 `runtime.capture_diagnostics` 路由到既有 diagnostics snapshot 路径，复用 `diagnostics()`，未引入并行实现。
- 增加/更新测试：
  - `packages/contracts/test/contracts.spec.ts`：锁定 runtime control-plane action set。
  - `packages/core/test/core.spec.ts`：锁定 runtime namespace 与 contracts 对齐，并覆盖 handoff 包含新 action。
  - `apps/mv3-shell/test/manifest.spec.ts`：覆盖 `runtime.capture_diagnostics` 公共入口，验证无恢复副作用（不触发额外 offscreen create/close）。
- 更新 `docs/ai-native-capability-surface-design.md`，明确该动作是 Level 1 read-only diagnostics 入口，不等于完整 observability 系统。

实际检查：

- 通过：`bun run test packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts apps/mv3-shell/test/manifest.spec.ts`
- 阻塞：仓库级 `bun run typecheck` / `bun run check` 当前被 write scope 外文件阻塞（`.agents/skills/next-batch-planner/scripts/create-review-issue.test.ts` 缺少 `moduleId` 参数），本 slice 改动文件 `get_errors` 无新增错误。

## 相关 commits

- `bd0a609` feat(runtime): expose capture_diagnostics public action
