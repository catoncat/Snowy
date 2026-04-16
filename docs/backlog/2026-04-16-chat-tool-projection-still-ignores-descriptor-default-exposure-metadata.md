---
id: ISSUE-156
title: "Review: chat tool projection still ignores descriptor default exposure metadata"
status: open
priority: p1
source: review
created: 2026-04-16
assignee: unassigned
tags:
  - review
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-ai-surface
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/kernel/src/loop-orchestrator.ts
  - packages/kernel/test/loop-orchestrator.spec.ts
acceptance_ref: docs/ai-surface-index.md
check_cmd: "bun run check"
---

## Goal

把 chat tool projection still ignores descriptor default exposure metadata 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- Kernel chat tool projection still calls registry.projectTools() without audience/defaultExposed filtering
- so the new descriptor-owned projection metadata is not yet enforced for chat-facing tool surfaces.

## Acceptance

- Kernel chat tool projection uses descriptor-owned audience/defaultExposed metadata instead of project-all semantics
- Tests lock that chat-facing tool surfaces exclude descriptors with defaultExposed=false unless explicitly requested
