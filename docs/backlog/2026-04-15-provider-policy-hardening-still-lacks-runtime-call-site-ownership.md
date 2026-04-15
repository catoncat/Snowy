---
id: ISSUE-132
title: "Review: provider policy hardening still lacks runtime call-site ownership"
status: open
priority: p1
source: "next-batch-planner review 2026-04-15"
created: 2026-04-15
assignee: unassigned
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
