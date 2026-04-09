---
id: ISSUE-111
title: "Provider health 状态与 route negotiation 收敛"
status: done
priority: p1
source: "next-batch-planner coverage review 2026-04-09"
created: 2026-04-09
assignee: codex-019d70f5
tags:
  - provider
  - health
  - observability
kind: slice
epic: EPIC-kernel
parallel_group: kernel
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: gap
depends_on: []
write_scope:
  - packages/kernel/src/llm-provider-registry.ts
  - packages/kernel/src/llm-profile-resolver.ts
  - packages/kernel/test/llm-provider-registry.spec.ts
  - packages/kernel/test/llm-profile-resolver.spec.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bunx vitest run packages/kernel/test/llm-provider-registry.spec.ts packages/kernel/test/llm-profile-resolver.spec.ts"
completed_at: 2026-04-09T06:47:13.373Z
---

## Goal

让 provider/profile routing 从“只按静态 profile 解析”演进到“感知 provider 健康度与声明能力”的 route negotiation 层，为后续 diagnostics 与 fallback policy 提供统一真相源。

## Review Finding

当前 `LlmProviderRegistry` 只保存 provider 实例，`resolveLlmRoute()` 也只按 profile 配置做静态解析；仓库当前的真实 gap 不只是“缺 health 字段”，而是 provider registry 与 route resolver 之间还没有共享的 provider state / capability negotiation seam。若继续把健康度、能力支持与 fallback 判断散落在调用端，provider-profile-routing 模块会再次退回 app-local policy。

## Acceptance

- [x] provider registry 持有 provider metadata / runtime state，而不只是裸 provider 实例
- [x] provider state 至少覆盖 health status 与 capability 声明，供 route resolution 查询
- [x] route resolver 能基于 provider state 跳过 down provider 或拒绝不满足 capability 约束的 route
- [x] 测试覆盖：provider state 变更、capability 过滤、routing 跳过不可用 provider

## 工作总结

### 实现了什么
- 让 provider registry 直接持有 health/capabilities negotiation state
- 让 route resolver 按 provider health 与 requiredCapabilities 选择单一路由

### 实际跑了什么检查
- bunx vitest run packages/kernel/test/llm-provider-registry.spec.ts packages/kernel/test/llm-profile-resolver.spec.ts
- bunx vitest run packages/kernel/test/llm-kernel-adapter.spec.ts packages/kernel/test/kernel-facade.spec.ts packages/kernel/test/loop-orchestrator.spec.ts
- ./node_modules/.bin/biome check packages/kernel/src/llm-provider-registry.ts packages/kernel/src/llm-profile-resolver.ts packages/kernel/test/llm-provider-registry.spec.ts packages/kernel/test/llm-profile-resolver.spec.ts

### 残留风险
- 无

## 相关 commits

- `40de9fbbd2e0` feat(kernel): 收敛 provider 路由协商状态
