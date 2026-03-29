---
id: ISSUE-021
title: "Review: MV3 offscreen lifecycle is still optimistic"
status: done
priority: p1
source: "next-batch review 2026-03-29"
created: 2026-03-29
assignee: agent
tags:
  - review
  - mv3-shell
  - offscreen
  - lifecycle
kind: slice
epic: EPIC-mv3-shell
parallel_group: mv3-shell
depends_on: []
write_scope:
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/src/offscreen.js
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: project_plan.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T10:18:40.517Z
---

## Goal

把 offscreen host 生命周期从“超时即失败”收口成明确的恢复 contract。

## Review Finding

- createBackgroundRunnerBridge 只保证 offscreen document 存在，但没有把 host 失健康后的重建语义显式化。
- 当前测试覆盖 create-once 和 timeout，但没有覆盖 offscreen 失联/重建/恢复路径。
- docs/v0-slice.md 仍把 offscreen lifecycle 留在 Chrome integration deferred 项里。

## Acceptance

- bridge 对 offscreen host 丢失或失健康的恢复路径在代码里显式可见。
- MV3 测试覆盖至少一种 host loss 后的恢复场景。
- offscreen document 与 runner host 的职责边界不再只靠 timeout 间接表达。

## 工作总结

- 在 `apps/mv3-shell/src/background.js` 为 `createBackgroundRunnerBridge()` 增加显式 recovery contract：`ensureHost()` 现在会在 `runner.ensure_host` 失败或 host `health.status === "degraded"` 时，关闭并重建 offscreen document，再重新执行一次 host ensure；bridge state 同时暴露 `recovered`、`recoveryReason`、最近恢复时间等元信息。
- 保持 `invoke()` 不做自动重放，只把恢复收口在 host ensure 阶段，避免把真实执行请求变成潜在的重复调用面；这让 offscreen document 与 runner host 的职责边界从“超时即失败”变成“后台负责重建文档，offscreen 负责随文档重建 host”。
- 在 `apps/mv3-shell/test/manifest.spec.ts` 扩展 Chrome harness，补了两条回归测试：一条覆盖“document 仍在但 host 不再响应”后的 close+recreate 恢复路径，另一条覆盖 `degraded` 健康状态触发的文档重建恢复。
- 实际验证执行了 `bun run check`，结果通过：`tsc --noEmit` 通过，Vitest `10/10` 文件、`104/104` 测试通过；`ISSUE-021` 的 write scope 内无残留 blocker。

## 相关 commits

- `3e7afc0` `fix(mv3-shell): recover offscreen host lifecycle`
