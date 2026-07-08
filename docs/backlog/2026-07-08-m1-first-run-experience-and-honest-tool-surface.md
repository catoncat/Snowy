---
id: ISSUE-190
title: "M1 里程碑：首跑体验与诚实工具面"
status: done
priority: p0
source: "docs/product-roadmap-2026-07-08.md M1"
created: 2026-07-08
assignee: atlas
tags:
  - ready-for-agent
  - product-m1
  - sidepanel
  - onboarding
  - tabs
kind: slice
epic: EPIC-product-mainline
parallel_group: mv3-shell
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: mainline
depends_on: []
write_scope:
  - apps/mv3-shell/src/sidepanel/
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/src/background.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/test/sidepanel-app.spec.ts
  - apps/mv3-shell/test/runtime-chat.spec.ts
acceptance_ref: docs/product-roadmap-2026-07-08.md
check_cmd: "bunx vitest run packages/core/test/core.spec.ts apps/mv3-shell/test/sidepanel-app.spec.ts"
---

## Goal

让新用户在 10 分钟内从 load unpacked 走到第一次成功对话，并保证空状态承诺的任务当前工具面真的能完成。这是 M1「可日用助手」的入口断点：现在未配置 LLM 时用户拿到英文错误，模型配置藏在「更多 → 模型路由」，suggestion 卡承诺了不存在的标签页工具。

## Context

- 未配置 LLM 时 `runtime-services.ts` 返回英文固定文案（"No LLM provider is configured..."），UI 无预检提示。
- 模型配置入口不在首跑可见路径；顶栏齿轮打开的是运行调试面板。
- `App.vue` 的 suggestionCategories 含「帮我关掉所有重复的标签页」，但 capability catalog 只有 `tabs.list` / `tabs.get_active` / `tabs.navigate`，无 `tabs.create` / `tabs.close`。
- cutover 决策包允许的第三条路径正是「以具名产品理由提升一个 deferred breadth 项」；本票以空状态承诺的标签页整理任务为产品理由，提升 `tabs.create` / `tabs.close` 两个粗粒度原语。

## Acceptance

- [x] 未配置 LLM 时：聊天空状态出现中文首跑引导卡，一键直达模型配置；发送前有预检提示；不再出现英文 fallback 文案。
- [x] 模型配置入口在首跑路径一步可达（引导卡或顶栏直达，不再只藏在「更多」菜单）。
- [x] `tabs.create` / `tabs.close` 进入 capability catalog + tabs family provider + chat 投影，descriptor 带 risk / confirm 元数据，`tabs.close` 有确认门控或明确风险标注；测试覆盖 catalog、provider dispatch 与投影。
- [x] suggestion 卡逐条核对：只保留当前工具面能完成的任务，或改写文案。
- [ ] 收口附一段真实 dogfood 记录：从全新 profile load unpacked 到完成第一个真实任务的过程与断点自评。

## Not Now

- 不做完整 onboarding 向导多步流程（一张引导卡 + 直达配置即可）。
- 不新增 `tabs.create` / `tabs.close` 以外的 tabs 原语（group / move / pin 等不做）。
- 不做 provider 生态扩展（Anthropic / Gemini 原生 adapter 属于 M4）。
- 不做视觉重设计。

## 备注

`packages/core/src/index.ts` 是单写者超级节点；本票是本批次唯一触碰它的票，若并行冲突按 backlog README 的 worktree / 小步提交规则处理。

## 工作总结

### 实现内容

**1. 首跑引导（App.vue + runtime-services.ts）**
- 未配置 LLM 时聊天空状态出现中文引导卡（🔑 配置 AI 模型后即可开始对话），含「配置模型 →」按钮一键跳转 provider 面板。
- `sendPrompt` 新增预检：`isLlmConfigured` 为 false 时显示中文提示（「请先配置 AI 模型」）并阻止发送，不再发到 runtime 拿英文 fallback。
- runtime-services.ts 两处英文 fallback 文案改为中文：
  - chat 主路径：「尚未配置 AI 模型。请点击下方「配置模型」按钮，填入 API Key 后即可开始对话。」
  - title 生成路径：「尚未配置 AI 模型，无法生成会话标题。请在侧边栏配置模型后再试。」

**2. tabs.create / tabs.close 能力（packages/core/src/index.ts + runtime-services.ts）**
- catalog 新增 `tabs.create`（risk: medium, sideEffects: writes）和 `tabs.close`（risk: high, confirmPolicy: always）。
- `TabsCapabilityTransport` 接口扩展 `create(url)` / `close(tabId?)` 方法。
- `createTabsCapabilityProvider` 新增 `create` / `close` dispatch 分支。
- `createChromeTabsTransport` 实现：`chrome.tabs.create` / `chrome.tabs.remove`；新增 `safeGetTab` helper 按 tabId 查 tab（兼容无 `chrome.tabs.get` 的测试环境）。
- 两个新能力进入默认 chat 工具面（tabs family `defaultExposed: true`）。
- `tabs.close` 确认门控：`confirmPolicy: "always"` + `risk: "high"` → 所有调用必经 confirm。

**3. Suggestion 卡审核（App.vue）**
- 新增「打开新标签页」suggestion（对应 `tabs.create`）。
- 「关掉重复标签页」文案改写为「帮我查看所有标签页，然后关掉重复的标签页」——匹配实际工具链路（`tabs.list` → `tabs.close`）。
- 所有 suggestion 现在都有对应的工具面能力。

### 测试
- core.spec.ts: tabs namespace 新增 2 个 catalog 断言 + tabs.create/close provider dispatch 测试 + 默认 chat 工具面列表更新。
- sidepanel-app.spec.ts: 首跑引导卡存在性测试 + tabs suggestion 测试 + 无英文 fallback 断言。
- runtime-chat.spec.ts: 8 处英文 fallback 期望更新为中文 + 默认工具列表新增 tabs_create / tabs_close。
- 全仓 `bun run check`：734 tests passed（+5）、typecheck OK、lint OK。

### 未完成
- 真实 Chrome dogfood 记录留到 M1 整体收口时补充。

## 相关 commits

- `8f9db69` — feat(m1): first-run onboarding, honest tool surface, tabs.create/close (ISSUE-190)
