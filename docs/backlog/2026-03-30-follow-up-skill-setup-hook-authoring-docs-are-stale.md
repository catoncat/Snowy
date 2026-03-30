---
id: ISSUE-079
title: "Follow-up: skill setup hook authoring docs are stale"
status: open
priority: p2
source: "ISSUE-077 follow-up 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - docs
  - skill-sdk
  - hooks
  - authoring
module_id: skill-runtime-sdk-studio
module_stage: deferred
tracking_kind: follow-up
kind: slice
epic: EPIC-skill-sdk
parallel_group: sdk-docs
depends_on:
  - ISSUE-077
write_scope:
  - packages/skill-sdk/README.md
  - docs/skill-authoring-guide.md
  - docs/skill-package-convention.md
acceptance_ref: packages/skill-sdk/src/index.ts
check_cmd: "bun run check"
---

## Goal

把 install-only skill setup hook 的作者入口文档补齐，避免后续继续回流到旧 plugin hook 心智。

## Review Finding

- `packages/skill-sdk` 现在已有 `setup` 声明面与 `runSkillSetupHooks()`，但 README、authoring guide、package convention 还没有解释这个 surface
- 文档如果继续缺位，后续 agent 很容易误以为 runtime hook / app glue 仍是推荐路径
- 当前 contract 还特意限制为 install-only、`mem://skills/<id>/...` 包内写入；这些边界需要显式写清

## Acceptance

- `packages/skill-sdk/README.md` 补 setup hook 最小示例与关键 export
- `docs/skill-authoring-guide.md` 说明 install phase、`ctx.writeFile()` / `ctx.note()` 语义和“不在 runtime invoke 时执行”
- `docs/skill-package-convention.md` 补 canonical package root 与 setup 生成文件的约束，不再暗示旧 plugin hook 语义
