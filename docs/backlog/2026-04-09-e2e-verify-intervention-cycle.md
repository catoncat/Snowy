---
id: ISSUE-098
title: "End-to-end test: verify → intervention → resolution cycle"
status: open
priority: p1
source: "next-batch planning 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - intervention
  - verify
  - integration-test
  - e2e
module_id: intervention-handoff
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-intervention
parallel_group: site-runtime
depends_on: []
write_scope:
  - apps/mv3-shell/test/runtime-chat.spec.ts
  - packages/kernel/test/loop-orchestrator.spec.ts
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bunx vitest run apps/mv3-shell/test/runtime-chat.spec.ts packages/kernel/test/loop-orchestrator.spec.ts"
---

## Goal

Add integration tests that exercise the full verify → intervention request → side panel notification → resolution → loop continuation cycle. This validates Soft Gate 3 and ensures the intervention handoff chain works end-to-end.

## Scope

1. Test in loop-orchestrator: LLM tool call → site step with verifier → intervention requested → resolution applied → loop continues
2. Test in mv3-shell: intervention.list / intervention.resolve message routing with kernel integration
3. Test intervention timeout and cancellation paths
4. Test intervention persistence across session rehydration

## Acceptance

- At least one test exercises: tool call → verify failure → intervention request → resolution → next loop turn
- Intervention timeout produces a terminal loop status
- Intervention resolution allows the loop to continue
- Tests pass in both kernel and mv3-shell test suites
