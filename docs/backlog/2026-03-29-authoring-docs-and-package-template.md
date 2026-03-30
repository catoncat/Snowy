---
id: ISSUE-010
title: "Authoring docs and package template"
status: done
priority: p1
source: "v0 follow-up"
created: 2026-03-29
assignee: agent
tags:
  - docs
  - skill-sdk
module_id: skill-runtime-sdk-studio
module_stage: deferred
tracking_kind: doc-debt
kind: slice
epic: EPIC-skill-sdk
parallel_group: sdk-docs
depends_on:
  - ISSUE-009
write_scope:
  - docs/
  - README.md
acceptance_ref: docs/next-development-slices-2026-03-29.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T09:12:26.452Z
---

## Goal

补 authoring docs、skill package template、示例目录约定。

## Acceptance

- skill package 目录有规范文档
- 新作者能按文档造最小 package

## 工作总结

### 2026-03-29 补记

- 已新增 skill package convention 与 authoring guide，README 也补了入口链接
- 文档现在明确了最小 package 结构、命名约定和作者起步路径
- 状态回写发生在代码文档提交之后

## 相关 commits

- `47d35f0` `docs: add skill package convention and authoring guide (ISSUE-010)`
- `ab5efe2` `chore: mark ISSUE-010 as done`
