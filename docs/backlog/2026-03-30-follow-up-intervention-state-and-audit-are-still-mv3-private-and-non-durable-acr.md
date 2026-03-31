---
id: ISSUE-071
title: "Follow-up: intervention state and audit are still MV3-private and non-durable across runtime restart"
status: done
priority: p1
source: "ISSUE-068 follow-up planning 2026-03-30"
created: 2026-03-30
assignee: codex-019d41f6
claimed_at: 2026-03-31T06:08:06Z
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

## Impact Note

1. northbound surface：`runtime.summary` 新增 typed `interventions` summary，新增 `audit.intervention` shared resource contract；MV3 `audit.intervention` read path 改为复用 shared builder。
2. 影响消费者：MV3 background / sidepanel read path、依赖 runtime bootstrap 与 intervention audit 的 UI、以及后续 northbound resource registry 收口。
3. 控制面文档：已同步 `docs/ai-surface-index.md`、`docs/agent-bootstrap-context-pack.md`、`docs/legacy-to-vnext-migration-matrix.md`、`docs/migration-parity-dashboard.md`、`docs/cutover-readiness-criteria.md` 与 `docs/ai-native-capability-surface-design.md`。

## 工作总结

- 在 `packages/contracts` / `packages/core` 正式收口 intervention shared surface：新增 `InterventionRecord` / `InterventionAuditEntry` / `InterventionSummary` / `audit.intervention` resource contract，并让 `runtime.summary` typed 包含 `interventions`。
- 在 `packages/kernel` 为 intervention lifecycle 增加 snapshot/persist/rehydrate 路径；`SessionStorage`、`InMemorySessionStorage`、`VfsSessionStorage` 现都能保存 per-session kernel snapshot，新的 kernel 实例可按 session 重挂 intervention record 与 audit。
- 在 `apps/mv3-shell` 复用已持久化 runtime session，并在 request / resolve / cancel / diagnostics read path 后持久化 intervention state；`runtime.bootstrap` 走 shared summary，`audit.intervention` 走 shared resource builder。
- 已执行 Doc Freshness Gate；`docs/module-tracking-ledger.json` 已检查，无需改动。残留风险是 product/studio 层的人机接管 UI 仍未实现，但该缺口已由既有 product/studio backlog 继续承接，不属于本 slice。
- 实际检查：`bun run test packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts packages/kernel/test/kernel-facade.spec.ts packages/kernel/test/vfs-session-storage.spec.ts apps/mv3-shell/test/manifest.spec.ts`、`bun run check`。

## 相关 commits

- `7ea878e` `feat(kernel): persist intervention state across runtime restart`
