---
id: ISSUE-025
title: "Review: runtime diagnostics/debug surface is still missing"
status: open
priority: p1
source: "next-batch review 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - mv3-shell
  - diagnostics
  - debug
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
---

## Goal

把 runtime diagnostics/debug surface is still missing 收口到 locked decisions 和测试口径。

## Review Finding

- Cutover Gate F requires a minimal diagnostics/debug surface
- but the MV3 shell still exposes no runtime-readable snapshot for runner/offscreen/site bridge state.
- When the substrate fails outside tests
- the new repo still lacks an explicit first-class debug path comparable to the old runtime diagnostics surface.

## Acceptance

- MV3 shell exposes a minimal diagnostics snapshot path for runner/offscreen/site bridge state.
- Tests cover both healthy and degraded snapshot responses without widening default permissions.
- The snapshot contract is explicit enough to serve as the Level 1 runtime debug entrypoint.
