---
id: ISSUE-132
title: "Review: provider policy hardening still lacks runtime call-site ownership"
status: done
priority: p1
source: "next-batch-planner review 2026-04-15"
created: 2026-04-15
assignee: codex-019d90cc
tags:
  - review
  - provider
  - routing
  - policy
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-kernel
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/kernel/src/llm-profile-resolver.ts
  - packages/kernel/src/llm-kernel-adapter.ts
  - packages/kernel/src/loop-orchestrator.ts
  - packages/kernel/test
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
completed_at: 2026-04-15T11:24:40.618Z
---

## Goal

复核 provider/profile 模块在 health negotiation 与 lane-aware routing 落地后，剩余 provider policy hardening 应由哪些 runtime-owned 调用点继续承接。

## Review Finding

- route resolver 已支持 provider health、requiredCapabilities、orderedProfiles 与 lane-aware profile 选择，但生产调用点大多仍以隐式默认值发起解析。
- requiredCapabilities 当前只在 resolver 测试中被显式覆盖，尚未形成由真实 kernel LLM lane 声明并消费的运行时 policy seam。
- 如果不重新锁定 call-site ownership，后续 provider policy 很容易再次回流到 ad-hoc 调用方启发式，而不是停留在 package-owned contract。

## Acceptance

- 明确 primary / compaction / title 等 kernel LLM lane 还需要声明哪些 runtime-owned 路由约束，以及哪些 provider policy 继续 deferred。
- 若仍有可执行缺口，拆出更窄的 follow-up slice，锚定 kernel/provider 代码路径而不是 app-local glue。
- 文档与测试清晰区分已落地的 lane-aware routing 和仍待收口的 provider policy hardening 边界。

## 工作总结

### 实现了什么
- 为 primary/compaction/title 声明 runtime-owned provider capability requirements
- 让 runLoop 与 KernelLlmAdapter 显式消费 lane 路由约束并保留兼容回退
- 补充 provider routing 文档与定向回归测试

### 实际跑了什么检查
- bun run test -- packages/kernel/test/llm-profile-resolver.spec.ts packages/kernel/test/llm-kernel-adapter.spec.ts packages/kernel/test/loop-orchestrator.spec.ts packages/kernel/test/kernel-facade.spec.ts
- ./node_modules/.bin/biome check packages/kernel/src/llm-profile-resolver.ts packages/kernel/src/llm-kernel-adapter.ts packages/kernel/src/loop-orchestrator.ts packages/kernel/test/llm-profile-resolver.spec.ts packages/kernel/test/llm-kernel-adapter.spec.ts packages/kernel/test/loop-orchestrator.spec.ts docs/kernel-skeleton-design.md docs/migration-parity-dashboard.md docs/legacy-to-vnext-migration-matrix.md

### 残留风险
- 无

## 相关 commits

- `3ad7ccaa4110` fix(kernel): 锁定 provider 路由约束
