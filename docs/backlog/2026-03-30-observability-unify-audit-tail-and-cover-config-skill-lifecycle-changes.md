---
id: ISSUE-070
title: "observability: unify audit.tail and cover config/skill lifecycle changes"
status: open
priority: p1
source: "next-batch planning 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - observability
  - audit
  - plugin-mainline-correction
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-observability
parallel_group: mv3-shell
depends_on:
  - ISSUE-066
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/src/runtime-services.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
---

## Goal

把 observability: unify audit.tail and cover config/skill lifecycle changes 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- observability-audit 模块当前没有 open issue，形成 module coverage gap。
- canonical audit contract 仍是 host-only，装不下 config.update 与 staged skills lifecycle 事件。
- app 侧仍以 audit.host / audit.intervention 分叉读面暴露状态，没有形成统一 audit.tail 真相源。

## Acceptance

- audit.tail 扩成统一 control-plane audit contract，至少覆盖 hosts.*、config.update 与 staged skills lifecycle 事件。
- MV3 shell 的 config.update 与已接入的 skills lifecycle 会写入同一条 audit tail。
- app integration 提供单一 audit.tail 读路径或资源文档，现有私有 audit.* 读面不再是主真相源。
- 测试锁住持久化、sessionId 关联和 tail 顺序稳定。
