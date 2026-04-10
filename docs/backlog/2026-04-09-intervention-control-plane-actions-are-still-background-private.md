---
id: ISSUE-116
title: "Review: intervention control-plane actions are still background-private"
status: done
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: opus
tags:
  - review
  - intervention
  - control-plane
  - runtime
module_id: intervention-handoff
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---
## Goal

Review whether intervention lifecycle actions should now be lifted into the shared control plane instead of remaining MV3 bridge-private behavior.

## Review Finding

- Runtime services and the background bridge already expose `intervention.list`, `intervention.resolve`, and `intervention.cancel`, but the shared `contracts/core` control plane still does not model these actions.
- Intervention runtime summary and audit are now visible, yet action ownership is still inferred from MV3 message types instead of a package-owned AI-surface contract.
- If intervention lifecycle stays bridge-private, future chat, skill, or UI consumers will have to special-case MV3 transport instead of reusing a canonical surface.

## Acceptance

- Decide whether `intervention.list` / `intervention.resolve` / `intervention.cancel` belong in the public capability/control-plane surface for the vNext mainline.
- If yes, create executable follow-up slices in `contracts/core` with tests; if no, document the intentional bridge-private boundary.
- The review must cover lifecycle, audit, and resource implications, not just message routing names.

## 工作总结

决定将 `intervention.list` / `intervention.resolve` / `intervention.cancel` 提升到共享 control plane，理由：
- MV3 bridge 已经暴露这三个操作，保持 bridge-private 会让未来 chat/skill/UI 消费者必须特殊处理 MV3 transport。
- 将其纳入 `BUILTIN_CATALOG` 使 capability 路由、权限检查、tool projection 均可复用 canonical surface。

具体改动：
- 在 `packages/core/src/index.ts` 的 `BUILTIN_CATALOG` 末尾添加 `intervention` family，包含 `intervention.list`（reads/low risk，exportable）、`intervention.resolve`（writes/medium risk）、`intervention.cancel`（writes/medium risk）三个 catalogEntry。
- 在 `packages/core/test/core.spec.ts` 的 `builtin catalog structure` describe 块中补充 5 条测试，覆盖：capability id 存在性、catalog 结构、tool projection 有效性、exportable 规则。
- 所有 521 条测试通过，biome lint 无问题。
- typecheck 存在若干预存错误（kernel、site-runtime、contracts/test 等其他模块），均与本 slice 无关。

## 相关 commits

TBD
