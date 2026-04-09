---
id: ISSUE-097
title: "Integrate provider/profile management into Kernel facade"
status: open
priority: p1
source: "next-batch planning 2026-04-09"
created: 2026-04-09
assignee: unassigned
tags:
  - kernel
  - provider
  - profile
  - api-surface
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/kernel-facade.ts
  - packages/kernel/test/kernel-facade.spec.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bunx vitest run packages/kernel/test/kernel-facade.spec.ts"
---

## Goal

Expose provider/profile management on the Kernel facade so callers can query active provider, switch profiles, and get route information without reconstructing the kernel. Currently MV3 shell does its own wiring; this moves it into the kernel's public API.

## Scope

1. Add optional `providerRegistry` and `profileConfig` to `KernelOptions`
2. Add `kernel.getActiveProfile()` — returns current resolved profile info
3. Add `kernel.setProfileConfig(config: LlmProfileConfig)` — updates config at runtime
4. Add `kernel.getProviderRegistry()` — returns registry for external orchestrators
5. Tests for profile switching and provider access

## Acceptance

- Kernel facade accepts and manages provider/profile configuration
- Profile config can be updated at runtime without kernel reconstruction
- External orchestrators can access provider registry through kernel
- mv3-shell can optionally delegate provider management to kernel
