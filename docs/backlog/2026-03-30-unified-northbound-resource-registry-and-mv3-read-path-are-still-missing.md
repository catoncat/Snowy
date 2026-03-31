---
id: ISSUE-072
title: "Review: unified northbound resource registry and MV3 read path are still missing"
status: done
priority: p1
source: "current plan expansion 2026-03-30"
created: 2026-03-30
assignee: codex-019d41f6
claimed_at: 2026-03-31T08:20:44Z
tags:
  - review
  - ai-surface
  - resource
  - mv3-shell
  - plugin-mainline-correction
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-contracts-core
parallel_group: contracts-core
depends_on:
  - ISSUE-070
  - ISSUE-071
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/src/runtime-services.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

把 unified northbound resource registry and MV3 read path are still missing 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- 轻量 resource builder 已有，但 runtime/config/skills/hosts/audit 仍没有统一 northbound registry 与 package-owned read path
- MV3 bridge 仍可能按资源类型各自暴露私有读面，UI/聊天/bridge 容易再次分叉
- 在 ISSUE-070/071 扩大 audit 与 intervention shared surface 后，如果没有统一 read path，app integration 仍会继续长 app-local truth

## Acceptance

- runtime.summary/config.summary/skills.summary/hosts.summary/audit.tail 至少能通过一个统一 registry 或 lookup surface 被读取，而不是各自走 bridge 私有入口
- apps/mv3-shell 通过 package-owned read path 暴露这些资源，不重新发明 app-local resource truth
- 测试与文档锁定 action/resource 边界、resource id 集合与 MV3 read path 的上游归属

## Impact Note

1. northbound surface：`packages/core` 新增统一 `readAiSurfaceResource()` lookup；`apps/mv3-shell` 新增统一 `resource.read` read path，覆盖 `runtime.summary/config.summary/skills.summary/hosts.summary/audit.tail`，并继续兼容 `runtime.bootstrap` / `audit.tail` / `audit.intervention` 旧读面。
2. 影响消费者：MV3 background/sidepanel、后续 UI、聊天 Agent 与任何 bridge 侧 northbound reader 都可通过同一套 resource id + package-owned lookup 读取 summary/audit，而不是继续分叉 app-local 读面。
3. 控制面文档：已同步 `docs/ai-surface-index.md`、`docs/agent-bootstrap-context-pack.md`、`docs/legacy-to-vnext-migration-matrix.md`、`docs/migration-parity-dashboard.md`、`docs/cutover-readiness-criteria.md`、`docs/ai-native-capability-surface-design.md`，并更新 `packages/core/README.md`、`apps/mv3-shell/README.md`。

## 工作总结

- 在 `packages/contracts` / `packages/core` 收口了最小 northbound resource lookup：新增 `AiSurfaceResourceDocument` union，并在 `packages/core` 提供统一 `readAiSurfaceResource()`，让 summary/audit resources 不再只能各自调用私有 builder。
- 在 `apps/mv3-shell` 新增统一 `resource.read` bridge 路径，并让现有 `audit.tail` / `audit.intervention` 兼容读面回到同一条 package-owned lookup；`runtime.bootstrap` 继续保留为 bootstrap bundle compatibility read path。
- 测试锁住了 unified lookup + MV3 read path：`packages/core/test/core.spec.ts` 覆盖统一 lookup helper，`apps/mv3-shell/test/manifest.spec.ts` 覆盖 `resource.read` 对 `runtime.summary/config.summary/skills.summary/hosts.summary/audit.tail` 的读取，以及未知 resource id 的错误路径。
- 已执行 Doc Freshness Gate；`docs/module-tracking-ledger.json` 已检查，无需改动。残留风险是 repo 目前只有 lookup surface，还没有更完整的 resource metadata / audience projection registry；该缺口已拆到 follow-up `ISSUE-082`。
- 实际检查：`bun run check`。

## Sub Issues

- `ISSUE-082` `Follow-up: resource metadata registry and audience projection are still lookup-only`

## 相关 commits

- `8e394b7` `feat(core): add unified AI surface resource lookup`
