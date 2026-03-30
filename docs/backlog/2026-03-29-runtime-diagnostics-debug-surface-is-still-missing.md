---
id: ISSUE-025
title: "Review: runtime diagnostics/debug surface is still missing"
status: done
priority: p1
source: "next-batch review 2026-03-29"
created: 2026-03-29
assignee: agent
tags:
  - review
  - mv3-shell
  - diagnostics
  - debug
module_id: observability-audit
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-mv3-shell
parallel_group: mv3-shell
depends_on: []
write_scope:
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/src/offscreen.js
  - apps/mv3-shell/test/manifest.spec.ts
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T10:57:09.033Z
---

## Goal

把 runtime diagnostics/debug surface 的缺口收口成与 locked decisions 一致、可被测试锁住的最小调试入口。

## Review Finding

- Cutover Gate F requires a minimal diagnostics/debug surface
- but the MV3 shell still exposes no runtime-readable snapshot for runner/offscreen/site bridge state.
- When the substrate fails outside tests
- the new repo still lacks an explicit first-class debug path comparable to the old runtime diagnostics surface.

## Acceptance

- MV3 shell exposes a minimal diagnostics snapshot path for runner/offscreen/site bridge state.
- Tests cover both healthy and degraded snapshot responses without widening default permissions.
- The snapshot contract is explicit enough to serve as the Level 1 runtime debug entrypoint.

## 工作总结

### 2026-03-29 补记

- 已在 background runtime bridge 暴露只读 `runtime.diagnostics` snapshot，聚合 offscreen presence、runner health 和可选 page-hook/site bridge 状态
- 已在 offscreen bridge 补 `runner.diagnostics` 响应，避免复用会触发自愈路径的 `ensureHost()/health()`
- `apps/mv3-shell/test/manifest.spec.ts` 已锁住 healthy / degraded 两种 diagnostics 返回，并确认 diagnostics 不会额外触发 host 恢复
- 本次未改 manifest 权限面；默认权限仍保持最小 MV3 shell 配置
- 已运行 `bun x vitest run apps/mv3-shell/test/manifest.spec.ts` 与 `bun run check`

## 相关 commits

- `674fe1f` `feat(mv3-shell): add runtime diagnostics snapshot`
