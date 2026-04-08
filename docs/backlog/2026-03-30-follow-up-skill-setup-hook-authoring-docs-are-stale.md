---
id: ISSUE-080
title: "Follow-up: skill setup hook authoring docs are stale"
status: done
priority: p1
source: "ISSUE-077 closure 2026-03-30"
created: 2026-03-30
assignee: codex-followup
tags:
  - review
  - docs
  - skill-sdk
  - hooks
  - authoring
module_id: skill-runtime-sdk-studio
module_stage: deferred
tracking_kind: doc-debt
kind: slice
epic: EPIC-skill-runtime-sdk
parallel_group: sdk-docs
depends_on: []
write_scope:
  - docs/skill-authoring-guide.md
  - docs/skill-package-convention.md
  - packages/skill-sdk/README.md
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
completed_at: 2026-04-08T15:40:40.779Z
---

## Goal

把 Follow-up: skill setup hook authoring docs are stale 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- ISSUE-077 已补 install-only setup contract，但 authoring docs 仍未解释 setup 何时运行、允许哪些副作用、以及为何当前只开放 install phase。
- 如果不把作者文档同步到位，后续 executable skill author 很容易重新发明 app-local glue 或误用 runtime hook 语义。

## Acceptance

- skill setup hook 的 install-only contract 被写入作者文档与 package README。
- 文档明确 setup hook 的允许副作用边界、推荐文件落点与当前不支持的 phase。
- skill authoring 路径不再需要从测试或源码猜 setup contract。

## 工作总结

### 实现了什么
- 在 skill authoring guide 中补 install-only setup hook 声明、运行方式、允许副作用边界与推荐文件落点
- 在 skill package convention 与 skill-sdk README 中补 setup hook contract、package-root 写入限制与不支持 phase 说明

### 实际跑了什么检查
- git diff --check -- docs/skill-authoring-guide.md docs/skill-package-convention.md packages/skill-sdk/README.md

### 残留风险
- 当前 setup hook 仍只有 install phase；runtime 接线与更多 phase 仍是后续 gap

## 相关 commits

- `2cda7481a2db` docs(skill-sdk): document install-only setup hooks (ISSUE-080)
