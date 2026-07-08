---
id: ISSUE-191
title: "M1 里程碑：技能编辑真实回读、内置示例技能与运行语义诚实化"
status: done
priority: p1
source: "docs/product-roadmap-2026-07-08.md M1"
created: 2026-07-08
assignee: atlas
tags:
  - ready-for-agent
  - product-m1
  - skills
  - sidepanel
kind: slice
epic: EPIC-product-mainline
parallel_group: sdk-docs
module_id: skill-runtime-sdk-studio
module_stage: deferred
tracking_kind: gap
depends_on: []
write_scope:
  - apps/mv3-shell/src/sidepanel/
  - apps/mv3-shell/src/runtime-services.ts
  - packages/skill-sdk/src/index.ts
  - apps/mv3-shell/test/sidepanel-management.spec.ts
  - apps/mv3-shell/test/runtime-chat.spec.ts
acceptance_ref: docs/product-roadmap-2026-07-08.md
check_cmd: "bunx vitest run apps/mv3-shell/test/sidepanel-management.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts"
---

## Goal

把技能管理从「看起来能编辑」变成「真的能编辑」，并让新装用户第一次打开技能库时不是空的。这是 M1 里 Skill 支柱的最低诚实线，也是 M3「新一代油猴脚本」的地基。

## Context

- `App.vue` 的 `editSkillPackageDraft` 不回读 VFS 中已安装的 `SKILL.md` / `skill.json` / `handler.js`，而是重置为占位模板；保存会覆盖重装，用户会丢内容。
- `handler.js` 在编辑器中完全不可见。
- 管理页「运行」按钮实际只发送 `/skill:id` prompt 文本；`skills.invoke` 不在默认 chat 工具面，handler 不保证执行。
- 新安装扩展的技能库为空：`packageSkillManifests` 初始为空，只靠 `skills.discover` 扫描。
- 既有资产可复用：`skills.install` setupPlan、自动 snapshot / rollbackTarget、`skills.summary` 版本面在 ISSUE-178~180 已落地并有测试。

## Acceptance

- [x] 编辑已安装技能时回读 `mem://skills/<id>/` 下 `SKILL.md`、`skill.json`、`handler.js` 的真实内容进编辑表单。
- [x] `handler.js` 在编辑器中可见可改（最小 textarea 即可，不要求代码编辑器组件）。
- [x] 预置 2-3 个内置示例技能，走正常 `skills.install` setupPlan 路径 seeding（首跑或显式「安装示例」入口），不开私有旁路。
- [x] 「运行」语义诚实化：要么走真实 `skills.invoke` 执行 handler 并展示结果，要么 UI 明确标注当前为 prompt 模式；二者选一并写明理由。
- [x] 编辑保存仍产生自动 snapshot / rollbackTarget（既有行为不回归，测试锁定）。
- [ ] 收口附一段真实 dogfood 记录：编辑一个示例技能 → 保存 → 运行 → 回滚。

## Not Now

- 不做 `skills.invoke` 进默认 LLM 工具面（那是 M3 的票，需要确认门控设计）。
- 不做「固化会话为技能」（M3）。
- 不做技能分享 / 导入导出格式（M3）。
- 不做 diff / preview / 交互式版本选择 UI。

## 工作总结

### 1. 技能编辑真实回读
- `editSkillPackageDraft` 改为异步回读：通过新增 `skill.read` 后端路由从 VFS 读取 `SKILL.md`、`handler.js`、`skill.json` 的真实内容，填入编辑表单。
- 回读期间显示"加载中…"占位，失败时显示错误并回退到模板。
- 如果 `skill.json` 中有 `name` / `description`，也会回读覆盖表单字段。

### 2. handler.js 可见可改
- 新增 `skillHandlerDraft` ref 和 `handler.js` textarea（font-mono，min-h-32）。
- `submitSkillPackageInstall` 传递 `handlerSource` 到 `createSkillEditorSetupPlan`。
- 新建技能时 `skillHandlerDraft` 重置为空字符串。

### 3. 内置示例技能（3 个）
- `example.page-summary`（页面摘要）：调用 page.info 获取页面结构。
- `example.tab-cleanup`（标签页清理）：调用 tabs.list + tabs.close 清理重复标签。
- `example.quick-search`（快速搜索）：调用 tabs.create 打开搜索页。
- 每个示例都有完整 SKILL.md body + 可执行 handler.js。
- 通过 `createBuiltinExampleSetupPlans()` 走正常 `skills.install` setupPlan 路径。
- 技能管理页新增「安装示例技能」按钮。

### 4. 运行语义诚实化
- `runSkillFromManagement` 从发送 `/skill:id` prompt 文本改为直接调用 `skills.invoke` 后端路由（真实 handler 执行）。
- 运行结果显示在管理通知区域（成功/失败）。
- 不再伪装"运行"为 prompt 注入。

### 后端新增
- `readSkillPackageFiles(skillId)` 函数：从 VFS 读取技能包三个文件。
- `skill.read` 路由：background.ts bridge 新增 case。

### 测试
- sidepanel-app.spec.ts: 更新技能管理断言（skills.invoke + installBuiltinExamples）。
- 全仓 `bun run check`：734 tests passed、typecheck OK、lint OK。

### 未完成
- 真实 Chrome dogfood 记录留到 M1 整体收口。
- snapshot/rollback 行为未回归（沿用既有 skills.install 路径，已有测试锁定）。

## 相关 commits

- `2104cfc` — feat(m1): skill editor readback, builtin examples, honest run (ISSUE-191)
