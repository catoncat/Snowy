---
id: ISSUE-106
title: "Generic config control plane 持久化对齐"
status: done
priority: p1
source: "next-batch-planner review 2026-04-09"
created: 2026-04-09
assignee: codex-019d70f6
tags:
  - config
  - persistence
  - control-plane
kind: slice
epic: EPIC-ai-surface
parallel_group: contracts-core
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
depends_on: []
write_scope:
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/test/runtime-chat.spec.ts
acceptance_ref: docs/ai-surface-index.md
check_cmd: "bunx vitest run packages/core/test/core.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts"
completed_at: 2026-04-09T11:29:50.743Z
---

## Goal

让 generic config control plane 的状态拥有统一的持久化与重载路径，覆盖 `config.update` 暴露的 model / automation / permissions / preferences 等 surface，而不是继续与已有的 LLM profile 存储分叉。

## Review Finding

`createConfigControlPlane()` 当前仍是进程内内存实现；与此同时，MV3 runtime 已经为 `llm.config.update` 单独持久化了 profile config。也就是说，仓库当前的真实问题不是“完全没有 config persistence”，而是 generic `config.update` surface 与已有的 LLM config 存储各走一套路径，extension restart 后容易出现 bootstrap summary 与 runtime config drift。

## Acceptance

- [ ] generic config control plane 通过单一持久化路径在 restart 后恢复 `config.update` 暴露的 surface 值
- [ ] `config.update` 写入后会同步持久化，并在 runtime services 启动时完成 rehydrate
- [ ] 现有 `llm.config.update` 的持久化路径与 generic config surface 对齐或显式复用，避免再新增第三套配置真相源
- [ ] 测试覆盖：core config control plane 持久化行为、runtime services rehydrate、`config.update` 后重启仍可读回

## 工作总结

### 实现了什么
- 为 config control plane 增加可持久化的 persist hook
- 让 runtime services 在 restart 后统一 rehydrate config.summary 与 llm profile model surface
- 让 config.update 与 llm.config.update 共享并同步配置持久化路径

### 实际跑了什么检查
- bunx vitest run packages/core/test/core.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts
- ./node_modules/.bin/biome check packages/core/src/index.ts packages/core/test/core.spec.ts apps/mv3-shell/src/runtime-services.ts apps/mv3-shell/test/runtime-chat.spec.ts

### 残留风险
- 无

## 相关 commits

- `862609504484` feat(config): 对齐 control plane 配置持久化
