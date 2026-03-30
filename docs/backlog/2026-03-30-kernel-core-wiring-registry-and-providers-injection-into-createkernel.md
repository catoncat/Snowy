---
id: ISSUE-060
title: "kernel: core wiring — registry and providers injection into createKernel"
status: open
priority: p1
source: review
created: 2026-03-30
assignee: unassigned
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
  - packages/kernel/src/kernel-facade.ts
  - packages/core/src/index.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---

## Goal

把 kernel: core wiring — registry and providers injection into createKernel 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- createKernel() facade only accepts storage + llm adapters; no CapabilityRegistry or FamilyProviderRegistry injection

## Acceptance

- createKernel accepts CapabilityRegistry and can dispatch capability calls through the loop
- Integration test proves kernel loop can invoke a registered capability
