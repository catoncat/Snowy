---
id: ISSUE-059
title: "kernel: VFS-backed SessionStorage adapter"
status: done
priority: p1
source: review
created: 2026-03-30
assignee: copilot-opus
tags:
  - review
  - follow-up
  - kernel
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---

## Goal

把 kernel: VFS-backed SessionStorage adapter 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- kernel-skeleton-design §4 describes VFS-backed SessionStorage but only InMemorySessionStorage exists

## Acceptance

- SessionStorage adapter backed by BrowserVFS write-through exists
- Existing kernel tests continue to pass with both adapters
