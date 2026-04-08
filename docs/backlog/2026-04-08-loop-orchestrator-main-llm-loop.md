---
id: ISSUE-084
title: "Loop orchestrator: main LLM agent loop in kernel"
status: done
priority: p0
source: "loop mainline plan 2026-04-08"
created: 2026-04-08
assignee: opus-main
claimed_at: 2026-04-08T13:55:00.000Z
tags:
  - kernel
  - loop
  - orchestrator
  - llm
module_id: kernel
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on:
  - ISSUE-083
write_scope:
  - packages/kernel/src/loop-orchestrator.ts
  - packages/kernel/src/prompt-builder.ts
  - packages/kernel/src/tool-call-parser.ts
  - packages/kernel/src/kernel-facade.ts
  - packages/kernel/src/index.ts
  - packages/kernel/test/
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---

## Goal

在 kernel 中实现完整的 LLM agent loop，串联 "调 LLM → 解析 tool_use → dispatch capability → 记录结果 → 检查终止 → 循环"。

## Scope

1. LoopOrchestrator — 主循环编排
   - 调用 LLM provider 发送请求
   - 解析 streaming response
   - 提取 tool_calls，映射 tool name → capabilityId
   - 通过 kernel.executeStep 调度 capability
   - 记录结果到 session
   - 检查 terminal condition
   - 处理 compaction
2. PromptBuilder — system prompt 组装
   - 注入 capability tool list
   - 注入 task progress
   - 注入 available skills
3. ToolCallParser — LLM response 解析
   - tool name (snake_case) → capabilityId (dot notation) 映射
   - arguments JSON 解析
4. Kernel facade 扩展 — 暴露 runLoop() 方法
5. streaming 支持 — onDelta(chunk) 回调

## Acceptance

- runLoop(sessionId, prompt) 能完成完整循环
- tool_use 响应能正确映射到 capability dispatch
- streaming delta 回调能逐 chunk 触发
- terminal condition 检测正常工作
- compaction 在 context 超限时自动触发
- mock LLM 下的完整 loop 有测试覆盖
- `bun run check` 通过

## 工作总结

### 实现了什么

1. `loop-orchestrator.ts` — `runLoop()` 函数，实现完整 LLM agent loop：
   - 解析 LlmProfileConfig → LlmResolvedRoute
   - 将 CapabilityRegistry 的 ToolContract 投影为 OpenAI tools schema
   - 构建 system prompt（含 tool list，支持自定义 builder）
   - 从 kernel.buildContext 构建 LLM 消息上下文
   - 调用 LLM provider 发送 streaming 请求
   - 解析 SSE 响应，提取 text + tool_calls
   - tool name (snake_case) → capabilityId (dot notation) 映射
   - 通过 kernel.executeStep 调度每个 tool call
   - 记录 assistant 和 tool result 消息到 session
   - 检查 terminal condition（done/max_steps/stopped 等）
   - 自动触发 compaction（context 超限时）
   - 支持 onDelta/onToolCall/onToolResult 回调
   - 支持 AbortSignal 中断
2. 实现决策与原计划的偏离：
   - 没有拆出独立的 `prompt-builder.ts` 和 `tool-call-parser.ts`，因为逻辑简洁，内联在 orchestrator 中更清晰
   - 没有扩展 kernel-facade.ts，runLoop 是独立函数而非 Kernel 方法，保持 kernel 作为状态层的定位

### 实际跑了什么检查

- `bun run check` 全部通过
- 新增 4 个集成测试（纯文本响应、tool call 循环、streaming delta、abort signal），总计 377 tests 全通过

### 残留风险

- LLM 请求失败的 retry 逻辑未实现（直接抛错），后续可在 orchestrator 层加 retry with backoff
- system prompt 是最小默认实现，后续需要适配旧仓的 prompt policy（skills 注入、task progress 等）

## 相关 commits

- `2980339` feat(kernel): add loop orchestrator for end-to-end LLM agent loop (ISSUE-084)
