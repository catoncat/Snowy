---
id: ISSUE-148
title: "memfs capability family is typed but has no execution provider"
status: done
priority: p1
source: review
created: 2026-04-15
assignee: sable
tags:
  - review
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-browser-automation
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/core/src/index.ts
  - packages/browser-vfs/src/index.ts
  - packages/core/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
completed_at: 2026-04-15T16:46:09.096Z
---

## Goal

把 memfs capability family is typed but has no execution provider 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding


## Acceptance

- memfs.read and memfs.write capability descriptors have a family provider backed by BrowserVfs; provider dispatch routes memfs.* calls through the VFS layer; test coverage for read write and error paths

## 工作总结

### 实现了什么
- 新增 memfs capability family provider，并把 memfs.* 调度到 BrowserVfs 传输层
- 补充独立 memfs provider 验收测试，覆盖 read/write 与输入/VFS 错误路径

### 实际跑了什么检查
- ./node_modules/.bin/vitest run packages/core/test/core.spec.ts packages/core/test/memfs-provider.spec.ts
- ./node_modules/.bin/vitest run .agents/skills/auto-claim-issues-next/scripts/build-live-queue.test.ts .agents/skills/auto-claim-issues-next/scripts/claim-issue.test.ts .agents/skills/auto-claim-issues-next/scripts/ticket-machine.test.ts
- ./node_modules/.bin/biome check packages/core/src/index.ts packages/core/test/core.spec.ts packages/core/test/memfs-provider.spec.ts .agents/skills/auto-claim-issues-next/SKILL.md .agents/skills/auto-claim-issues-next/scripts/build-live-queue.ts .agents/skills/auto-claim-issues-next/scripts/build-live-queue.test.ts .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts .agents/skills/auto-claim-issues-next/scripts/claim-issue.test.ts .agents/skills/auto-claim-issues-next/scripts/ticket-machine.ts .agents/skills/auto-claim-issues-next/scripts/ticket-machine.test.ts AGENTS.md docs/backlog/README.md

### 残留风险
- bun run typecheck 仍被 apps/mv3-shell/test/sidepanel-app.spec.ts 缺少 @vue/server-renderer 阻塞，属于当前 slice 外的既有仓库问题

## 相关 commits

- `704e59514151` feat(core): 补齐 memfs capability provider
- `d5c940e16caf` test(core): 拆分 memfs provider 验收用例
