---
id: ISSUE-005
title: "JS runner RPC and host health"
status: done
priority: p0
source: "v0 follow-up"
created: 2026-03-29
assignee: agent
tags:
  - js-runner
  - rpc
kind: slice
epic: EPIC-js-runner
parallel_group: js-runner
depends_on: []
write_scope:
  - packages/js-runner/src/index.ts
  - packages/js-runner/test/js-runner.spec.ts
acceptance_ref: docs/next-development-slices-2026-03-29.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T08:45:36.064Z
resolved: 2026-03-29
---

## Goal

把当前裸 host 变成可承接 offscreen bridge 的 RPC/health/cancel 模型。

## Acceptance

- 有 request/response protocol
- 有 host health 状态
- 有 cancel/timeout 组合测试

## 工作总结

### 2026-03-29 16:50 CST

- 已把 `JsRunnerHost` 从裸 `invoke()` 执行器升级为带 `dispatch()` 的结构化 RPC host
- 已补 `invoke / cancel / health` 协议、inflight registry、health 状态和 cancel/timeout 语义
- 已保持 `invoke()` 兼容，`site-runtime` 无需改动即可继续工作
- 已新增失败降级与成功恢复的健康状态测试

## 相关 commits

- `b787ba0` `feat: add js runner rpc and host health`
