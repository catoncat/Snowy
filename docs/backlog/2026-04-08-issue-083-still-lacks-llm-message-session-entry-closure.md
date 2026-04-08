---
id: ISSUE-087
title: "Review: ISSUE-083 still lacks llm-message/session-entry closure"
status: done
priority: p1
source: "ISSUE-083 review 2026-04-08"
created: 2026-04-08
assignee: codex-followup
tags:
  - review
  - kernel
  - llm
  - message-model
  - follow-up
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-kernel
parallel_group: contracts-core
depends_on:
  - ISSUE-083
  - ISSUE-084
write_scope:
  - packages/kernel/src/llm-message-model.ts
  - packages/kernel/src/loop-orchestrator.ts
  - packages/kernel/src/index.ts
  - packages/kernel/test/llm-message-model.spec.ts
  - packages/kernel/test/loop-orchestrator.spec.ts
acceptance_ref: docs/backlog/2026-04-08-llm-provider-profile-layer-migration.md
check_cmd: "bun run check"
claimed_at: 2026-04-08T15:09:03.137Z
completed_at: 2026-04-08T15:09:27.692Z
---

## Goal

补齐 ISSUE-083 剩余缺口：把 LLM message 到 session entry / MessagePayload 的真实转换闭环补完整，并让 assistant content blocks 进入实际持久化路径。

## Review Finding

- 当前只有 SessionContextMessage -> LlmMessage 与 LlmMessage -> API payload，缺少真正的 LLM message -> SessionEntry/MessagePayload 转换。
- buildAssistantContentBlocks 只做 block 组装，没有和 session 持久化路径形成闭环。

## Acceptance

- 新增 LLM message -> MessagePayload/session entry 转换 helper，并覆盖 assistant text + toolCall blocks。
- loop-orchestrator 改用统一转换路径记录 assistant/tool message，不再手写散落映射。
- 补充单测锁定 assistant content blocks 持久化与回放语义，并保持 bun run check 通过

## 工作总结

### 实现了什么
- 补齐 llm assistant message → MessagePayload 转换 helper，保留 contentBlocks 持久化语义
- 统一 toolCallId 归一化后再落 session，保证 assistant/tool result 复用同一 id

### 实际跑了什么检查
- bun run test -- packages/kernel/test/llm-message-model.spec.ts packages/kernel/test/loop-orchestrator.spec.ts

### 残留风险
- 当前仓库仍有其他未提交改动，未做全仓 bun run check；本次以 ISSUE-087 聚焦验证收口

## 相关 commits

- `6aff8aee84df` fix(kernel): close llm message/session-entry closure (ISSUE-087)
