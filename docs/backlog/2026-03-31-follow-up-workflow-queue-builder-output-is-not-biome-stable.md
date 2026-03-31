---
id: ISSUE-081
title: "Follow-up: workflow queue builder output is not biome-stable"
status: done
priority: p1
source: "ISSUE-070 closure 2026-03-31"
created: 2026-03-31
assignee: codex-019d41f6
tags:
  - review
  - workflow
  - dx
  - biome
  - queue
module_id: repo-workflow-dx
module_stage: deferred
tracking_kind: follow-up
kind: slice
epic: EPIC-dx-hardening
parallel_group: sdk-docs
depends_on: []
write_scope:
  - .agents/skills/auto-claim-issues-next/scripts/build-live-queue.ts
  - .agents/skills/auto-claim-issues-next/scripts/build-live-queue.test.ts
  - docs/workflow/live-queue.json
acceptance_ref: docs/source-of-truth-map.md
check_cmd: "bun run check"
---

## Goal

把 Follow-up: workflow queue builder output is not biome-stable 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- workflow:queue:build 目前把 live-queue.json 写成 JSON.stringify 默认风格；每次 queue rebuild 后 bun run check 都会再次被 docs/workflow/live-queue.json 卡住。
- 这不是当前 observability slice 的行为问题，而是 workflow 产物本身与 repo formatter contract 不一致。

## Acceptance

- workflow:queue:build 输出的 live-queue.json 默认就是 biome-stable。
- 回写 issue / queue rebuild 之后不需要再手动格式化 live-queue.json 才能通过 bun run check。
- 相关脚本测试锁住 queue builder 输出格式不再回流。

## 工作总结

- `workflow:queue:build` 现在会在写盘前通过仓库自带 Biome CLI 格式化 `docs/workflow/live-queue.json`，输出默认符合 repo formatter contract。
- 补了 queue builder 回归测试，锁住单元素 `depends_on` 数组写盘后保持单行格式，并校验生成文件对 Biome 已经是幂等的。
- 实际检查：`bun test ./.agents/skills/auto-claim-issues-next/scripts/build-live-queue.test.ts`、`bun run workflow:queue:build`、`bun run check`
- 残留风险：queue builder 现在显式依赖仓库内已安装的 Biome 二进制；未执行 `bun install` 的环境会在 queue build 时直接失败。

## 相关 commits

- `e8c66c7 fix(workflow): emit biome-stable live queue`
