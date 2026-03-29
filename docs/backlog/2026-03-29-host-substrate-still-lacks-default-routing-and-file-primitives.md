---
id: ISSUE-032
title: "Review: host substrate still lacks default routing and file primitives"
status: open
priority: p1
source: "AI-native surface follow-up 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - host
  - mv3-shell
  - core
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
