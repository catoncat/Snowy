---
id: ISSUE-064
title: "doc-debt: ai-surface-index.md freshness gate refresh"
status: done
priority: p1
source: review
created: 2026-03-30
assignee: copilot-opus
tags:
  - review
  - doc-debt
  - ai-surface
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-docs
parallel_group: contracts-core
depends_on: []
write_scope:
  - docs/ai-surface-index.md
acceptance_ref: docs/document-system-contract.md
check_cmd: "bun run check"
---

## Goal

把 doc-debt: ai-surface-index.md freshness gate refresh 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- ai-surface-index.md §2 was missing 6 implemented actions and §3 listed 8 already-implemented actions as missing; now refreshed but needs ongoing freshness gate

## Acceptance

- ai-surface-index.md §2 matches BUILTIN_CATALOG exactly
- ai-surface-index.md §3 lists only genuinely missing actions
