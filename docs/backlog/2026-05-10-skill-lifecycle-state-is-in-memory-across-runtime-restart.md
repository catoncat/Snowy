---
id: ISSUE-169
title: "Review: skill lifecycle state is in-memory across runtime restart"
status: open
priority: p1
source: "next-batch planning 2026-05-10"
created: 2026-05-10
assignee: unassigned
tags:
  - review
  - skill-sdk
  - mv3-shell
  - lifecycle
  - persistence
module_id: skill-runtime-sdk-studio
module_stage: deferred
tracking_kind: gap
kind: slice
epic: EPIC-skill-runtime-sdk
parallel_group: sdk-docs
depends_on: []
write_scope:
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
---

## Goal

把 skill lifecycle state is in-memory across runtime restart 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- runtime-services creates an in-memory skill manager for skills.install/enable/disable/uninstall
- so extension/runtime restart loses skill lifecycle state even though audit.tail persists the old event.
- skills.summary and skills.list are treated as shared control-plane read surfaces
- but currently they only reflect the current process skill manager records.

## Acceptance

- skills.install/enable/disable/uninstall records survive createBackgroundRuntimeServices or bridge restart when chrome.storage is available
- runtime.bootstrap/resource.read skills.summary and skills.list rehydrate persisted skill lifecycle records after restart
- manifest/runtime tests cover install+enable before restart and readback after restart
