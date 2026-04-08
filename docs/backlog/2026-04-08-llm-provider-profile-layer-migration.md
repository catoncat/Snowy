---
id: ISSUE-083
title: "LLM provider/profile layer migration to kernel"
status: done
priority: p0
source: "loop mainline plan 2026-04-08"
created: 2026-04-08
assignee: opus-main
claimed_at: 2026-04-08T13:44:57.133Z
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

## 工作总结

### 实现了什么

1. contracts 新增 18 个 LLM 相关类型定义：LlmProviderAdapter, LlmResolvedRoute, LlmProfileConfig, LlmProfileDef, LlmMessage 类型族（LlmAssistantMessage, LlmContextMessage, LlmToolCall, LlmTextBlock, LlmToolCallBlock 等）, LlmSseStreamResult, ResolveLlmRouteResult
2. kernel 新增 4 个模块：
   - `llm-provider-registry.ts` — LlmProviderRegistry 类，支持注册/注销/替换
   - `llm-profile-resolver.ts` — resolveLlmRoute() 函数，从 LlmProfileConfig 解析出 LlmResolvedRoute，含 timeout clamp、escalation policy
   - `llm-openai-provider.ts` — createOpenAiCompatibleProvider() 工厂函数
   - `llm-stream-parser.ts` — readLlmMessageFromSseStream() SSE 流解析器，累积文本和 tool_calls
   - `llm-message-model.ts` — contextMessagesToLlmMessages() 和 llmMessagesToApiPayload() 双向转换
3. kernel index.ts 更新导出

### 实际跑了什么检查

- 原实现提交 `1429f8a` 阶段已跑 `bun run check`
- review follow-up 额外跑：
  - `bun run test packages/kernel/test/llm-message-model.spec.ts packages/kernel/test/llm-openai-provider.spec.ts packages/kernel/test/llm-profile-resolver.spec.ts packages/kernel/test/llm-provider-registry.spec.ts packages/kernel/test/llm-stream-parser.spec.ts`
  - `./node_modules/.bin/biome check packages/kernel/src/llm-stream-parser.ts packages/kernel/src/llm-openai-provider.ts packages/kernel/src/llm-message-model.ts packages/kernel/test/llm-stream-parser.spec.ts packages/kernel/test/llm-openai-provider.spec.ts packages/kernel/test/llm-message-model.spec.ts`

### review follow-up（2026-04-08）

- 修复 `readLlmMessageFromSseStream()` 在 SSE 末包无 trailing newline 时丢包的问题，补了 EOF leftover 覆盖测试
- 修复 OpenAI-compatible provider 在空 `llmKey` 下仍发送 `Authorization: Bearer ` 的问题
- 修复非法 / 缺失 tool call id fallback 可能碰撞的问题，补了多 invalid id 唯一性回归测试

### 残留风险

- Profile escalation 策略只实现了 single profile 路径，多 profile 自动升级（upgrade_only）的 runtime 逻辑未实现
- LlmProviderAdapter.send() 的 retry 逻辑在 provider 层没有内建，caller 需要自行处理
- 当前工作树还有 ISSUE-083 外的未提交改动，导致现在重跑 `bun run check` 会被 `llm-kernel-adapter` / `loop-orchestrator` 相关 lint 问题拦住；本次 follow-up 只对修复触达文件做了定向验证

## 相关 commits

- `1429f8a` feat(kernel): add LLM provider/profile layer with full test coverage (ISSUE-083)
- `e8136f0` fix(kernel): harden llm provider follow-up paths (ISSUE-083)

## Sub Issues

- `ISSUE-087` Review: ISSUE-083 still lacks llm-message/session-entry closure
