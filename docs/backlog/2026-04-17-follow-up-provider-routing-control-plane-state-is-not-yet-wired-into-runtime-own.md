---
id: ISSUE-164
title: "Follow-up: provider routing control-plane state is not yet wired into runtime-owned profile config"
status: open
priority: p1
source: "ISSUE-163 follow-up 2026-04-17"
created: 2026-04-17
assignee: unassigned
tags:
  - review
  - provider
  - control-plane
  - runtime-services
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-provider-routing
parallel_group: contracts-core
depends_on:
  - ISSUE-163
write_scope:
  - apps/mv3-shell/src/runtime-services.ts
  - packages/kernel/src/kernel-facade.ts
  - docs/legacy-to-vnext-migration-matrix.md
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
---

## Goal

把 config.summary/config.update 的 model.routing 状态继续接到 runtime-owned provider profile config，而不是要求调用方每次手动传 override

## Review Finding

- ISSUE-163 只补齐了 shared contract 与 kernel consumer；当前 runtime-services 仍不会把 model.routing 的 default/fallback/lane override 自动 rehydrate 进 active profile config

## Acceptance

- runtime-owned provider profile config 能读取并应用 shared control-plane 的 model.routing overrides
- restart 后的 config summary 与 kernel active route 对同一组 provider routing overrides 保持一致
- 测试覆盖 runtime-owned rehydrate 与 route resolution 不再依赖每次显式传 routing override
