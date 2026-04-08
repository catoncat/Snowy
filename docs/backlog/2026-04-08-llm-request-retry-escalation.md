---
id: ISSUE-090
title: "LLM request retry with backoff and profile escalation"
status: open
priority: p1
source: "gap analysis 2026-04-08"
created: 2026-04-08
assignee: unassigned
tags:
  - kernel
  - llm
  - retry
  - escalation
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on:
  - ISSUE-083
write_scope:
  - packages/kernel/src/loop-orchestrator.ts
  - packages/kernel/src/llm-profile-resolver.ts
  - packages/kernel/test/
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---

## Goal

为 LLM 请求添加 retry with exponential backoff，以及失败时的 profile escalation（自动切换到 fallback profile）。

## Context

旧仓 `requestLlmWithRetry` 实现了：
- 最多 maxAttempts+1 次重试
- Retryable status codes: [408, 409, 429, 500, 502, 503, 504]
- Exponential backoff (base * 2^attempt, max 4000ms)
- retry-after header 解析
- 重复相同 failure signature ≥2 次时触发 profile escalation（upgrade_only 策略）

新仓 `loop-orchestrator.ts` 目前 LLM 请求失败直接 throw，没有 retry。

## Acceptance

- LLM 请求失败时按 retryable status codes 自动重试
- 有 exponential backoff 和 max delay
- 重复失败时可触发 profile escalation（如果 orderedProfiles 有 fallback）
- 有测试覆盖 retry、backoff、escalation 路径
