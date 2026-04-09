---
id: ISSUE-099
title: "Follow-up: route mv3-shell provider/profile management through Kernel facade"
status: done
priority: p1
source: "next-batch planning 2026-04-09"
created: 2026-04-09
assignee: codex-019d703b
tags:
  - kernel
  - provider
  - profile
  - mv3-shell
  - integration
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-kernel
parallel_group: mv3-shell
depends_on:
  - ISSUE-095
  - ISSUE-097
write_scope:
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/test/runtime-chat.spec.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bunx vitest run apps/mv3-shell/test/runtime-chat.spec.ts"
completed_at: 2026-04-09T03:43:41.470Z
---

## Goal

Make `mv3-shell` treat `packages/kernel` as the primary provider/profile management entrypoint so runtime chat and related app flows no longer maintain a parallel provider/profile wiring path outside the kernel.

## Review Finding

- `ISSUE-097` already exposed `providerRegistry` / `profileConfig` management on the Kernel facade.
- `apps/mv3-shell/src/runtime-services.ts` still owns part of the provider/profile routing logic and does not fully treat the kernel as the single source of truth for active profile/provider access.
- This leaves the `provider-profile-routing` module in a partially integrated state: the kernel supports the API, but the main app runtime path can still drift from kernel-managed state.

## Scope

1. Update `runtime-services` to construct and consume provider/profile state through the Kernel facade where possible.
2. Remove or reduce duplicate app-side profile/provider reads on the main runtime/chat path.
3. Add or update mv3-shell tests that prove profile changes are observed via kernel-managed state.

## Acceptance

- `runtime-services` uses the Kernel facade as the primary source for active profile/provider access on the main runtime/chat path.
- The main runtime path no longer keeps a duplicate profile-resolution branch outside the kernel for the same flow.
- `apps/mv3-shell/test/runtime-chat.spec.ts` covers profile/provider access through kernel-managed state and verifies the app observes profile updates without reconstructing the runtime wiring.

## 工作总结

### 实现了什么
- runtime-services 改为通过 Kernel facade 暴露并消费 active profile/provider registry
- updateLlmConfig 原地同步 kernel-managed profile state，不再依赖重建 runtime wiring

### 实际跑了什么检查
- bunx vitest run apps/mv3-shell/test/runtime-chat.spec.ts
- ./node_modules/.bin/biome check apps/mv3-shell/src/runtime-services.ts apps/mv3-shell/test/runtime-chat.spec.ts

### 残留风险
- 无

## 相关 commits

- `5a3088fe104b` fix(mv3-shell): 走内核门面同步 provider/profile
