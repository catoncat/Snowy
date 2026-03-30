---
id: ISSUE-052
title: "Kernel B-2: run controller + loop engine skeleton"
status: done
priority: p0
source: "kernel skeleton design 2026-03-29"
created: 2026-03-29
assignee: copilot-opus
tags:
  - kernel
  - run-state
  - loop
module_id: kernel
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on:
  - ISSUE-051
write_scope:
  - packages/kernel/src/
  - packages/kernel/test/
  - docs/
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---

## Goal

把 kernel 的运行态主链从“只有 session store”推进到“有 run state 和 loop skeleton”，为后续 compaction 与 facade 接线提供稳定骨架。

## Design Basis

- `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
- `docs/kernel-skeleton-design.md`

Recovery report 已明确：真正缺的不是又一个 substrate family，而是 browser-side brain 的运行态主层。B-2 负责把这个主层的 run/loop 骨架立起来。

## Acceptance

- `packages/kernel` 至少新增 `RunController` 与 `LoopEngine`
- `RunController` 能表达 run phase 转换、queue enqueue/dequeue、retry state
- `LoopEngine` 能用 mock capability / mock step 驱动最小 turn 执行
- `no_progress` 至少有可测试的最小检测骨架
- 测试不依赖完整 MV3 环境，且不把 core/provider 细节硬塞进 kernel 实现

## Notes

- 本 slice 只做骨架，不提前实现完整 provider/profile/diagnostics
- 若发现 B-1 contracts 不足，先补 follow-up，再继续，不要在本 slice 偷偷扩 scope
