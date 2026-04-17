---
id: ISSUE-163
title: "Follow-up: provider routing overrides still cannot be managed through shared control plane"
status: open
priority: p1
source: "next-batch-planner review 2026-04-17"
created: 2026-04-17
assignee: unassigned
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
---

## Goal

在 provider capability taxonomy 与 non-kernel route resolution 已收口后，把 provider override / policy state 继续接到 shared control-plane，而不是继续停留在 kernel-local runtime seam。

## Review Finding

- ISSUE-150 已解决 taxonomy 与 reusable route resolution，但 migration matrix 仍明确记录更广 provider policy hardening 尚未完成；当前缺的不是 resolver 本身，而是 shared control-plane 如何读取/更新 routing overrides。
- 如果不继续落票，provider-profile-routing 会被误判成实现基本完成，只剩抽象文案；但真实剩余问题是 operator-facing routing state 仍没有统一入口。

## Acceptance

- provider routing 的 override / policy state 可以通过 shared control-plane 读取或更新，且不要求调用方直连 kernel 私有实现。
- 若当前阶段只适合先补 northbound contract，则把 provider-profile-routing 与 ai-surface-control-plane 的职责边界写清，并保留后续更窄 implementation slice。
