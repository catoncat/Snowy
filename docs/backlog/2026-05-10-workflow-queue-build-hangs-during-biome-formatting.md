---
id: ISSUE-168
title: "Review: workflow queue build hangs during Biome formatting"
status: done
priority: p0
source: "live workflow 2026-05-10"
created: 2026-05-10
assignee: codex-next
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
acceptance_ref: docs/backlog/README.md
check_cmd: "bun run check"
completed_at: 2026-05-10T08:45:44.613Z
---

## Goal

把 workflow queue build hangs during Biome formatting 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- Live run of bun run workflow:queue:build hung while formatting docs/workflow/live-queue.json through node_modules/.bin/biome; dry-run stayed fast
- so the mutating workflow path is not reliable.
- The already-closed ISSUE-081 claimed queue builder output was biome-stable
- but current runtime truth shows the formatter invocation can hang before writing the empty queue.

## Acceptance

- bun run workflow:queue:build completes and writes docs/workflow/live-queue.json when the queue has zero entries
- queue builder formatting avoids the hanging node_modules/.bin/biome wrapper or has a deterministic fallback
- focused regression tests cover the formatter path used by buildLiveQueue

## 工作总结

### 实现了什么
- ISSUE-168: queue builder now resolves the platform-native Biome executable before falling back to the package wrapper, and the formatter call is time-bounded to prevent rebuild hangs.
- Added regression coverage for native formatter resolution and non-dry-run empty queue writes.

### 实际跑了什么检查
- bun test ./.agents/skills/auto-claim-issues-next/scripts/build-live-queue.test.ts
- bun run workflow:queue:build
- node_modules/@biomejs/cli-darwin-arm64/biome check .agents/skills/auto-claim-issues-next/scripts/build-live-queue.ts .agents/skills/auto-claim-issues-next/scripts/build-live-queue.test.ts docs/workflow/live-queue.json docs/backlog/2026-05-10-workflow-queue-build-hangs-during-biome-formatting.md
- bun run typecheck
- bun run check

### 残留风险
- 无

## 相关 commits

- `c515bb5c8619` fix(workflow): 避开 queue build 卡死
