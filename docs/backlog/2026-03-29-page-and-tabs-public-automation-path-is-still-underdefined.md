---
id: ISSUE-037
title: "Review: page and tabs public automation path is still underdefined"
status: open
priority: p1
source: "browser automation follow-up planning 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - site-runtime
  - page
  - tabs
  - automation
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on:
  - ISSUE-036
write_scope:
  - docs/
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

在 `ISSUE-036` 锁定 cutover boundary 后，明确 `page.*` / `tabs.*` 的最小 public automation path，避免后续实现既不够用、又开始无序扩 capability 名称。

## Review Finding

- `docs/legacy-to-vnext-migration-matrix.md` 显示 `tab / page interaction tools` 仍是 `partial`。
- 当前仓已具备最小 site runtime invoke path，但并未把 cutover 前必需的 `page.*` / `tabs.*` production path 明确成一组稳定 contract。
- 如果不先锁最小 automation path，后续容易在“只补一个 page.click”与“重造整套旧 automation 工具”之间反复摇摆。

## Acceptance

- 明确 cutover 前必需的最小 `page.*` / `tabs.*` 集合。
- 明确这些能力与 site runtime / verifier / active-tab 边界的关系。
- 若结论需要新增或收紧 public capability contract，必须落为明确的 follow-up implementation slice。
- 不把截图/下载/人工接管混进本 issue 范围。
