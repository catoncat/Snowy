---
id: ISSUE-191
title: "M1 里程碑：技能编辑真实回读、内置示例技能与运行语义诚实化"
status: open
priority: p1
source: "docs/product-roadmap-2026-07-08.md M1"
created: 2026-07-08
assignee: unassigned
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

- [ ] 编辑已安装技能时回读 `mem://skills/<id>/` 下 `SKILL.md`、`skill.json`、`handler.js` 的真实内容进编辑表单。
- [ ] `handler.js` 在编辑器中可见可改（最小 textarea 即可，不要求代码编辑器组件）。
- [ ] 预置 2-3 个内置示例技能，走正常 `skills.install` setupPlan 路径 seeding（首跑或显式「安装示例」入口），不开私有旁路。
- [ ] 「运行」语义诚实化：要么走真实 `skills.invoke` 执行 handler 并展示结果，要么 UI 明确标注当前为 prompt 模式；二者选一并写明理由。
- [ ] 编辑保存仍产生自动 snapshot / rollbackTarget（既有行为不回归，测试锁定）。
- [ ] 收口附一段真实 dogfood 记录：编辑一个示例技能 → 保存 → 运行 → 回滚。

## Not Now

- 不做 `skills.invoke` 进默认 LLM 工具面（那是 M3 的票，需要确认门控设计）。
- 不做「固化会话为技能」（M3）。
- 不做技能分享 / 导入导出格式（M3）。
- 不做 diff / preview / 交互式版本选择 UI。
