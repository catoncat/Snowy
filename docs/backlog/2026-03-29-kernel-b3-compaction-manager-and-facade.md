---
id: ISSUE-053
title: "Kernel B-3: compaction manager + kernel facade"
status: open
priority: p0
source: "kernel skeleton design 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - kernel
  - compaction
  - facade
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on:
  - ISSUE-052
write_scope:
  - packages/kernel/src/
  - packages/kernel/test/
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - docs/
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---

## Goal

把 B-1/B-2 的 kernel 子系统收口成最小可组合主层，补齐 compaction manager 和 facade，使新仓第一次具备真正的 browser-side kernel 主链雏形。

## Design Basis

- `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
- `docs/kernel-skeleton-design.md`

kernel mainline 不能一直停留在“设计文档 + 局部骨架”。B-3 的职责是把 compaction 和 facade 收口为一个可继续演进的主脑入口。

## Acceptance

- `packages/kernel` 至少新增 `CompactionManager`
- compaction path 覆盖：trigger / draft / summary / apply 的最小闭环
- facade 能组合 session store、run controller、loop engine、compaction manager
- facade 与 `packages/core` 的边界清晰：kernel 负责编排，不把 capability registry 逻辑复制进 kernel
- 至少有一条集成测试覆盖 session -> loop -> compaction -> context rebuild

## Notes

- 本 slice 不要求同时做完整 diagnostics / intervention / provider routing
- 如需新增 public contract，必须同步过 Doc Freshness Gate
