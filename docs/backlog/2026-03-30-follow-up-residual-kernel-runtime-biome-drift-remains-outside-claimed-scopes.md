---
id: ISSUE-078
title: "Follow-up: residual kernel-runtime Biome drift remains outside claimed scopes"
status: open
priority: p1
source: "ISSUE-076 closure 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - dx
  - biome
  - lint
  - workflow
module_id: repo-workflow-dx
module_stage: deferred
tracking_kind: follow-up
kind: slice
epic: EPIC-dx-hardening
parallel_group: sdk-docs
depends_on: []
write_scope:
  - apps/mv3-shell/src/local-host-adapter.js
  - apps/mv3-shell/src/offscreen.js
  - apps/mv3-shell/src/page-hook.js
  - packages/browser-vfs/src/index.ts
  - packages/browser-vfs/test/browser-vfs.spec.ts
  - packages/js-runner/src/runner-host-core.d.ts
  - packages/kernel/src/compaction-manager.ts
  - packages/kernel/src/in-memory-session-storage.ts
  - packages/kernel/src/loop-engine.ts
  - packages/kernel/src/run-controller.ts
  - packages/kernel/src/session-store.ts
  - packages/kernel/src/vfs-session-storage.ts
  - packages/kernel/test/compaction-manager.spec.ts
  - packages/kernel/test/loop-engine.spec.ts
  - packages/kernel/test/run-controller.spec.ts
  - packages/kernel/test/session-store.spec.ts
  - packages/kernel/test/vfs-session-storage.spec.ts
acceptance_ref: docs/reviews/2026-03-29-docs-dx-review.md
check_cmd: "bun run check"
---

## Goal

把 Follow-up: residual kernel-runtime Biome drift remains outside claimed scopes 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- ISSUE-076 的 write_scope 已通过聚焦 biome check，但仓库仍有 kernel runtime 残余 drift 持续卡住 bun run check。
- 剩余未覆盖文件集中在 mv3-shell 本地 host 路径、BrowserVFS、kernel 主体与 js-runner d.ts，不属于当前 active issues 的 write_scope。
- 如果不把这批残余文件单独认领，仓库会继续把 repo-wide lint 噪音误判成正在开发 slice 的失败。

## Acceptance

- 列出的 kernel runtime 残余 Biome drift 文件被统一收口。
- 当前 write scope 外的 repo-wide lint blocker 被压缩到已认领 issue 内，不再有新的未覆盖漂移集合。
- ISSUE-067 与 ISSUE-077 完成后，bun run check 可恢复为默认可信门禁而不再额外解释 Biome 例外。
