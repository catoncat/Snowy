---
id: ISSUE-031
title: "Review: execution host control plane is still missing"
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
  - ai-surface
kind: slice
epic: EPIC-mv3-shell
parallel_group: mv3-shell
depends_on:
  - ISSUE-021
  - ISSUE-026
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
claimed_at: 2026-03-29T12:25:31.684Z
---

## Goal

把 `host.*` 通用原语和 `hosts.*` 产品控制面拆清楚，让本地/远程 host 真正成为一等执行面。

## Review Finding

- 新口径已经明确：Host 不再被去中心化，而是升级为 execution plane。
- 但当前代码只有非常薄的 `host.exec` 动作，还没有表达：
  - host 连接
  - host 默认值
  - host 健康状态
  - local / remote host 的产品控制面
- 如果这层不补，Host 仍然只是“能执行命令”，不是“产品的一等执行网络”。

## Acceptance

- `host.*` substrate 与 `hosts.*` control plane 的边界明确。
- 最小 host control plane contract 至少覆盖：
  - `hosts.list`
  - `hosts.get`
  - `hosts.connect`
  - `hosts.disconnect`
  - `hosts.set_default`
  - `hosts.health`
- 该 slice 继续坚持 Host 粗粒度原语，不把 `host.*` 扩散成细碎功能接口。

## 工作总结

- 在 `contracts/core` 补上 `hosts.*` public namespace 与最小 control plane descriptors，明确 `host.*` substrate 和 `hosts.*` 产品控制面的边界。
- 在 MV3 background bridge 落地本地 host control plane：`hosts.list/get/connect/disconnect/set_default/health`，且 `list/get/set_default` 不会隐式拉起 offscreen host。
- 补齐 `packages/contracts/test/contracts.spec.ts`、`packages/core/test/core.spec.ts`、`apps/mv3-shell/test/manifest.spec.ts`，并通过 `bun run check`。
- 剩余缺口已拆到 `ISSUE-032`：`host.*` 仍只有 `host.exec`，default host 选择也还没真正进入 substrate 路由。

## 相关 commits

- `14e4d3e` `core/mv3-shell: add hosts control plane`

## Sub Issues

- `ISSUE-032` `Review: host substrate still lacks default routing and file primitives`
