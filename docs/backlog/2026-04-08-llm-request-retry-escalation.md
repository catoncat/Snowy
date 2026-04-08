---
id: ISSUE-090
title: "LLM request retry with backoff and profile escalation"
status: done
priority: p1
source: "gap analysis 2026-04-08"
created: 2026-04-08
assignee: codex-019d6dbd
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
completed_at: 2026-04-08T16:37:28.000Z
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

## 工作总结

### 实现了什么
- 在 `packages/kernel/src/loop-orchestrator.ts` 新增 `requestLlmWithRetry()`，对 `408/409/429/500/502/503/504` 做自动重试、解析 `retry-after`、按指数退避并受 `llmMaxRetryDelayMs` 限制
- 在重复相同 failure signature 时按 `orderedProfiles` 执行 upgrade-only profile escalation，并把切换后的 profile/model 用到后续请求
- 增加 `getLoopMaxSteps()` 兼容层，避免依赖共享脏改里的 `loop.getMaxSteps()` 才能跑通验证
- 在 `packages/kernel/test/loop-orchestrator.spec.ts` 补 retry、backoff、escalation 路径测试

### 实际跑了什么检查
- `bun run test -- packages/kernel/test/loop-orchestrator.spec.ts`
- `./node_modules/.bin/biome check packages/kernel/src/loop-orchestrator.ts packages/kernel/test/loop-orchestrator.spec.ts`
- 以上两项额外在 `git checkout-index` 导出的 `/tmp/issue090-verify` 索引快照中复验，确认只靠本票 staged 内容也能通过

### 残留风险
- `packages/kernel/src/loop-orchestrator.ts` 与 `packages/kernel/test/loop-orchestrator.spec.ts` 当前仍有并行未提交脏改；本票 commit 已通过索引快照隔离验证，但工作树本身仍不是干净基线

## 相关 commits

- `2144d84188cf` feat(kernel): retry llm requests with escalation
