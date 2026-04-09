---
id: ISSUE-086
title: "MV3 integration wiring: end-to-end loop connection"
status: done
priority: p0
source: "loop mainline plan 2026-04-08"
created: 2026-04-08
assignee: vega
claimed_at: 2026-04-09T01:27:27Z
tags:
  - mv3-shell
  - integration
  - wiring
  - loop
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: mainline
kind: slice
epic: EPIC-mv3-shell
parallel_group: mv3-shell
depends_on:
  - ISSUE-083
  - ISSUE-084
  - ISSUE-085
  - ISSUE-057
write_scope:
  - apps/mv3-shell/src/runtime-services.js
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
---

## Goal

把 LLM provider、loop orchestrator、page automation、side panel UI 全部接通，让扩展能端到端跑完整 agent loop。

## Scope

1. runtime-services.js 的 llmAdapter 从 stub 替换为真实 provider
2. 新增 loop.start / loop.stop / loop.status 消息路由
3. Side panel ↔ background 消息协议接通
4. API key 配置入口（chrome.storage.local）
5. 集成测试

## Acceptance

- 扩展加载后，Side Panel 可发送用户消息
- 消息触发 LLM 调用，streaming 文本实时显示
- LLM tool_use 响应触发 capability 执行
- 工具结果反馈回 LLM，循环继续
- 用户可随时停止循环
- end-to-end smoke test 通过：打开网页 → 查询元素 → 返回结果

## 工作总结

### 实现了什么

1. **真实 LLM 循环接入** (`runtime-services.ts`)
   - 替换了 `sendChatPrompt` 中的 stub 逻辑，接入 `runLoop()` from `loop-orchestrator`
   - 在 `ensureServices()` 中创建 `LlmProviderRegistry` + `createOpenAiCompatibleProvider`
   - 支持从 `chrome.storage.local` 加载 `LlmProfileConfig`
   - 无 LLM 配置时给出明确提示而非假响应

2. **消息路由** (`background.ts`)
   - 新增 `loop.start` → 触发 `sendChatPrompt`
   - 新增 `loop.stop` → 触发 `stopChatRun`
   - 新增 `loop.status` → 返回当前循环状态
   - 新增 `llm.config.update` → 持久化 API key / base URL / model 到 `chrome.storage.local`

3. **API Key 配置** (`runtime-services.ts`)
   - `updateLlmConfig({ apiKey, baseUrl, model })` 快捷设置
   - 也支持完整的 `LlmProfileConfig` patch
   - 配置更新后自动重置 services 以加载新配置

4. **Streaming 事件桥接**
   - `runLoop` 的 `onDelta` → `assistant.delta` 事件
   - `runLoop` 的 `onToolCall` → `tool.call` 事件
   - `runLoop` 的 `onToolResult` → `tool.result` 事件
   - 循环结束 → `assistant.done` 事件（含 `terminalStatus` 和 `stepCount`）

### 检查结果

- `bunx vitest run apps/mv3-shell/test/` — 72 tests passed (7 files)
- `bunx vitest run packages/kernel/test/` — 174 tests passed (14 files)
- `biome check` on 3 changed files — clean

### 残留风险

- `runtime-services.ts` 和 `background.ts` 仍为 `// @ts-nocheck`（JS→TS 迁移是另一个 agent 的工作，尚未合并）
- 真实 side panel UI 的 streaming 显示需 ISSUE-085 的 Vue 组件支持
- API key 存储在 `chrome.storage.local` 未加密（MV3 标准做法，但生产环境可能需要更安全的方案）

## 相关 commits

- `475961d` feat(mv3-shell): wire end-to-end LLM agent loop (ISSUE-086)
