---
id: ISSUE-050
title: 根 README quickstart + 包级 README 模板
status: done
priority: p2
source: docs/reviews/2026-03-29-docs-dx-review.md § 1.2 / § 2.1
created: 2026-03-29
assignee: unassigned
tags: [dx, docs]
kind: slice
epic: EPIC-dx-hardening
parallel_group: sdk-docs
depends_on: [ISSUE-010]
write_scope:
  - README.md
  - packages/contracts/README.md
  - packages/core/README.md
  - packages/browser-vfs/README.md
  - packages/js-runner/README.md
  - packages/site-runtime/README.md
  - packages/skill-sdk/README.md
  - packages/kernel/README.md
  - apps/mv3-shell/README.md
  - docs/package-readme-template.md
acceptance_ref: docs/reviews/2026-03-29-docs-dx-review.md
check_cmd: "test -f packages/contracts/README.md && test -f packages/core/README.md"
---

## 问题

1. 根 README.md 只有一行描述，无 Getting Started / Prerequisites / Quick Start
2. 所有 7 个包/app 均无 README.md
3. 所有 package.json 均无 description 字段

此 issue 与 ISSUE-010（authoring-docs-and-package-template）有重叠，可合并或作为其子集。

## 接受标准

1. 根 README 包含：项目简介、Prerequisites（bun 版本）、Quick Start（3 步 clone→install→check）、Monorepo 结构简图、文档链接
2. 每个包有 README.md 包含：一句话说明、API 入口、使用示例（可简短）
3. 每个 package.json 有 description 字段
4. 包级 README 模板存放在 docs/ 或 .github/ 供后续包复用

## 工作总结

- 根 README 已补齐 Prerequisites / Quick Start / monorepo 结构 / 文档索引
- 已新增包级 README：contracts/core/browser-vfs/js-runner/site-runtime/skill-sdk/kernel/mv3-shell
- 已为相关 package.json 增加 `description` 字段
- 已新增模板：`docs/package-readme-template.md`

## 相关 commits

- pending
