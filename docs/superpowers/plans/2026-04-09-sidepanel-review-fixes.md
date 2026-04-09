# Sidepanel Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 sidepanel chat 的真实组件渲染测试，并把渲染 helper 从 state 模块拆出。

**Architecture:** 新增独立 render helper 模块承载 markdown / tool trace 渲染；新增一个轻量 transcript 组件封装 chat pane 渲染与 toggle emit；`App.vue` 只做接线，`state.ts` 只保留状态/event 逻辑。

**Tech Stack:** Vue 3、Vitest、Vue SSR renderer、TypeScript

---

### Task 1: 拆出 render helper

**Files:**
- Create: `apps/mv3-shell/src/sidepanel/renderers.ts`
- Modify: `apps/mv3-shell/src/sidepanel/state.ts`
- Test: `apps/mv3-shell/test/sidepanel-state.spec.ts`

- [ ] Step 1: 先更新 `sidepanel-state.spec.ts`，把 helper import 指向新模块。
- [ ] Step 2: 运行 `bunx vitest run apps/mv3-shell/test/sidepanel-state.spec.ts`，确认因模块不存在而失败。
- [ ] Step 3: 新建 `renderers.ts`，迁移 `renderMessageRichText()` / `renderToolTrace()` 与相关类型/私有 helper。
- [ ] Step 4: 从 `state.ts` 删除渲染 helper，只保留 state/event 逻辑并修复导出。
- [ ] Step 5: 运行 `bunx vitest run apps/mv3-shell/test/sidepanel-state.spec.ts`，确认恢复通过。

### Task 2: 引入 transcript 组件并补真实渲染测试

**Files:**
- Create: `apps/mv3-shell/src/sidepanel/chat-transcript-pane.ts`
- Modify: `apps/mv3-shell/src/sidepanel/App.vue`
- Modify: `apps/mv3-shell/test/sidepanel-app.spec.ts`

- [ ] Step 1: 先把 `sidepanel-app.spec.ts` 改成真实组件测试，覆盖 markdown 渲染、plain fallback、tool toggle emit。
- [ ] Step 2: 运行 `bunx vitest run apps/mv3-shell/test/sidepanel-app.spec.ts`，确认先失败。
- [ ] Step 3: 新建 `chat-transcript-pane.ts`，用 render function 输出 transcript 列表并发出 `toggleTool` 事件。
- [ ] Step 4: 修改 `App.vue` 改用 `ChatTranscriptPane`，保留现有 loading / empty / toggleTool 接线。
- [ ] Step 5: 运行 `bunx vitest run apps/mv3-shell/test/sidepanel-app.spec.ts apps/mv3-shell/test/sidepanel-state.spec.ts`，确认通过。

### Task 3: 完成验证

**Files:**
- Modify: `apps/mv3-shell/src/sidepanel/styles.css`（仅当组件抽取后需要补样式）

- [ ] Step 1: 运行 `./node_modules/.bin/biome check apps/mv3-shell/src/sidepanel/App.vue apps/mv3-shell/src/sidepanel/state.ts apps/mv3-shell/src/sidepanel/styles.css apps/mv3-shell/src/sidepanel/renderers.ts apps/mv3-shell/src/sidepanel/chat-transcript-pane.ts apps/mv3-shell/test/sidepanel-app.spec.ts apps/mv3-shell/test/sidepanel-state.spec.ts`。
- [ ] Step 2: 运行 `cd apps/mv3-shell && bun run build`。
- [ ] Step 3: 检查 `wc -l apps/mv3-shell/src/sidepanel/state.ts`，确认状态文件已显著下降，不再携带渲染职责。
