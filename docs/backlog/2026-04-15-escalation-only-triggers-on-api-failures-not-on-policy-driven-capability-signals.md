---
id: ISSUE-140
title: "Escalation only triggers on API failures not on policy-driven capability signals"
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
  - packages/kernel/src/loop-orchestrator.ts
  - packages/contracts/src/index.ts
  - packages/kernel/test
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---

## Goal

把 Escalation only triggers on API failures not on policy-driven capability signals 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding


## Acceptance

- Escalation can be triggered by policy-driven signals such as capability requirement mismatches or quality degradation not just HTTP/API errors; test coverage for policy-triggered escalation path

## 工作总结

Merged into ISSUE-135 (Provider routing runtime robustness).
