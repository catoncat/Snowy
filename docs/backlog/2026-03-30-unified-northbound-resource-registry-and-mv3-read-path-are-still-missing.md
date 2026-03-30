---
id: ISSUE-072
title: "Review: unified northbound resource registry and MV3 read path are still missing"
status: open
priority: p1
source: "current plan expansion 2026-03-30"
created: 2026-03-30
assignee: unassigned
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
