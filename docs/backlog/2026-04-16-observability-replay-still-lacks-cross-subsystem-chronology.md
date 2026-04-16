---
id: ISSUE-151
title: "Review: observability replay still lacks cross-subsystem chronology"
status: done
priority: p1
source: review
created: 2026-04-16
assignee: codex-019d9439
tags:
  - review
  - observability
  - audit
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - apps/mv3-shell/src/background.ts
  - packages/core/test
  - apps/mv3-shell/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
completed_at: 2026-04-16T04:08:26.566Z
---

## Goal

把 observability replay still lacks cross-subsystem chronology 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- The architecture recovery report treats diagnostics audit and replay as a first-class product surface, but the current observability layer still does not expose a single cross-subsystem chronological replay path.
- Compacted history continuity and ordered stitching across loop host config and intervention events remain underdefined even after the current runtime history and audit follow-ups.

## Acceptance

- Shared observability surfaces expose an ordered replay or timeline document that can stitch loop host config and intervention events
- Compacted runs preserve continuity markers so replay consumers can follow history across compaction boundaries
- Tests cover chronological stitching and compaction continuity for replay output

## 工作总结

### 实现了什么
- 新增 observability.replay 共享资源及 typed replay contract，按时间顺序 stitch loop、host/config/skill audit、intervention 与 compaction continuity。
- 在 mv3-shell background 的统一 resource.read 路径暴露 observability.replay，并补充 runtime-services 的 compaction continuity 读取 helper。
- 补齐 contracts/core/mv3-shell 的定向测试，覆盖 chronology stitching 与 compaction continuity。

### 实际跑了什么检查
- bun run test -- packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts apps/mv3-shell/test/manifest.spec.ts
- ./node_modules/.bin/biome check packages/contracts/src/index.ts packages/core/src/index.ts apps/mv3-shell/src/runtime-services.ts apps/mv3-shell/src/background.ts packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts apps/mv3-shell/test/manifest.spec.ts docs/ai-surface-index.md

### 残留风险
- docs/workflow/live-queue.json 当前属于共享未提交 planning batch；workflow:done 已重建 queue 并释放 lease，但该 generated artifact 不在本 slice 的提交范围内。

## 相关 commits

- `3e7e237ceb05` feat(observability): 增加跨子系统 replay 资源
