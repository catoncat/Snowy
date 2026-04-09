---
id: ISSUE-121
title: "Follow-up: add execution-lane-aware profile routing to the kernel LLM path"
status: open
priority: p1
source: "ISSUE-114 review 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - review
  - follow-up
  - provider
  - profile
  - routing
  - lane
  - escalation
  - compaction
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-kernel
parallel_group: contracts-core
depends_on:
  - ISSUE-114
write_scope:
  - packages/contracts/src/index.ts
  - packages/kernel/src/llm-profile-resolver.ts
  - packages/kernel/src/llm-kernel-adapter.ts
  - packages/kernel/src/loop-orchestrator.ts
  - packages/kernel/src/compaction-manager.ts
  - packages/kernel/src/kernel-facade.ts
  - packages/kernel/test
  - docs/kernel-skeleton-design.md
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
---

## Goal

Define the minimal executable contract for lane-aware profile selection and ordered profile fallback so kernel-owned LLM paths stop relying on implicit worker/primary defaults.

## Review Finding

- Current contracts already model execution lanes (`LLM_PROVIDER_EXECUTION_LANES`), provider send lane, and an `auxProfile` hook, but `resolveLlmRoute()` still derives `orderedProfiles` from `targetProfile` plus `fallbackProfile` only and cannot choose a lane root.
- `createKernelLlmFromProvider()` always resolves a worker route from one profile snapshot, while `CompactionManager` only sees `KernelLlmAdapter.complete()` with no explicit lane signal.
- Loop retry escalation already works inside one `orderedProfiles` list, but the config and adapter path still do not define how `primary` / `compaction` / `title` lanes pick their initial profile chains.

## Acceptance

- `resolveLlmRoute()` accepts an explicit execution lane (or equivalent canonical selector) and derives the initial profile / ordered escalation chain from config rather than app heuristics.
- Kernel-owned LLM entrypoints that represent different lanes (loop primary, compaction, title/metadata if present) thread that lane information through route resolution or explicitly lock what remains deferred.
- Tests and kernel docs lock the vNext boundary for lane-aware routing versus still-deferred provider policy work.
