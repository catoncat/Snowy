---
id: ISSUE-114
title: "Review: provider/profile escalation and per-lane routing remain underdefined"
status: open
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - review
  - provider
  - profile
  - routing
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/kernel/src/llm-profile-resolver.ts
  - packages/kernel/src/llm-kernel-adapter.ts
  - packages/kernel/test
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---
## Goal

Review the remaining routing contract around provider/profile escalation and lane-specific model selection so future LLM paths do not fall back to app-private heuristics.

## Review Finding

- Current route resolution only orders `targetProfile` plus `fallbackProfile`, and `createKernelLlmFromProvider()` always resolves a worker lane from one profile snapshot.
- ISSUE-111 landed provider health and capability negotiation, but per-lane profile selection and multi-step escalation / fallback policy still remain partially modeled or explicitly deferred.
- Without a locked routing contract, provider choice can drift back into app-private heuristics when new lanes or failure modes are added.

## Acceptance

- Decide the minimal vNext contract for per-lane profile selection and ordered fallback / escalation.
- Either create executable follow-up slices for routing semantics or document explicit deferred boundaries in planning truth.
- Keep tests and docs pointing at one source of truth for route negotiation responsibilities.
