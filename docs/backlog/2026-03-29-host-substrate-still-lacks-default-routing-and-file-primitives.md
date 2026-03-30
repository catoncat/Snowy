---
id: ISSUE-032
title: "Review: host substrate still lacks default routing and file primitives"
status: done
priority: p1
source: "AI-native surface follow-up 2026-03-29"
created: 2026-03-29
assignee: codex
tags:
  - review
  - host
  - mv3-shell
  - core
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-mv3-shell
parallel_group: mv3-shell
depends_on:
  - ISSUE-031
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/src/offscreen.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T12:49:00.837Z
---

## Goal

把 host substrate 的默认路由和文件原语补齐，让 `hosts.set_default` 真正进入执行路径。

## Review Finding

- `ISSUE-031` 已经补上最小本地 `hosts.*` control plane。
- 但当前 host substrate 仍只有 `host.exec`，也还没有消费 control plane 的默认 host 选择。

## Acceptance

- `host.*` 至少覆盖 `read/write/edit/exec`，或者明确收窄设计文档。
- host substrate 请求可以通过显式 `hostId` 或 control plane 默认 host 完成路由。
- local host routing 有对应测试覆盖，且不重新引入 shell-centric discovery。

## 工作总结

- 在 `packages/contracts` 和 `packages/core` 补上 `host.read/write/edit/exec` substrate contract，并新增 default-host routing 纯函数，明确显式 `hostId` 与 control plane 默认 host 的优先级。
- 在 `apps/mv3-shell` background/offscreen bridge 落地 `host.*` 路由；substrate 请求现在会先解析显式 `hostId`，否则消费 `hosts.set_default` 写入的默认 host。
- 补齐 `packages/contracts/test/contracts.spec.ts`、`packages/core/test/core.spec.ts`、`apps/mv3-shell/test/manifest.spec.ts`，覆盖显式路由、默认路由与本地 host read/write/edit/exec。
- 已运行 `bun run check`。
- 剩余风险：当前默认 offscreen host 仍是 bridge contract 层，真实 OS-backed host adapter 仍需后续单独实现。

## 相关 commits

- `f568707` `feat: route host substrate through control plane`
