---
id: ISSUE-034
title: "Review: migration control docs are stale after host substrate routing"
status: done
priority: p0
source: "migration control sync 2026-03-29"
created: 2026-03-29
assignee: codex
tags:
  - review
  - docs
  - host
kind: slice
epic: EPIC-sdk-docs
parallel_group: sdk-docs
depends_on:
  - ISSUE-032
write_scope:
  - docs/
acceptance_ref: docs/source-of-truth-map.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T13:04:52.829Z
---

## Goal

把 host substrate 已落地的行为同步回迁移控制面和当前排期文档，避免 backlog/plan 继续指向已关闭队列。

## Review Finding

- `ISSUE-032` 已落地 `host.read/write/edit/exec` 与 default-host routing。
- 但 `v0-slice`、migration docs 和当前 planning/backlog 文档仍把 host substrate 说成 `exec`-only，或者继续把 claim 流程指向已关闭的队列。

## Acceptance

- `v0-slice`、migration matrix、parity dashboard 能准确反映已落地的 host substrate surface 与残留风险。
- backlog README and current planning docs point claim flow at the real next open issue instead of ISSUE-032.
- 文档不再把已经落地并有测试的 host substrate routing 继续描述成未完成。

## 工作总结

- 同步了 `docs/v0-slice.md`、`docs/legacy-to-vnext-migration-matrix.md`、`docs/migration-parity-dashboard.md`，让 migration control docs 与 `ISSUE-032` 已落地的 host substrate surface 保持一致。
- 回写了 backlog README、Batch 3 历史快照，并重新生成当前 planning 文档，把 claim 流从已关闭的 `ISSUE-032` 切到当前 open 的 `ISSUE-035`。
- 已运行：
  - `bun run check`
  - `BBL_AGENT_NAME=codex bun run workflow:claim:preview`

## 相关 commits

- `8150a46` `docs: sync host substrate migration state`
- `0fe1379` `docs: seed next host follow-up issues`
- `974c92f` `docs(backlog): close issue 034`
