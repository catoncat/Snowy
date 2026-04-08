---
id: ISSUE-085
title: "Side panel Vue 3 minimal chat UI"
status: open
priority: p0
source: "loop mainline plan 2026-04-08"
created: 2026-04-08
assignee: unassigned
tags:
  - mv3-shell
  - sidepanel
  - vue
  - ui
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: mainline
kind: slice
epic: EPIC-mv3-shell
parallel_group: mv3-shell
depends_on: []
write_scope:
  - apps/mv3-shell/src/sidepanel.html
  - apps/mv3-shell/src/sidepanel/
  - apps/mv3-shell/vite.config.js
  - apps/mv3-shell/package.json
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
---

## Goal

用 Vue 3 + Tailwind CSS 实现最小可用的 Side Panel chat 界面，替换当前空壳 HTML。

## Scope

1. Vue 3 app 入口
2. 消息列表组件（user / assistant / tool result）
3. 输入框 + 发送按钮
4. 流式输出显示（assistant delta 实时追加）
5. 工具调用折叠展示（显示 tool name + 结果摘要）
6. 运行状态指示（idle / running / stopped）
7. 停止按钮
8. 与 background service worker 的消息通信

## 不做

- Skill Studio UI
- 设置/配置面板
- 多 session 切换
- 高级 debug 面板
- 主题/暗色模式

## Acceptance

- Side panel 能显示 chat 消息流
- 输入框能发送消息到 background
- assistant 流式文本实时显示
- tool call 结果以折叠形式展示
- 运行中可点停止
- Vite build 成功，dist 输出正确
