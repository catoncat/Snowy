---
id: ISSUE-183
title: "Release UAT: representative old-plugin replacement scenario is not recorded"
status: done
priority: p0
source: "Level 2 release acceptance boundary 2026-05-27"
created: 2026-05-26
assignee: codex-loop
tags:
  - review
  - release
  - uat
  - cutover
module_id: old-product-replacement-loop
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-cutover-readiness
parallel_group: mv3-shell
depends_on: []
write_scope:
  - docs/level-2-uat-scenario-2026-05-27.md
  - docs/level-2-cutover-acceptance-2026-05-27.md
acceptance_ref: docs/level-2-cutover-acceptance-2026-05-27.md
check_cmd: "bun run check"
completed_at: 2026-05-26T20:16:01.005Z
---

## Goal

Record one concrete release UAT scenario for the representative old-plugin replacement loop after the Level 2 acceptance pack. The scenario must use existing runtime evidence and should not create new feature scope.

## Review Finding

- The repo-side Level 2 acceptance pack is complete but external release acceptance can still ask what exact scenario was exercised. Without a single UAT readout the next agent may reopen deferred breadth instead of running or citing the representative loop.

## Acceptance

- A UAT document defines the representative old plugin replacement scenario from install through event dispatch and audit evidence.
- The UAT document lists exact commands and observed results from the current run including build and check evidence.
- The Level 2 acceptance pack points to the UAT scenario as the next evidence artifact without reopening deferred breadth.

## 工作总结

### 实现了什么
- 新增 Level 2 UAT scenario 文档，记录 representative old-plugin replacement loop：skills.install 写入 package、skills.enable、skills.summary/runtime.bootstrap 暴露 eventSubscriptions、runtime.event.dispatch 触发 package-backed Skill、JS Runner 返回 notify_success、audit.tail 留下证据；Level 2 acceptance pack 已指向该 UAT readout，并继续把下一步限制为外部 release acceptance、真实浏览器 UAT 或显式 deferred breadth 提升。

### 实际跑了什么检查
- bun run test -- apps/mv3-shell/test/manifest.spec.ts -t 'dispatches runtime events to enabled package-backed skill subscriptions'; bun run build; git diff --check; bun run check

### 残留风险
- 无

## 相关 commits

- `fc449fc4e336` docs(cutover): 记录 Level 2 UAT 场景
