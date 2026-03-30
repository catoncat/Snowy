---
id: ISSUE-061
title: "kernel: real loop orchestration integration with js-runner and site-runtime"
status: open
priority: p1
source: review
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - gap
  - kernel
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/loop-engine.ts
  - packages/js-runner/src/index.ts
  - packages/site-runtime/src/index.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---

## Goal

把 kernel: real loop orchestration integration with js-runner and site-runtime 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- LoopEngine skeleton is complete but lacks real step execution — no integration with JsRunnerHost or SiteSkillRuntime

## Acceptance

- LoopEngine step executor can dispatch to js-runner for code execution
- LoopEngine step executor can dispatch to site-runtime for site actions
- End-to-end test: kernel session -> loop turn -> runner invocation -> result recorded
