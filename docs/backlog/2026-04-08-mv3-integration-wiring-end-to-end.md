---
id: ISSUE-086
title: "MV3 integration wiring: end-to-end loop connection"
status: open
priority: p0
source: "loop mainline plan 2026-04-08"
created: 2026-04-08
assignee: unassigned
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
