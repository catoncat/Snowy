---
id: ISSUE-156
title: "Review: chat tool projection still ignores descriptor default exposure metadata"
status: done
priority: p1
source: review
created: 2026-04-16
assignee: codex-019d943a
tags:
  - review
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-ai-surface
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/kernel/src/loop-orchestrator.ts
  - packages/kernel/test/loop-orchestrator.spec.ts
acceptance_ref: docs/ai-surface-index.md
check_cmd: "bun run check"
completed_at: 2026-04-16T05:36:21.395Z
---

## Goal

把 chat tool projection still ignores descriptor default exposure metadata 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- Kernel chat tool projection still calls registry.projectTools() without audience/defaultExposed filtering
- so the new descriptor-owned projection metadata is not yet enforced for chat-facing tool surfaces.

## Acceptance

- Kernel chat tool projection uses descriptor-owned audience/defaultExposed metadata instead of project-all semantics
- Tests lock that chat-facing tool surfaces exclude descriptors with defaultExposed=false unless explicitly requested

## 工作总结

### 实现了什么
- runLoop 改为只投影 chat audience 且 defaultExposed=true 的默认工具
- 补充 loop orchestrator 测试，锁定 hidden/system-only descriptor 不进入 chat LLM 请求

### 实际跑了什么检查
- bunx vitest run packages/kernel/test/loop-orchestrator.spec.ts
- ./node_modules/.bin/biome check packages/kernel/src/loop-orchestrator.ts packages/kernel/test/loop-orchestrator.spec.ts

### 残留风险
- 无

## 相关 commits

- `4d37b1870ce9` fix(kernel): 收紧聊天工具投影过滤
