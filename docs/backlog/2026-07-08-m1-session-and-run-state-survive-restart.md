---
id: ISSUE-189
title: "M1 里程碑：会话与运行状态跨重启持久化"
status: open
priority: p0
source: "docs/product-roadmap-2026-07-08.md M1"
created: 2026-07-08
assignee: unassigned
tags:
  - ready-for-agent
  - product-m1
  - kernel
  - session-persistence
kind: slice
epic: EPIC-product-mainline
parallel_group: kernel
module_id: kernel
module_stage: mainline
tracking_kind: mainline
depends_on: []
write_scope:
  - apps/mv3-shell/src/runtime-services.ts
  - packages/kernel/src/vfs-session-storage.ts
  - packages/browser-vfs/src/index.ts
  - packages/kernel/test/vfs-session-storage.spec.ts
  - apps/mv3-shell/test/runtime-chat.spec.ts
acceptance_ref: docs/product-roadmap-2026-07-08.md
check_cmd: "bunx vitest run packages/kernel/test/vfs-session-storage.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts"
---

## Goal

让产品路径的会话（消息、压缩摘要、干预快照）与最近运行状态在 MV3 Service Worker 重启和扩展重载后可回读。这是 M1「可日用助手」的第一断点：现在每次 SW 被回收，用户的对话历史就消失。

## Context

- `apps/mv3-shell/src/runtime-services.ts` 的 `createSessionStorage()` 当前调 `BrowserVfs.create({ workspaceId })` 时不传 `store`，导致 `VfsSessionStorage` 落在纯内存 VFS 上；持久化仅存在于测试里的 mock VFS。
- 技能包路径已有可用先例：`createRuntimeBrowserVfs()` 通过 `createChromeStorageVfsStore(chromeApi)` 接了 `chrome.storage.local`。
- `packages/kernel/src/vfs-session-storage.ts` 与其测试已定义 `header.json` + `entries.jsonl` + `kernel.json` 的存储布局，无需重新设计。

## Acceptance

- [ ] 产品路径的 session storage 接真实持久 store（复用 `createChromeStorageVfsStore` 或 `IndexedDbVfsStore`），扩展 / SW 重启后 bootstrap 能回读既有会话列表与消息。
- [ ] restart round-trip 测试：模拟 runtime teardown → 重新 ensureServices → 会话、entries、compaction 摘要读回一致。
- [ ] 会话数据增长有粗粒度控制（复用 VFS quota 语义或简单保留策略即可），超限行为是明确错误或明确淘汰，不是静默丢失。
- [ ] sidepanel 会话历史在重启后展示同一列表（测试覆盖或 dogfood 证据二选一，最好都有）。
- [ ] 收口附一段真实 dogfood 记录：真实 Chrome 中重载扩展后继续一个既有会话。

## Not Now

- 不做会话云同步 / 导出格式扩展。
- 不做 Run/Loop 内存状态机的完整持久化（run phase 恢复为 idle 可接受，会话内容不丢即可）。
- 不重构 `runtime-services.ts` 的整体结构（顺路小拆分允许）。
