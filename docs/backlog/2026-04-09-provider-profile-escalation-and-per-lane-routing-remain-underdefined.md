---
id: ISSUE-114
title: "Review: provider/profile escalation and per-lane routing remain underdefined"
status: done
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: codex-019d70f6
tags:
  - review
  - provider
  - profile
  - routing
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/kernel/src/llm-profile-resolver.ts
  - packages/kernel/src/llm-kernel-adapter.ts
  - packages/kernel/test
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
completed_at: 2026-04-09T12:03:26.905Z
---

## Goal

Review the remaining routing contract around provider/profile escalation and lane-specific model selection so future LLM paths do not fall back to app-private heuristics.

## Review Finding

- Current route resolution only orders `targetProfile` plus `fallbackProfile`, and `createKernelLlmFromProvider()` always resolves a worker lane from one profile snapshot.
- ISSUE-111 landed provider health and capability negotiation, but per-lane profile selection and multi-step escalation / fallback policy still remain partially modeled or explicitly deferred.
- Without a locked routing contract, provider choice can drift back into app-private heuristics when new lanes or failure modes are added.

## Acceptance

- Decide the minimal vNext contract for per-lane profile selection and ordered fallback / escalation.
- Either create executable follow-up slices for routing semantics or document explicit deferred boundaries in planning truth.
- Keep tests and docs pointing at one source of truth for route negotiation responsibilities.

## Resolution

- Reviewed the current provider/profile path in `packages/contracts`, `llm-profile-resolver`, `llm-kernel-adapter`, `kernel-facade`, `loop-orchestrator`, and `compaction-manager`.
- Conclusion: this is still a visible `provider-profile-routing` mainline gap, but it is now narrowed to execution-lane-aware initial route selection plus an explicit ordered profile chain contract. It should not be silently deferred back into app-private heuristics.
- Today the model already exposes `LLM_PROVIDER_EXECUTION_LANES`, `LlmProviderSendInput.lane`, and `auxProfile`, yet route resolution still only builds `[targetProfile, fallbackProfile]`, `createKernelLlmFromProvider()` hard-codes a worker snapshot, and compaction/title-facing paths cannot declare a lane-specific route root.

## Sub Issues

- `ISSUE-121` `Follow-up: add execution-lane-aware profile routing to the kernel LLM path`
  - 原因：把剩余缺口收窄为 lane-aware 初始 profile 选择、ordered profile chain，以及 loop/compaction/title entrypoint 的显式接线。
  - 结果：继续由 `provider-profile-routing` 模块承接，不把 provider policy 回退为 app-local glue。

## 工作总结

### 实现了什么
- 审查 provider/profile routing 当前 contract，确认 residual gap 已收窄为 execution-lane-aware 初始 route 选择与 ordered profile chain。
- 新增 ISSUE-121，并在 kernel-skeleton-design 标注当前仅到 base profile routing，lane-aware routing 继续 follow-up。

### 实际跑了什么检查
- bun run workflow:queue:build
- git diff --check

### 残留风险
- 无

## 相关 commits

- `990efeb042e5` docs(kernel): 收口lane路由review并补follow-up
