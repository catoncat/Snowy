---
id: ISSUE-071
title: "Follow-up: intervention state and audit are still MV3-private and non-durable across runtime restart"
status: open
priority: p1
source: "ISSUE-068 follow-up planning 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - intervention
  - handoff
  - plugin-mainline-correction
module_id: intervention-handoff
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on:
  - ISSUE-067
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - packages/kernel/src/
  - packages/kernel/test/
  - apps/mv3-shell/src/runtime-services.js
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

把 Follow-up: intervention state and audit are still MV3-private and non-durable across runtime restart 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- intervention summary / audit 还没有进入共享 contracts/core resource surface，当前只是 MV3 私有 augmentation。
- kernel intervention lifecycle 仍是纯内存态，service worker 或 kernel 重建后 handoff 上下文会丢失。
- 测试只覆盖单进程内 request/resolve/cancel/timeout，没有锁住 restart/rehydration round-trip。

## Acceptance

- 不新增新的 public capability family，继续沿用 runtime handoff contract，但 intervention summary / audit 正式进入共享 contracts/core surface。
- kernel 能持久化 intervention record 与 audit，并在新 kernel/runtime-services 实例里按 session 重新挂回。
- MV3 bridge 或 service worker 重启后，runtime.bootstrap/runtime.diagnostics/intervention.list/audit.intervention 仍能读回同一条 pending intervention，并可对原 id 做 resolve/cancel。
- 测试锁住 shared contract、kernel rehydrate 与 mv3 restart 后的 intervention round-trip。
