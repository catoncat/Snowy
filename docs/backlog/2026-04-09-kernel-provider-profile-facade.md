---
id: ISSUE-097
title: "Integrate provider/profile management into Kernel facade"
status: done
priority: p1
source: "next-batch planning 2026-04-09"
created: 2026-04-09
assignee: codex-019d700a
completed_at: 2026-04-09T02:35:27Z
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

## 工作总结

### 实现了什么

- 在 `KernelOptions` 暴露 `providerRegistry` / `profileConfig` 注入，并在 Kernel facade 暴露 `getActiveProfile()`、`setProfileConfig()`、`getProviderRegistry()`。
- 让 facade 在不重建 kernel 的前提下维护当前 profile config，并通过 `resolveLlmRoute()` 返回当前解析后的 active profile。
- 补充 `kernel-facade` provider/profile 管理测试，覆盖空配置、provider registry 暴露与 profile 切换。

### 实际跑了什么检查

- `bunx vitest run packages/kernel/test/kernel-facade.spec.ts`
- `./node_modules/.bin/biome check packages/kernel/src/kernel-facade.ts packages/kernel/test/kernel-facade.spec.ts`

### 残留风险

- 无。原 `workflow:done` 对非 `cli:<agent>` session lease 的兼容问题已由后续 workflow 修复收口，不再影响当前 issue。

## 相关 commits

- `d964003` `feat(kernel): 补齐 provider profile facade`
