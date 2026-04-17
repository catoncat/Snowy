---
id: ISSUE-164
title: "Follow-up: provider routing control-plane state is not yet wired into runtime-owned profile config"
status: done
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
completed_at: 2026-04-17T13:51:53.000Z
---

## Goal

把 config.summary/config.update 的 model.routing 状态继续接到 runtime-owned provider profile config，而不是要求调用方每次手动传 override

## Review Finding

- ISSUE-163 只补齐了 shared contract 与 kernel consumer；当前 runtime-services 仍不会把 model.routing 的 default/fallback/lane override 自动 rehydrate 进 active profile config

## Acceptance

- runtime-owned provider profile config 能读取并应用 shared control-plane 的 model.routing overrides
- restart 后的 config summary 与 kernel active route 对同一组 provider routing overrides 保持一致
- 测试覆盖 runtime-owned rehydrate 与 route resolution 不再依赖每次显式传 routing override

## 工作总结

### 实现了什么
- 让 `runtime-services` 在 `config.update` 写入时把 shared `model.routing` 的 default/fallback/lane overrides 同步进 runtime-owned `LlmProfileConfig`
- 在 runtime 启动时从持久化的 `config.summary` rehydrate `model.routing`，让 kernel 无需每次显式传 routing override 就能解析 active route
- 更新 migration matrix，记录 shared routing state 已接回 runtime-owned profile config

### 实际跑了什么检查
- `bun run test -- apps/mv3-shell/test/runtime-chat.spec.ts`
- `bun run test -- apps/mv3-shell/test/manifest.spec.ts -t "config.update"`
- `./node_modules/.bin/biome check apps/mv3-shell/src/runtime-services.ts apps/mv3-shell/test/runtime-chat.spec.ts`
- `git diff --check`
- `bun run check`（失败：`packages/core/test/core.spec.ts` 695/702/706/708 的既有联合类型错误，与本次 runtime routing wiring 无关）

### 残留风险
- shared control-plane 里的 `policy` 仍是 northbound contract 字段；本次只把 runtime-owned profile config 可持久化/可重启恢复的 default/fallback/lane overrides 接回主链
- repo 级 `bun run check` 仍被既有 `packages/core/test/core.spec.ts` 类型错误阻塞，因此本次完成度以定向测试 + 定向 lint 为准

## 相关 commits

- `2fc760d531bd` fix(runtime): 回填 provider routing 运行态配置
