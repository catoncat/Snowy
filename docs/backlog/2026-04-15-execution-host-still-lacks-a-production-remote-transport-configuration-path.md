---
id: ISSUE-134
title: "Review: execution host still lacks a production remote transport configuration path"
status: done
priority: p1
source: "next-batch-planner review 2026-04-15"
created: 2026-04-15
assignee: codex-11d698eb
tags:
  - review
  - execution-host
  - remote-host
  - transport
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: follow-up
kind: slice
epic: EPIC-execution-host
parallel_group: js-runner
depends_on: []
write_scope:
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/runtime-services.ts
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/legacy-to-vnext-migration-matrix.md
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
completed_at: 2026-04-15T14:17:52Z
---

## Goal

在 remote host record、probe-backed health 与 bridge transport contract 已落地后，明确 execution-host 模块下一步是 production transport configuration、host discovery，还是显式继续 deferred。

## Review Finding

- ISSUE-125/126/127 已把 remote host 从 injectable plumbing 收口到 first-class record + probe + bridge contract，但 migration docs 仍明确保留 concrete production transport config 与 multi remote host discovery/parity 作为剩余 gap。
- 当前 remote transport 仍依赖构造期注入，没有仓库内的生产配置/选择/诊断入口，因此 execution-host-bridge 继续保持 partial。
- 如果不重新落票，remote host 会停留在测试和 bridge 契约都具备、但运营配置路径无人承接的状态。

## Acceptance

- 明确 production remote transport configuration 与 multi-host discovery 中，哪一块是下一条 executable slice，哪一块继续 deferred。
- 若继续实现，follow-up 必须锚定 hosts.* control plane 与 remote transport contract 的边界，而不是把语义重新塞回 app-local glue。
- planning docs 与 migration docs 同步记录 ISSUE-127 之后的真实剩余 gap，避免 execution-host 状态继续停留在笼统 partial。

## 工作总结

### 实现了什么
- 将 remote transport 配置接入共享 `config.update/config.summary` 控制面，并把 secret 分流到独立 storage key
- 让 background bridge 可以从共享配置热加载 fetch-backed remote transport，并在重启后恢复 remote host
- 补上 review 修复：`config.update` 全量校验失败时不再残留 remote transport 持久化副作用
- 补上 review 修复：拒绝 `baseUrl` 携带 userinfo，避免凭证通过公开 `config.summary` 泄漏
- 更新 migration matrix，明确 production remote transport configuration 已落地，剩余 gap 收敛为多 remote host discovery/parity

### 实际跑了什么检查
- `bun run test -- apps/mv3-shell/test/manifest.spec.ts`
- `./node_modules/.bin/biome check apps/mv3-shell/src/background.ts apps/mv3-shell/src/runtime-services.ts apps/mv3-shell/test/manifest.spec.ts docs/legacy-to-vnext-migration-matrix.md`
- `git diff --check`
- `bun run check`（失败：受 `.agents/skills/auto-claim-issues-next/scripts/complete-issue.ts` 与 `packages/site-runtime/test/site-runtime.spec.ts` 等 write scope 外既有类型错误阻塞）

### 残留风险
- 多 remote host discovery/parity 仍未实现，本轮只收口 single remote host 的 production transport configuration
- 当前 shared workspace 的 live lease / queue 已被并行 session 推进，未复用 `workflow:done` 自动收口；仅手工回写当前 issue，避免把他人的 backlog/queue 改动混入本次提交

## 相关 commits

- `193e66402368` feat(mv3-shell): 接通远端传输配置路径
- `9b0a0887b377` fix(mv3-shell): 避免校验失败残留传输配置
- `d13c235f46a7` fix(mv3-shell): 禁止传输地址携带凭证
