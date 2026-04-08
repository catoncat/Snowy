---
id: ISSUE-083
title: "LLM provider/profile layer migration to kernel"
status: open
priority: p0
source: "loop mainline plan 2026-04-08"
created: 2026-04-08
assignee: unassigned
tags:
  - kernel
  - llm
  - provider
  - profile
  - migration
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/kernel/src/llm-provider-registry.ts
  - packages/kernel/src/llm-profile-resolver.ts
  - packages/kernel/src/llm-openai-provider.ts
  - packages/kernel/src/llm-stream-parser.ts
  - packages/kernel/src/llm-message-model.ts
  - packages/kernel/src/index.ts
  - packages/kernel/test/
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
---

## Goal

将旧仓的 LLM provider/profile 层适配迁入新仓 kernel，使新仓具备调用 LLM API 的能力。

## Scope

1. Types 进 contracts：LlmProviderAdapter, LlmResolvedRoute, LlmMessage 类型族（assistant content blocks, tool call blocks, context messages）
2. kernel 内部实现：
   - LlmProviderRegistry — provider 注册表
   - resolveLlmRoute() — profile → route 解析（初始只做 single profile，escalation 后补）
   - OpenAI-compatible provider — 标准 OpenAI API 格式请求
   - SSE stream parser — readLlmMessageFromSseStream()
   - Message model — session entry ↔ LLM message 双向转换
3. Provider/profile 是 kernel 内部设施，不暴露为 CapabilityDescriptor

## Acceptance

- LlmProviderAdapter 接口可注册 OpenAI-compatible provider
- resolveLlmRoute 能从 profile config 解析出完整 route
- SSE stream parser 能解析 OpenAI streaming response 并累积为完整 message（含 tool_calls）
- session entry → LLM message 转换经过测试（含 compaction 重建场景）
- LLM message → session entry 转换经过测试（含 assistant content blocks）
- 所有新增代码有对应单元测试
- `bun run check` 通过
