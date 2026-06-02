---
id: ISSUE-076
title: "Follow-up: repo-wide Biome baseline drift is blocking bun run check again"
status: done
priority: p1
source: "current workflow concurrency correction 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - dx
  - biome
  - lint
  - workflow
module_id: repo-workflow-dx
module_stage: deferred
tracking_kind: follow-up
kind: slice
epic: EPIC-dx-hardening
parallel_group: sdk-docs
depends_on: []
write_scope:
  - package.json
  - biome.json
  - tsconfig.json
  - vitest.config.ts
  - packages/browser-vfs/package.json
  - packages/contracts/package.json
  - packages/core/package.json
  - packages/js-runner/package.json
  - packages/site-runtime/package.json
  - packages/skill-sdk/package.json
  - apps/mv3-shell/manifest.json
  - .agents/skills/auto-claim-issues-next/scripts/claim-issue.test.ts
  - .agents/skills/auto-claim-issues-next/scripts/module-ledger.ts
  - .agents/skills/next-batch-planner/scripts/create-review-issue.ts
  - .agents/skills/next-batch-planner/scripts/create-review-issue.test.ts
  - .codex/hooks/workflow-ticket.test.ts
  - .vscode/tooling config
acceptance_ref: docs/reviews/2026-03-29-docs-dx-review.md
check_cmd: "bun run check"
---

## Goal

把 Follow-up: repo-wide Biome baseline drift is blocking bun run check again 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- ISSUE-049 已建立 lint/formatter 基线，但仓库当前再次存在 repo-wide Biome drift，导致大量 slice 的 bun run check 无法全绿
- 这些格式化和 import 排序问题分布在根配置、package manifests、workflow scripts 与 hook 文件，已经成为并行开发的持续门禁噪音
- 如果不把基线重新拉平，workflow 会继续把很多 issue 变成只能写局部 biome check 的例外流程

## Acceptance

- 当前仓库列出的 repo-wide Biome drift 文件被统一收口，bun run lint 不再因既有格式债失败
- 相关 workflow scripts、hook tests、package manifests 与根配置通过同一套格式规则，不再反复回流
- bun run check 恢复为可作为多数 slice 默认门禁的可信命令，而不是长期例外说明

## Sub Issues

- `ISSUE-078` `Follow-up: residual kernel-runtime Biome drift remains outside claimed scopes`

## 工作总结

- 已对当前 `write_scope` 的 17 个根配置、package manifest、workflow script 与 hook 文件执行 `bunx biome check --write --unsafe ...`，并通过同一批文件的 `bunx biome check ...` 复验。
- 已新增 `ISSUE-078`，把当前 active issues 之外仍未覆盖的 17 个 kernel/runtime 残余 drift 文件单独建票，避免继续把全局 lint 噪音挂在多数 slice 上。
- 已运行 `bun run check`；当前仍失败，但失败集合已收缩到 `write_scope` 外文件，并已有明确去向：`ISSUE-067` 覆盖 `docs/*` 与 `packages/js-runner/src/index.ts`/`test`，`ISSUE-077` 覆盖 `packages/skill-sdk/*`，`ISSUE-078` 覆盖剩余未认领的 kernel/runtime 漂移。
- 当前 slice 的完成结论是：本 issue 负责的基线文件已拉平，仓库级 `bun run check` 的剩余不可信部分已被拆分成显式 follow-up，而不是继续作为隐性 repo noise。

## 相关 commits

- `8d996d2` `chore(dx): rebaseline biome workflow files`
