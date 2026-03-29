---
id: ISSUE-038
title: "Review: real local execution host adapter is still missing"
status: open
priority: p1
source: "ISSUE-035 follow-up 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - host
  - js-runner
  - mv3-shell
  - local-host
kind: slice
epic: EPIC-js-runner
parallel_group: js-runner
depends_on:
  - ISSUE-035
write_scope:
  - packages/js-runner/src/index.ts
  - packages/js-runner/src/runner-host-core.js
  - packages/js-runner/test/js-runner.spec.ts
  - apps/mv3-shell/src/runner-host-core.js
  - apps/mv3-shell/src/offscreen.js
  - apps/mv3-shell/src/local-host-adapter.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

把默认 offscreen/local host 从 `adapter_missing` stub 推进到真实 local execution adapter，让 `host.read/write/edit/exec` 至少有一条非 fake-host 的默认成功路径。

## Review Finding

- `ISSUE-035` 已把 shared runner host path 从 unknown request fallback 收口为显式 host-adapter contract。
- 但默认 offscreen `createHost` 仍未配置真实 local adapter；当前默认路径只会返回结构化 `adapter_missing` error。
- `docs/v0-slice.md` 与迁移控制面仍把 real local/remote adapter 视为 deferred gap；如果 local path 永远没有真实 adapter，`host.*` 仍只是 contract 与错误模型，不是可替代旧仓 host execution 的主链能力。

## Acceptance

- 默认 offscreen/local host 接入一个真实的 local execution adapter，`host.read/write/edit/exec` 至少有最小成功路径，不再依赖测试注入 fake host。
- adapter contract 明确区分：
  - setup / transport failure
  - unsupported operation
  - execution failure
- `apps/mv3-shell/test/manifest.spec.ts` 覆盖默认 `createHost` 路径下至少一条成功的 `host.*` 流程。
- 文档明确：remote host path 仍是单独 gap，不在本 slice 内顺手吞并。
