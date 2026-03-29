---
id: ISSUE-006
title: MV3 offscreen runner bridge
status: open
priority: p0
source: v0 follow-up
created: 2026-03-29
assignee: unassigned
tags: [mv3-shell, js-runner]
kind: slice
epic: EPIC-js-runner
parallel_group: mv3-shell
depends_on: [ISSUE-005]
write_scope:
  - apps/mv3-shell/manifest.json
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/src/offscreen.html
  - apps/mv3-shell/src/offscreen.js
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/next-development-slices-2026-03-29.md
check_cmd: bun run check
---

## Goal

把 runner host 挂到 MV3 offscreen lifecycle 上。

## Acceptance

- background 能管理 offscreen host 生命周期
- bridge contract 被测试约束

