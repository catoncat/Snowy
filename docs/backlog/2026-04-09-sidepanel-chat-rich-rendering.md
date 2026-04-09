---
id: ISSUE-109
title: "Sidepanel chat 富文本展示与 tool trace 可读性提升"
status: done
priority: p2
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: codex-019d70f6
tags:
  - sidepanel
  - chat
  - ui
kind: slice
epic: EPIC-ai-surface
parallel_group: mv3-shell
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
depends_on: []
write_scope:
  - apps/mv3-shell/src/sidepanel/App.vue
  - apps/mv3-shell/src/sidepanel/state.ts
  - apps/mv3-shell/src/sidepanel/styles.css
  - apps/mv3-shell/test/sidepanel-app.spec.ts
  - apps/mv3-shell/test/sidepanel-state.spec.ts
acceptance_ref: docs/ai-surface-index.md
check_cmd: "bunx vitest run apps/mv3-shell/test/sidepanel-app.spec.ts apps/mv3-shell/test/sidepanel-state.spec.ts"
completed_at: 2026-04-09T06:44:44.735Z
---

## Goal

在现有 sidepanel chat shell 的基础上，补齐 assistant 富文本展示与 tool trace 的可读性，让当前已经存在的 chat transcript / tool item 不再只停留在纯文本级别。

## Review Finding

当前 sidepanel 已经有独立 chat pane、streaming transcript 和 tool item expand/collapse 状态；因此剩余缺口不再是“从零做 chat pane”，而是把现有 `ChatMessageItem` / `ChatToolItem` 渲染成更适合 AI agent transcript 的展示层。现在 assistant 内容仍按纯文本输出，tool item 也缺少更结构化的参数 / 结果摘要呈现，导致已有 runtime chat path 对用户可读性不足。

## Acceptance

- [x] assistant 消息支持基础富文本展示（至少覆盖段落、列表、行内代码、代码块、链接）
- [x] 现有 tool item 在 summary / detail 基础上增加更可读的 trace 呈现，而不是只显示原始文本块
- [x] 保持现有 `ChatState` / transcript event model 基本稳定，不为了 UI 美化重做整条 runtime chat 数据链
- [x] 测试覆盖：sidepanel transcript 渲染、tool item 展开/展示行为、无 markdown 内容时的纯文本回退

## 工作总结

### 实现了什么
- assistant 消息支持段落、列表、行内代码、代码块与链接富文本渲染
- tool trace 增加 preview badge 与结构化 Input/Output/Meta 展示
- 保持现有 ChatState/transcript event model，仅补渲染 helper 与 sidepanel wiring

### 实际跑了什么检查
- bunx vitest run apps/mv3-shell/test/sidepanel-app.spec.ts apps/mv3-shell/test/sidepanel-state.spec.ts
- ./node_modules/.bin/biome check apps/mv3-shell/src/sidepanel/App.vue apps/mv3-shell/src/sidepanel/state.ts apps/mv3-shell/src/sidepanel/styles.css apps/mv3-shell/test/sidepanel-app.spec.ts apps/mv3-shell/test/sidepanel-state.spec.ts
- cd apps/mv3-shell && bun run build

### 残留风险
- 无

## 相关 commits

- `e2d9da523568` feat(sidepanel): 增强聊天富文本与trace展示
