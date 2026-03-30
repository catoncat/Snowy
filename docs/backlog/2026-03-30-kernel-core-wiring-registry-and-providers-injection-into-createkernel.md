---
id: ISSUE-060
title: "kernel: core wiring — registry and providers injection into createKernel"
status: done
priority: p1
source: review
created: 2026-03-30
assignee: copilot-opus
tags:
  - review
  - follow-up
  - kernel
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/kernel-facade.ts
  - packages/core/src/index.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---

## Goal

把 kernel: core wiring — registry and providers injection into createKernel 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- createKernel() facade only accepts storage + llm adapters; no CapabilityRegistry or FamilyProviderRegistry injection

## Acceptance

- createKernel accepts CapabilityRegistry and can dispatch capability calls through the loop
- Integration test proves kernel loop can invoke a registered capability

## 工作总结

- 在 `packages/core/src/index.ts` 增加 `dispatchCapabilityCall()` helper，把 registry/providers + runtime context 的最小 dispatch 路径收口成可复用 helper。
- 在 `packages/kernel/src/kernel-facade.ts` 让 `createKernel()` 正式接受 `registry` / `providers` / `dispatch` 配置，并通过 `executeStep()` 走 loop turn + core dispatch 完成 capability 调用。
- 在 `packages/core/test/core.spec.ts` 与 `packages/kernel/test/kernel-facade.spec.ts` 补了 capability dispatch 集成测试，锁定“注册 capability → kernel loop 执行 → turn 记录结果”链路。
- 已验证：`bun run typecheck`、`bun x biome check packages/core/src/index.ts packages/core/test/core.spec.ts packages/kernel/src/kernel-facade.ts packages/kernel/test/kernel-facade.spec.ts docs/kernel-skeleton-design.md`、`bun x vitest run packages/core/test/core.spec.ts packages/kernel/test/kernel-facade.spec.ts`。
- 备注：仓库级 `bun run check` 当前仍被工作区内既有的 `.codex/hooks/*` 与 workflow 脚本格式问题阻塞，不是本 slice 改动引入的新错误。

## 相关 commits

- none (workspace changes not committed in this session)
