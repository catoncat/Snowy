---
id: ISSUE-021
title: "Review: MV3 offscreen lifecycle is still optimistic"
status: open
priority: p1
source: "next-batch review 2026-03-29"
created: 2026-03-29
assignee: unassigned
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
