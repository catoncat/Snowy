---
id: ISSUE-188
title: "Agent Run UI PRD 与运行态交互模型"
status: done
priority: p0
source: "to-prd chat research 2026-05-31"
created: 2026-05-31
assignee: unassigned
tags:
  - ready-for-agent
  - sidepanel
  - chat
  - agent-run-ui
  - runtime-activity
kind: slice
epic: EPIC-ai-surface
parallel_group: mv3-shell
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: follow-up
depends_on: []
write_scope:
  - docs/prds/2026-05-31-agent-run-ui-prd.md
  - apps/mv3-shell/src/sidepanel/
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/test/sidepanel-state.spec.ts
  - apps/mv3-shell/test/sidepanel-app.spec.ts
  - apps/mv3-shell/test/runtime-chat.spec.ts
acceptance_ref: docs/prds/2026-05-31-agent-run-ui-prd.md
check_cmd: "bunx vitest run apps/mv3-shell/test/sidepanel-state.spec.ts apps/mv3-shell/test/sidepanel-app.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts"
---

## Goal

把 2026-05-31 的 Chat / thinking / tool-call 展示研究落成 Agent Run UI 的可执行产品需求：Chat transcript 只承载语义对话，运行态、工具调用、压缩、错误、人工介入和诊断进入独立的 Run Activity 视图模型与 UI。

## PRD

- `docs/prds/2026-05-31-agent-run-ui-prd.md`

## Context

vNext 当前 Side Panel 已经有最小 chat、assistant streaming、富文本渲染、tool call/result 展示和工具历史过滤，但 runtime phase 仍过粗，主要停留在 `idle/running/stopped` 与 `assistant.delta/done`、`tool.call/result`。原版 Browser Brain Loop 有更丰富的 phase 和 tool pending 展示，但展示层和 chat transcript 耦合过重。Pi v0.78.0 与 OpenAI Responses 等参考方向显示，最佳路径应是分离 transcript、current run status 和 activity timeline。

## Acceptance

- [x] 定义 Agent Run Activity 的 P0 产品模型，覆盖 live phase、activity timeline、tool lifecycle、error/action-required visibility、compaction 和 intervention。
- [x] Side Panel 展示分成 Chat transcript、current run status、activity timeline 三层，不把当前运行状态伪装成普通 assistant message。
- [x] tool call / tool result 使用稳定 ID 配对，成功结果默认折叠，running / failed / blocked / intervention 始终可见。
- [x] thinking 展示为进度摘要或可隐藏标签，不展示 raw chain-of-thought。
- [x] bootstrap/replay 与 live streaming 使用同一投影视图规则，重开 Side Panel 后展示层级不漂移。
- [x] 保留现有 assistant 富文本、inline tool result、系统/压缩摘要、复制/编辑/重试/分叉等已落地交互。
- [x] 测试覆盖 reducer/projection、Side Panel state、Side Panel rendering、runtime chat event emission 的关键状态序列。

## Not Now

- 不做完整视觉重设计。
- 不扩展 Skill Studio / marketplace / package authoring。
- 不新增浏览器自动化能力或 Execution Host transport。
- 不重做 provider routing。
- 不展示 raw chain-of-thought。

## 工作总结

- 新增 Side Panel `RunActivityProjection`，把 transcript item 与 Agent Run Activity 分离；tool call/result、compaction、intervention、error 进入 activity timeline，assistant/user/system transcript 保持语义对话。
- 新增 `RunStatusStrip` 与 `RunActivityTimeline`，Side Panel 现在按 Chat transcript、current run status、activity timeline 三层展示运行态；成功活动默认折叠，running / failed / intervention 保持可见。
- runtime chat event 增加 `phase` 与稳定 `toolCallId`，tool call/result 使用同一 ID 配对；bootstrap tool messages 与 live events 复用同一 activity 投影规则。
- 保留现有 assistant 富文本、inline tool result、系统/压缩摘要、复制/编辑/重试/分叉等交互，并补充 reducer、rendering、runtime event emission 测试。
- 验证：`bunx vitest run apps/mv3-shell/test/sidepanel-state.spec.ts apps/mv3-shell/test/sidepanel-app.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts` 通过；`./node_modules/.bin/biome check apps/mv3-shell/src/sidepanel/state.ts apps/mv3-shell/src/sidepanel/run-activity-pane.ts apps/mv3-shell/src/sidepanel/App.vue apps/mv3-shell/src/runtime-services.ts apps/mv3-shell/test/sidepanel-state.spec.ts apps/mv3-shell/test/sidepanel-app.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts` 通过；`bun run typecheck` 通过。

## 相关 commits

- `2da3a5d4a96eb619c97438b56697468a5fd6b847` docs(prd): 新增Agent Run UI产品需求
- `a4d44b766337836ecf2a22532c8f297777068489` feat(sidepanel): 拆分 Agent Run 活动视图
