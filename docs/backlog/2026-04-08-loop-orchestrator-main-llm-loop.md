---
id: ISSUE-084
title: "Loop orchestrator: main LLM agent loop in kernel"
status: open
priority: p0
source: "loop mainline plan 2026-04-08"
created: 2026-04-08
assignee: unassigned
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
