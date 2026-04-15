---
id: ISSUE-148
title: "memfs capability family is typed but has no execution provider"
status: open
priority: p1
source: review
created: 2026-04-15
assignee: unassigned
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
---

## Goal

把 memfs capability family is typed but has no execution provider 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding


## Acceptance

- memfs.read and memfs.write capability descriptors have a family provider backed by BrowserVfs; provider dispatch routes memfs.* calls through the VFS layer; test coverage for read write and error paths
