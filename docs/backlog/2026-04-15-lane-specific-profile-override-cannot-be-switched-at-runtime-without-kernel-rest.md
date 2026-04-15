---
id: ISSUE-139
title: "Lane-specific profile override cannot be switched at runtime without kernel restart"
status: done
priority: p1
source: review
created: 2026-04-15
assignee: unassigned
tags:
  - review
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-provider-routing
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/kernel/src/llm-profile-resolver.ts
  - packages/kernel/src/kernel-facade.ts
  - packages/kernel/test
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---

## Goal

把 Lane-specific profile override cannot be switched at runtime without kernel restart 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding


## Acceptance

- Kernel facade exposes a method to update lane-specific profile overrides during an active run without restart; test coverage for mid-run lane profile switch and fallback to default

## 工作总结

Merged into ISSUE-135 (Provider routing runtime robustness).
