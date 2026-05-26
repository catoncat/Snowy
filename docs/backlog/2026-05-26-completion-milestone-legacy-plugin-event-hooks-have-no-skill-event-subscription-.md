---
id: ISSUE-181
title: "Completion milestone: legacy plugin event hooks have no Skill event subscription path"
status: done
priority: p0
source: "anti-fragmentation planning 2026-05-27"
created: 2026-05-26
assignee: codex-loop
tags:
  - review
  - completion
  - legacy-plugin
  - events
  - skill
module_id: old-product-replacement-loop
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-legacy-plugin-migration
parallel_group: mv3-shell
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/skill-package-convention.md
  - docs/ai-surface-index.md
  - docs/legacy-to-vnext-migration-matrix.md
  - docs/migration-parity-dashboard.md
  - docs/cutover-readiness-criteria.md
  - docs/agent-bootstrap-context-pack.md
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
completed_at: 2026-05-26T20:01:55.041Z
---

## Goal

Migrate one real legacy hook-driven plugin behavior into the vNext executable Skill model by adding a shared event/subscription path instead of reintroducing Plugin as a product concept.

## Review Finding

- The old external plugins are hook/event driven: `send-success-global-message` listens to `runtime.route.after` and emits runtime messages / brain events automatically. `ISSUE-172` through `ISSUE-180` prove manual package install/update/invoke/rollback, but they do not prove an enabled Skill can subscribe to runtime events and replace legacy plugin hooks.
- Without this milestone, full browser plugin refactor completion can keep claiming representative invoke parity while still lacking the old product's automatic plugin extension behavior.

## Acceptance

- A package-backed Skill manifest can declare a minimal runtime event subscription for the legacy `send-success-global-message` class of behavior, and `skills.summary` / `runtime.bootstrap` expose that subscription metadata through shared surface.
- The shared MV3 runtime dispatches a representative runtime event to enabled subscribed package-backed skills through the existing JS runner path, without a private Plugin registry or app-local package truth.
- A migrated send-success-style package can be installed through shared `skills.install`, enabled, receive the event, emit observable result/evidence, and leave `audit.tail` or observability evidence for the event-triggered skill invocation.
- Docs define the old plugin hook to Skill event subscription migration boundary and keep broader hook ecosystem/bulk migration in Not Now unless the pilot proves a blocker.

## 工作总结

### 实现了什么
- 支持 package-backed Skill 在 skill.json 声明 eventSubscriptions；skills.summary/runtime.bootstrap 投影订阅 metadata；shared MV3 runtime 新增 runtime.event.dispatch，只投递给 enabled package Skill 并复用 skills.invoke + JS Runner + audit.tail 留证；文档同步旧 hook-driven plugin 到 Skill event subscription 的迁移边界。

### 实际跑了什么检查
- bun run test -- packages/contracts/test/contracts.spec.ts packages/core/test/core.spec.ts apps/mv3-shell/test/manifest.spec.ts; bun run typecheck; git diff --check; ./node_modules/.bin/biome check <touched files>; bun run check

### 残留风险
- 无

## 相关 commits

- `fd5347315a9b` feat(mv3): 支持 Skill 事件订阅触发
