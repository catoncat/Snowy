---
id: ISSUE-150
title: "Review: provider policy taxonomy is still kernel-local"
status: done
priority: p1
source: review
created: 2026-04-16
assignee: sable
tags:
  - review
  - provider
  - routing
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-provider-routing
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/kernel/src/llm-profile-resolver.ts
  - packages/kernel/src/llm-kernel-adapter.ts
  - packages/kernel/src/kernel-facade.ts
  - packages/kernel/test
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
completed_at: 2026-04-17T09:26:11Z
---

## Goal

把 provider policy taxonomy is still kernel-local 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- Module ledger still marks provider/profile routing as partial because capability taxonomy remains coarse and reusable policy routing is still confined to kernel-owned lanes.
- The migration matrix says finer capability taxonomy, non-kernel rollout, and richer provider policy inputs are still unresolved after the current kernel follow-ups.

## Acceptance

- Contracts define a reusable provider capability or policy taxonomy beyond hard-coded primary compaction and title lanes
- Kernel exposes a reusable routing surface that non-kernel callers can use while preserving lane-aware profile resolution and escalation policy
- Tests cover non-kernel policy selection fallback and provider routing behavior

## 工作总结

### 实现了什么
- 在 `packages/contracts` 新增 contracts-owned `LLM_PROFILE_CAPABILITY_POLICIES` taxonomy，用 `chat` / `chat_with_tools` 把 provider capability 要求从 kernel lane 名称里拆出来。
- 在 `packages/kernel` 新增 `kernel.resolveProviderRoute()`，让非 kernel 调用方也能复用同一套 lane-aware ordered profile chain、provider health negotiation 与 capability fallback 逻辑。
- 让 `createKernelLlmFromProvider()` 既支持显式 policy，也继续兼容 lane-derived default policy；并补齐 resolver / facade 回归测试，锁住非 kernel caller 的 fallback 行为。

### 实际跑了什么检查
- `bun run test -- packages/kernel/test/llm-profile-resolver.spec.ts packages/kernel/test/kernel-facade.spec.ts packages/kernel/test/llm-kernel-adapter.spec.ts`
- `./node_modules/.bin/biome check packages/contracts/src/index.ts packages/kernel/src/llm-profile-resolver.ts packages/kernel/src/llm-kernel-adapter.ts packages/kernel/src/kernel-facade.ts packages/kernel/test/llm-profile-resolver.spec.ts packages/kernel/test/kernel-facade.spec.ts`
- `bun run check`（失败：write scope 外 `packages/core/test/core.spec.ts` 仍有既有类型错误，当前报错集中在 649/656/660/662 行对 `entries` 的联合类型访问）

### 残留风险
- 本次未执行 `workflow:done` / queue rebuild：canonical workspace 中 `docs/workflow/live-queue.json` 与 backlog 控制文件已有并行改动，且 live lease 仍由其他 session 持有；若直接重建 queue，会把当前并行 workflow 状态一并改写。

## 相关 commits

- `4b2f43d` `fix(kernel): 收口 provider 路由策略分类`
