---
id: ISSUE-035
title: "Review: offscreen execution host is still contract-only"
status: open
priority: p1
source: "Host adapter follow-up 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - host
  - js-runner
  - mv3-shell
kind: slice
epic: EPIC-js-runner
parallel_group: js-runner
depends_on:
  - ISSUE-032
write_scope:
  - packages/js-runner/src/index.ts
  - packages/js-runner/src/runner-host-core.js
  - packages/js-runner/test/js-runner.spec.ts
  - apps/mv3-shell/src/runner-host-core.js
  - apps/mv3-shell/src/offscreen.js
  - apps/mv3-shell/test/manifest.spec.ts
  - docs/
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

把默认 offscreen execution host 从 contract-only bridge 推进到真实 host adapter，让 `host.read/write/edit/exec` 在共享 runner host path 上成立。

## Review Finding

- `ISSUE-032` 已经把 `host.read/write/edit/exec` 接到 control plane 路由上。
- 但默认 offscreen `createRunnerHostCore()` 仍会把这些请求落到 unknown runner request 分支；当前成功路径还依赖测试里注入的 fake host implementation。

## Acceptance

- The shared runner host core handles host.read/write/edit/exec through an explicit host-adapter contract instead of falling through to an unknown request path.
- The default offscreen/local host path returns structured, tested host-substrate errors when no real adapter is configured.
- `packages/js-runner` and `apps/mv3-shell` stay in sync.
- Migration/control docs reflect `ISSUE-032` as landed plus the remaining adapter gap.
