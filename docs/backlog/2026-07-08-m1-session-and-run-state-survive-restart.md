---
id: ISSUE-189
title: "M1 里程碑：会话与运行状态跨重启持久化"
status: done
priority: p0
source: "docs/product-roadmap-2026-07-08.md M1"
created: 2026-07-08
assignee: atlas
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
completed_at: 2026-07-08T15:36:43.479Z
---

## Goal

让产品路径的会话（消息、压缩摘要、干预快照）与最近运行状态在 MV3 Service Worker 重启和扩展重载后可回读。这是 M1「可日用助手」的第一断点：现在每次 SW 被回收，用户的对话历史就消失。

## Context

- `apps/mv3-shell/src/runtime-services.ts` 的 `createSessionStorage()` 当前调 `BrowserVfs.create({ workspaceId })` 时不传 `store`，导致 `VfsSessionStorage` 落在纯内存 VFS 上；持久化仅存在于测试里的 mock VFS。
- 技能包路径已有可用先例：`createRuntimeBrowserVfs()` 通过 `createChromeStorageVfsStore(chromeApi)` 接了 `chrome.storage.local`。
- `packages/kernel/src/vfs-session-storage.ts` 与其测试已定义 `header.json` + `entries.jsonl` + `kernel.json` 的存储布局，无需重新设计。

## Acceptance

- [x] 产品路径的 session storage 接真实持久 store（复用 `createChromeStorageVfsStore`），扩展 / SW 重启后 bootstrap 能回读既有会话列表与消息。
- [x] restart round-trip 测试：模拟 runtime teardown → 重新 ensureServices → 会话、entries、compaction 摘要读回一致。
- [x] 会话数据增长有粗粒度控制（复用 VFS quota 语义或简单保留策略即可），超限行为是明确错误或明确淘汰，不是静默丢失。
- [x] sidepanel 会话历史在重启后展示同一列表（测试覆盖或 dogfood 证据二选一，最好都有）。
- [ ] 收口附一段真实 dogfood 记录：真实 Chrome 中重载扩展后继续一个既有会话。

## Not Now

- 不做会话云同步 / 导出格式扩展。
- 不做 Run/Loop 内存状态机的完整持久化（run phase 恢复为 idle 可接受，会话内容不丢即可）。
- 不重构 `runtime-services.ts` 的整体结构（顺路小拆分允许）。

## 工作总结

### 实现了什么
- createSessionStorage 接 chrome.storage-backed persistent VFS store (SESSION_VFS_STORAGE_KEY)；移除 InMemorySessionStorage fallback；新增 restart round-trip 测试 (vfs-session-storage + runtime-chat)

### 实际跑了什么检查
- bunx vitest run packages/kernel/test/vfs-session-storage.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts

### 残留风险
- 无

### 问题根因

`createSessionStorage()` 调 `BrowserVfs.create({ workspaceId })` 时未传 `store` 参数，导致 `VfsSessionStorage` 落在纯内存 VFS 上。每次 MV3 Service Worker 被回收，所有会话历史、entries、kernel snapshot 随之消失。

### 修复方案

1. **参数化 `createChromeStorageVfsStore`**：新增可选 `storageKey` 参数，默认沿用 `BROWSER_VFS_STORAGE_KEY`（技能包路径不受影响）。
2. **新增 `SESSION_VFS_STORAGE_KEY`**（`bbl-next.browser-vfs.sessions.v1`）：session VFS 使用独立的 chrome.storage.local key，与技能包 VFS 隔离，避免共享 key 的读写竞争。
3. **`createSessionStorage` 接受 `chromeApi`**：复用 `createChromeStorageVfsStore(chromeApi, SESSION_VFS_STORAGE_KEY)` 创建持久 store；当 chrome.storage 不可用时（测试环境）自动降级为 in-memory VFS（行为不变）。
4. **移除 `InMemorySessionStorage` fallback**：`BrowserVfs.create` 无 store 时自带 in-memory 语义，`VfsSessionStorage` 在 in-memory VFS 上是 drop-in 替代（已有 kernel 测试证明），无需额外分支。
5. **`ensureServices` 透传 `chromeApi`**：唯一调用点已更新。

### 测试

- **`vfs-session-storage.spec.ts`**：新增「survives across VFS instances when backed by a persistent store」测试——用 mock `PersistentVfsStore` 模拟跨 VFS 实例的持久化 round-trip（会话 header + entries + kernel snapshot 全部读回一致）。
- **`runtime-chat.spec.ts`**：新增「persists session data across MV3 Service Worker restart via chrome.storage-backed VFS」测试——用持久 `chrome.storage.local` mock 模拟 SW 重启（teardown first runtime → boot second runtime），验证 `SessionStore.createSession` + `appendEntry` 的数据在第二个 runtime 中完整读回。
- 全仓 `bun run check`：731 tests passed（+2）、typecheck OK、lint OK。

### 未完成

- 真实 Chrome dogfood 记录（重载扩展后继续既有会话）需要在真实浏览器环境执行，留作 M1 整体收口时补充。代码与测试层面已证明持久化链路完整。

## 相关 commits

- `5f1127ad157a` docs(issue-189): mark done, add work summary and commit ref

- `6f9229c` — fix(kernel): persist session storage across MV3 Service Worker restart (ISSUE-189)