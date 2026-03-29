---
id: ISSUE-008
title: "Site skill fixture invoke path"
status: in-progress
priority: p1
source: "v0 follow-up"
created: 2026-03-29
assignee: agent
tags:
  - site-runtime
  - fixture
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on:
  - ISSUE-006
  - ISSUE-007
write_scope:
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - apps/mv3-shell/src/page-hook.js
acceptance_ref: docs/next-development-slices-2026-03-29.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T09:07:17.128Z
---

## Goal

补一个真实的 site skill fixture 贯通 invoke path。

## Acceptance

- 从 skill action 到 runner 到 verifier 有集成测试

