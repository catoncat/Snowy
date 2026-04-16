---
id: ISSUE-149
title: "site.fetch_with_session action is typed but fetch-with-auth bridge is missing"
status: done
priority: p1
source: review
created: 2026-04-15
assignee: codex-019d9444
tags:
  - review
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-browser-automation
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/site-runtime/src/index.ts
  - apps/mv3-shell/src/background.ts
  - packages/site-runtime/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
completed_at: 2026-04-16T03:29:14.545Z
---

## Goal

把 site.fetch_with_session action is typed but fetch-with-auth bridge is missing 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding


## Acceptance

- site.fetch_with_session has a provider that executes fetch using the active tab session cookies; response is returned as typed result with status and body; test coverage for auth-bearing fetch and error paths

## 工作总结

### 实现了什么
- 补齐 site.fetch_with_session 的 page-hook bridge、runtime provider 与 background 路由，并补上带会话 fetch 覆盖

### 实际跑了什么检查
- bun test packages/site-runtime/test/site-runtime.spec.ts apps/mv3-shell/test/manifest.spec.ts

### 残留风险
- 无

## 相关 commits

- `42c727e1628d` fix(browser-automation): 补齐带会话 fetch 桥接
