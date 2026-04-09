---
id: ISSUE-121
title: "Follow-up: add execution-lane-aware profile routing to the kernel LLM path"
status: done
priority: p1
source: "ISSUE-114 review 2026-04-09"
created: 2026-04-09
assignee: codex-019d70f6
tags:
  - review
  - follow-up
  - provider
  - profile
  - routing
  - lane
  - escalation
  - compaction
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-kernel
parallel_group: contracts-core
depends_on:
  - ISSUE-114
write_scope:
  - packages/contracts/src/index.ts
  - packages/kernel/src/llm-profile-resolver.ts
  - packages/kernel/src/llm-kernel-adapter.ts
  - packages/kernel/src/loop-orchestrator.ts
  - packages/kernel/src/compaction-manager.ts
  - packages/kernel/src/kernel-facade.ts
  - packages/kernel/test
  - docs/kernel-skeleton-design.md
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
completed_at: 2026-04-09T12:10:10.439Z
---

## Goal

Define the minimal executable contract for lane-aware profile selection and ordered profile fallback so kernel-owned LLM paths stop relying on implicit worker/primary defaults.

## Review Finding

- Current contracts already model execution lanes (`LLM_PROVIDER_EXECUTION_LANES`), provider send lane, and an `auxProfile` hook, but `resolveLlmRoute()` still derives `orderedProfiles` from `targetProfile` plus `fallbackProfile` only and cannot choose a lane root.
- `createKernelLlmFromProvider()` always resolves a worker route from one profile snapshot, while `CompactionManager` only sees `KernelLlmAdapter.complete()` with no explicit lane signal.
- Loop retry escalation already works inside one `orderedProfiles` list, but the config and adapter path still do not define how `primary` / `compaction` / `title` lanes pick their initial profile chains.

## Acceptance

- `resolveLlmRoute()` accepts an explicit execution lane (or equivalent canonical selector) and derives the initial profile / ordered escalation chain from config rather than app heuristics.
- Kernel-owned LLM entrypoints that represent different lanes (loop primary, compaction, title/metadata if present) thread that lane information through route resolution or explicitly lock what remains deferred.
- Tests and kernel docs lock the vNext boundary for lane-aware routing versus still-deferred provider policy work.

## 工作总结

### 实现了什么
- 在 LlmProfileConfig / resolveLlmRoute 增加 laneProfiles 与 lane-aware ordered profile chain，primary/compaction/title 入口不再只靠 implicit default/fallback。
- createKernelLlmFromProvider 默认按 compaction lane 解路由，kernel facade 支持按 lane 读取 active profile，loop-orchestrator 显式锁 primary lane。
- 补齐 resolver/adapter/facade 测试，并同步 kernel-skeleton-design 对 provider/profile routing 的实现快照。

### 实际跑了什么检查
- bunx vitest run packages/kernel/test/llm-profile-resolver.spec.ts packages/kernel/test/llm-kernel-adapter.spec.ts packages/kernel/test/kernel-facade.spec.ts
- bunx vitest run packages/contracts/test/contracts.spec.ts packages/kernel/test/llm-profile-resolver.spec.ts packages/kernel/test/llm-kernel-adapter.spec.ts packages/kernel/test/kernel-facade.spec.ts packages/kernel/test/loop-orchestrator.spec.ts
- ./node_modules/.bin/biome check packages/contracts/src/index.ts packages/kernel/src/llm-profile-resolver.ts packages/kernel/src/llm-kernel-adapter.ts packages/kernel/src/kernel-facade.ts packages/kernel/src/loop-orchestrator.ts packages/kernel/test/llm-profile-resolver.spec.ts packages/kernel/test/llm-kernel-adapter.spec.ts packages/kernel/test/kernel-facade.spec.ts docs/kernel-skeleton-design.md
- git diff --check

### 残留风险
- 更广的 provider policy hardening 仍属后续 follow-up；本票只锁 lane-aware profile selection 与 ordered profile chain contract。

## 相关 commits

- `7889d32c2f48` feat(kernel): 增加lane感知profile路由
