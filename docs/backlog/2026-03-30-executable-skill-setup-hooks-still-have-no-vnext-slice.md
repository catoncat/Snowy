---
id: ISSUE-077
title: "Review: executable skill setup hooks still have no vNext slice"
status: open
priority: p2
source: "current workflow concurrency correction 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - skill-sdk
  - hooks
  - authoring
module_id: skill-runtime-sdk-studio
module_stage: deferred
tracking_kind: gap
kind: slice
epic: EPIC-skill-runtime-sdk
parallel_group: sdk-docs
depends_on: []
write_scope:
  - packages/skill-sdk/src/index.ts
  - packages/skill-sdk/test/skill-sdk.spec.ts
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
---

## Goal

把 executable skill setup hooks still have no vNext slice 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- migration matrix 仍把 hooks system / extension points 标成 not-started，但 backlog 里还没有对应的 vNext slice
- skill-sdk 目前只有 defineSkill 与 typed facade，缺少 setup/install-time extension point，后续 executable Skill packaging 很容易再次回流到 ad-hoc app glue
- 这块 write_scope 与当前 correction head 不冲突，适合作为等待期间的独立并行 lane

## Acceptance

- 明确 executable skill setup hook 的最小 contract：何时运行、拿到什么上下文、允许做哪些副作用
- packages/skill-sdk 至少提供一个可测试的 hook authoring surface 或 placeholder contract，而不是继续停留在口头方向
- 测试锁住 hook 声明与运行时边界，避免未来再退回旧 plugin hook 语义
