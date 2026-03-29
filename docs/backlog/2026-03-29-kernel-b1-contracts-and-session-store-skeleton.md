---
id: ISSUE-051
title: "Kernel B-1: contracts + session store skeleton"
status: open
priority: p0
source: "kernel skeleton design 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - kernel
  - contracts
  - session
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/kernel/src/
  - packages/kernel/test/
  - docs/
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---

## Goal

把 `docs/kernel-skeleton-design.md` 的 B-1 正式落成 backlog slice，补齐 kernel 所需的 contracts 基础类型，并建立可测试的 session store 骨架。

## Design Basis

- `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
- `docs/kernel-skeleton-design.md`

当前新仓已经完成 substrate foundation，但 browser-side kernel 仍未成为正式主线。B-1 的职责是先把 kernel 的 canonical types 和 session storage/session store 骨架站稳。

## Acceptance

- `packages/contracts` 暴露 kernel 所需的 session / run / loop / compaction canonical types
- `packages/kernel` package 正式可用，至少包含 `SessionStore` 和测试用 `InMemorySessionStorage`
- `SessionStore.buildContext()` 能正确处理 compaction entry，生成 `compactionSummary` + kept messages
- `packages/kernel/test/` 有对应单元测试，且不依赖完整 MV3 环境
- 本 slice 完成后，`workflow:claim:preview` 不再把 kernel 继续当隐性任务

## Notes

- 本 slice 只做 B-1，不提前把 run controller / loop engine / compaction manager 混进来
- 若 contracts 类型需要微调，以 `docs/kernel-skeleton-design.md` 为准，不要回退到旧 orchestrator 形状
