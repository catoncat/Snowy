---
id: ISSUE-085
title: "Side panel Vue 3 minimal chat UI"
status: done
priority: p0
source: "loop mainline plan 2026-04-08"
created: 2026-04-08
assignee: codex-019d6d55
claimed_at: 2026-04-08T13:45:00.031Z
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
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/src/sidepanel.html
  - apps/mv3-shell/src/sidepanel/
  - apps/mv3-shell/package.json
  - apps/mv3-shell/test/manifest.spec.ts
  - apps/mv3-shell/test/runtime-chat.spec.ts
  - apps/mv3-shell/test/sidepanel-state.spec.ts
  - apps/mv3-shell/test/vite.config.spec.ts
  - apps/mv3-shell/vite.config.js
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

## 工作总结

- 用 Vue 3 + Tailwind CSS 重建了 `apps/mv3-shell/src/sidepanel/` 最小 chat UI，包含消息列表、输入框、运行状态、停止按钮和 tool result 折叠展示。
- 在 `apps/mv3-shell/src/background.js` 接入 `runtime.chat.bootstrap` / `runtime.chat.send` / `runtime.chat.stop` 路由，让 side panel 走现有 background runtime service。
- 新增 `apps/mv3-shell/test/runtime-chat.spec.ts`、`apps/mv3-shell/test/sidepanel-state.spec.ts`、`apps/mv3-shell/test/vite.config.spec.ts`，并补了 `apps/mv3-shell/test/manifest.spec.ts` 的单行 import 注释修正。
- 已运行：
  - `bun run test -- apps/mv3-shell/test/runtime-chat.spec.ts apps/mv3-shell/test/sidepanel-state.spec.ts apps/mv3-shell/test/vite.config.spec.ts`
  - `cd apps/mv3-shell && bun run build`
  - `bun run typecheck`
  - `bunx biome check apps/mv3-shell/src/background.js apps/mv3-shell/src/sidepanel/App.vue apps/mv3-shell/src/sidepanel/main.ts apps/mv3-shell/src/sidepanel/state.ts apps/mv3-shell/src/sidepanel/styles.css apps/mv3-shell/test/manifest.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts apps/mv3-shell/test/sidepanel-state.spec.ts apps/mv3-shell/test/vite.config.spec.ts apps/mv3-shell/vite.config.js`
  - `bun run check`（失败于 `packages/kernel/test/llm-kernel-adapter.spec.ts`、`packages/kernel/test/loop-orchestrator.spec.ts` 的既有/并行 Biome format debt，与本 issue write scope 无关）
- 残留范围：
  - 本 issue 不包含 `chrome.sidePanel` / action click 自动打开侧边栏 wiring；当前产物是 side panel UI 与 background chat 通路本身。

## 相关 commits

- `d2b8382 feat(mv3-shell): add minimal sidepanel chat ui`
