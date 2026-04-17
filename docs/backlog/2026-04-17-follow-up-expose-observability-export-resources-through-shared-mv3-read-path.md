---
id: ISSUE-166
title: "Follow-up: expose observability export resources through shared MV3 read path"
status: done
priority: p1
source: "ISSUE-162 re-evaluation 2026-04-17"
created: 2026-04-17
assignee: raven
tags:
  - review
  - observability
  - export
  - mv3
module_id: observability-audit
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on:
  - ISSUE-162
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - apps/mv3-shell/src/background.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
completed_at: 2026-04-17T15:18:42.341Z
---

## Goal

把 timeline/summary/rawEventTail 从 package-local contract/builder 收口成 shared MV3 resource.read 路径，而不是继续停留在 re-evaluation 结论里。

## Review Finding

- ISSUE-143 已补齐 contracts/core/site-runtime 的 export schema 与 builder，但 background 仍只暴露 observability.replay。
- ISSUE-161 已把 site-runtime-browser-automation 收口到 shipped，当前 page-action / site-runtime 事件链已具备最小 runtime-owned event source；继续等待完整 skill studio 会把主线 gap 误记成 defer。

## Acceptance

- shared AI surface resource IDs / metadata 覆盖 timeline/summary/rawEventTail 的 operator-facing read path，或显式锁定命名边界。
- core/background 提供对应 resource.read 投影，并复用现有 observability export builder 组合可用事件源。
- 测试覆盖 contracts/core/background 的 read path、limit/ordering 语义，并且不回退 observability.replay。

## 工作总结

### 实现了什么
- 暴露 observability.timeline/summary/rawEventTail 共享 resource.read，并接通 page-action observability 事件缓存与 MV3 读面

### 实际跑了什么检查
- bun run check

### 残留风险
- 无

## 相关 commits

- `0cee4211fec5` fix(observability): 接通共享导出资源读面
