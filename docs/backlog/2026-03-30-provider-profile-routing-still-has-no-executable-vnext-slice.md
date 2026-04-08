---
id: ISSUE-074
title: "Review: provider/profile routing still has no executable vNext slice"
status: done
priority: p2
source: "current plan expansion 2026-03-30"
created: 2026-03-30
assignee: unassigned
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
depends_on:
  - ISSUE-067
  - ISSUE-072
write_scope:
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - packages/kernel/src/
  - packages/kernel/test/
  - docs/
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---

## Goal

把 provider/profile routing still has no executable vNext slice 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- module ledger 里 provider-profile-routing 仍是 not-started，且 backlog 里还没有任何可执行 slice
- recovery report 已把 provider/profile routing 列为必须专门跟踪的大项；如果不落票，后续 provider 选择容易回到 app-private glue 或 prompt 约定
- kernel/mainline 与 AI surface control-plane 稳定后，provider/profile 需要一个明确的 core-kernel 边界，而不是继续悬空

## Acceptance

- 明确 provider registry、profile resolution 与 kernel/core 之间的最小 contract，不再依赖 app-private 选择逻辑
- 至少一条真实 app or kernel integration path 能接收 resolved provider/profile context，并有测试锁定边界
- 文档说明哪些 provider/profile 能力属于后续 deferred 扩展，哪些属于 vNext 最小主链

## Resolution

ISSUE-083 实现了完整 provider/profile 层，本 issue 补齐 kernel 集成路径并关闭 gap。

### vNext 最小主链（已实现）

- `LlmProviderAdapter` / `LlmResolvedRoute` / `LlmMessage` 类型族 → contracts
- `LlmProviderRegistry` — provider 注册表 → kernel
- `resolveLlmRoute()` — single profile → route 解析 → kernel
- `createOpenAiCompatibleProvider()` — OpenAI-compatible adapter → kernel
- `readLlmMessageFromSseStream()` — SSE stream parser → kernel
- `contextMessagesToLlmMessages()` / `llmMessagesToApiPayload()` — message model → kernel
- `createKernelLlmFromProvider()` — provider/profile → KernelLlmAdapter 桥接 → kernel

### Deferred 扩展（后续 slice）

- Escalation / fallback profile 链式切换（profile ordered list 已预留，执行逻辑未实现）
- Per-lane profile 选择（primary / compaction / title 已建模，路由未接入）
- Provider health check / circuit breaker
- Non-OpenAI provider adapters（Anthropic, etc.）
- Rate limit / token budget 管理
