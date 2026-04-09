# Sidepanel review fixes design

日期：2026-04-09

## 背景

`ISSUE-109` 已完成基础富文本与 tool trace 可读性增强，但 code review 发现两类工程问题：

1. 现有测试主要验证 helper / 源码字符串，未覆盖 `App.vue` 的真实渲染与展开交互。
2. `apps/mv3-shell/src/sidepanel/state.ts` 与 `App.vue` 继续增长，违反仓库对单文件大小的约束意图。

## 目标

在不改变 runtime event model / `ChatState` 结构的前提下：

1. 补上 sidepanel chat 的真实组件渲染回归测试。
2. 将富文本与 tool trace 渲染逻辑从 `state.ts` 中拆出，降低状态文件职责。
3. 保持当前 UI 表现与外部行为不变。

## 非目标

1. 不调整 runtime background / chat event 协议。
2. 不重做 sidepanel 页面结构。
3. 不在本轮继续把 chat pane 拆成多个 Vue 子组件。

## 方案对比

### 方案 A：只补组件测试

- 优点：改动小
- 缺点：文件职责问题仍然存在

### 方案 B：补组件测试 + 拆 helper（采用）

- 新增独立 render helper 模块，承载 markdown / tool trace 渲染
- `state.ts` 只保留 state/event 相关逻辑
- 增加组件级测试验证真实 DOM 渲染与点击展开

### 方案 C：继续拆 Vue 子组件

- 优点：结构最干净
- 缺点：本轮改动面过大，超出“修 review finding”的最小范围

## 采用方案

采用方案 B。

## 设计

### 1. 文件拆分

新增一个 sidepanel 渲染 helper 文件，负责：

- `renderMessageRichText(text)`
- `renderToolTrace(summary, detail)`

`state.ts` 只保留：

- `ChatState` / `ChatItem` / `ChatEvent` 类型
- `createInitialChatState()`
- `applyBootstrapState()`
- `applyChatEvent()`
- `toggleToolExpanded()`

### 2. 组件接线

`App.vue` 继续通过 `computed` 生成展示用数据，但引用改为来自新 helper 文件。

保持：

- assistant rich text 仍通过 `v-html` 渲染已转义的 HTML
- tool item 展开态仍由 `toggleToolExpanded()` 驱动
- 不改变当前 transcript item 的输入来源与顺序

### 3. 测试策略

#### 状态 / helper 层

保留并更新现有单元测试：

- markdown rich text
- plain text fallback
- structured tool trace

#### 组件层

新增真实组件测试，覆盖：

- assistant markdown 在 DOM 中渲染出列表 / code / link
- tool item 初始折叠，点击后显示 detail
- 纯文本 assistant 消息不走 rich renderer 分支

测试只覆盖当前 issue write scope 相关行为，不扩展到 runtime bridge 行为。

## 风险与控制

### 风险 1：Vue 组件测试环境不足

控制：优先复用 repo 现有 vitest 配置；若缺少 jsdom，则只在最小范围内补测试运行所需配置。

### 风险 2：拆 helper 时引入行为回归

控制：先写失败测试，再迁移实现，最后跑定向 test + biome + build。

## 验证

- `bunx vitest run apps/mv3-shell/test/sidepanel-app.spec.ts apps/mv3-shell/test/sidepanel-state.spec.ts`
- `./node_modules/.bin/biome check apps/mv3-shell/src/sidepanel/App.vue apps/mv3-shell/src/sidepanel/state.ts apps/mv3-shell/src/sidepanel/styles.css apps/mv3-shell/test/sidepanel-app.spec.ts apps/mv3-shell/test/sidepanel-state.spec.ts`
- `cd apps/mv3-shell && bun run build`
