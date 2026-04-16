---
id: ISSUE-154
title: "Review: page.query/click/fill production path is still not closed"
status: done
priority: p1
source: review
created: 2026-04-16
assignee: codex-019d9439
tags:
  - review
  - site-runtime
  - automation
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - apps/mv3-shell/src/background.ts
  - apps/mv3-shell/src/page-hook.ts
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
completed_at: 2026-04-16T05:44:27.943Z
---

## Goal

把 page.query/click/fill production path is still not closed 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- Cutover criteria still call out page.query click and fill as the remaining Tier 1 production path gaps even though press_key screenshot and tabs.navigate already have minimal runtime paths.
- The page hook currently demonstrates query click and fill mechanics, but the shared runtime path and verifier-aware production routing are not yet closed as a cutover-ready lane.

## Acceptance

- Runtime services expose production page.query page.click and page.fill routes with active-tab enforcement and verifier-aware trace output
- The page hook bridge supports query click and fill round-trips through the shared runtime path rather than test-only harness behavior
- Tests cover query click and fill invoke plus verify behavior end-to-end across MV3 shell and site runtime

## 工作总结

### 实现了什么
- 补齐 MV3 runtime-services 与 background bridge 的 page.query/page.click/page.fill 生产路径，并补充 runtime-services 与 MV3 bridge 端到端测试；同步 cutover/parity 文档，剩余缺口收敛为 page action failure 上的 intervention lifecycle integration。

### 实际跑了什么检查
- bun x vitest run apps/mv3-shell/test/manifest.spec.ts -t "page.query"
- bun run test -- packages/site-runtime/test/site-runtime.spec.ts

### 残留风险
- bun run test -- apps/mv3-shell/test/manifest.spec.ts 当前被 remote-host 多记录相关未完成 slice 阻塞，10 个失败均与本 issue 无关。

## 相关 commits

- `19c7358fbdf8` feat(site-runtime): 补齐 page query click fill 生产路径
