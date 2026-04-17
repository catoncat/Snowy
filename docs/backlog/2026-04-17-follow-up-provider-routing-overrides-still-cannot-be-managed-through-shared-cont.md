---
id: ISSUE-163
title: "Follow-up: provider routing overrides still cannot be managed through shared control plane"
status: done
priority: p1
source: "next-batch-planner review 2026-04-17"
created: 2026-04-17
assignee: codex
tags:
  - review
  - provider
  - routing
  - control-plane
  - follow-up
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-provider-routing
parallel_group: contracts-core
depends_on:
  - ISSUE-159
write_scope:
  - packages/contracts/src/index.ts
  - packages/kernel/src/llm-profile-resolver.ts
  - packages/kernel/src/kernel-facade.ts
  - docs/legacy-to-vnext-migration-matrix.md
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
completed_at: 2026-04-17T13:42:14.616Z
---

## Goal

在 provider capability taxonomy 与 non-kernel route resolution 已收口后，把 provider override / policy state 继续接到 shared control-plane，而不是继续停留在 kernel-local runtime seam。

## Review Finding

- ISSUE-150 已解决 taxonomy 与 reusable route resolution，但 migration matrix 仍明确记录更广 provider policy hardening 尚未完成；当前缺的不是 resolver 本身，而是 shared control-plane 如何读取/更新 routing overrides。
- 如果不继续落票，provider-profile-routing 会被误判成实现基本完成，只剩抽象文案；但真实剩余问题是 operator-facing routing state 仍没有统一入口。

## Acceptance

- provider routing 的 override / policy state 可以通过 shared control-plane 读取或更新，且不要求调用方直连 kernel 私有实现。
- 若当前阶段只适合先补 northbound contract，则把 provider-profile-routing 与 ai-surface-control-plane 的职责边界写清，并保留后续更窄 implementation slice。

## 工作总结

### 实现了什么
- 为 config.summary/config.update 定义 model.routing 的 provider override/policy contract
- 让 kernel.resolveProviderRoute 直接消费 shared control-plane routing overrides
- 新开 ISSUE-164 继续承接 runtime-owned wiring

### 实际跑了什么检查
- bun run test -- packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts packages/kernel/test/llm-profile-resolver.spec.ts packages/kernel/test/kernel-facade.spec.ts
- ./node_modules/.bin/biome check packages/contracts/src/index.ts packages/core/src/index.ts packages/kernel/src/llm-profile-resolver.ts packages/kernel/src/kernel-facade.ts packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts packages/kernel/test/llm-profile-resolver.spec.ts packages/kernel/test/kernel-facade.spec.ts
- git diff --check
- bun run check（失败：packages/core/test/core.spec.ts 695/702/706/708 的既有联合类型错误，与本次 provider routing 合同改动无关）

### 残留风险
- docs/ai-surface-index.md 与 docs/legacy-to-vnext-migration-matrix.md 当前不在 biome 处理范围内，本次依赖定向测试与 contract/schema 锁定
- runtime-owned provider profile config 对 model.routing 的自动 rehydrate 仍未落地，已拆到 ISSUE-164

## 相关 commits

- `8186404fc5ee` fix(kernel): 接通 provider 路由 override 合同
