# Skill Lifecycle / Version Engine Boundary

本文件说明 `ISSUE-028` 收口后的最小非 UI lifecycle/version engine 边界。

## 为什么要单独有这层

当前仓库已经分别具备：

- `packages/contracts`
  - skill lifecycle state machine
  - trusted flag 约束
  - lifecycle actor 权限边界
- `packages/browser-vfs`
  - `mem://skills/<id>/@versions/<iso>/` 快照原语
  - retention / rollback target 选择
  - canonical skill version URI

此前缺的是把两者串起来的统一 engine-level contract。

## Engine 现在负责什么

### 1. Lifecycle contract

`packages/contracts` 负责：

- `draft -> staged -> installed -> enabled <-> disabled -> archived`
- `trusted` 只能作为 `enabled` 状态上的 flag
- northbound `skills.uninstall` 统一映射到 `archived`
- 该动作表示从 active product skill library 移除，不表示物理删除 skill 包或版本历史
- transition actor 边界：
  - Agent：`draft -> staged -> installed`
  - User/System：`installed -> enabled`、`enabled <-> disabled`
  - User/System：任意状态可归档
  - User：授予 `trusted`

### 2. Version policy contract

`packages/contracts` 负责：

- canonical snapshot root：`mem://skills/<id>/@versions`
- version format：ISO timestamp
- default retention：3
- rollback target：最近一个 trusted 版本
- rollback triggers：
  - verifier failed + 用户确认
  - release gate failed
- rollback action：`skills.rollback` 是共享 product control-plane action，可显式传入 `versionUri`，未传入时按 latest trusted rollback target 执行

### 3. Snapshot primitives

`packages/browser-vfs` 负责：

- 真实快照存储与 rehydrate
- canonical skill version URI round-trip
- 从 `VfsSnapshotInfo` 提升到 engine contract 可消费的 `SkillVersionRef`

### 4. Shared product loop

`apps/mv3-shell` 当前把这层 contract 接成一条最小可执行产品闭环：

1. `skills.summary.items[].versionSurface` 暴露 active version、snapshot root、rollback policy 和 rollback target
2. sidepanel Skills catalog 只根据 shared `versionSurface.rollbackTarget` 启用 rollback 命令
3. `skills.rollback` 通过 shared management action path 进入 runtime lifecycle manager
4. runtime 选择显式 `versionUri` 或 latest trusted rollback target，并调用 BrowserVFS rehydrate 还原 `mem://skills/<id>`
5. rollback 后保留原 lifecycle status / trusted 状态，刷新 package registry，让后续 `skills.summary` / `skills.invoke` 看到回滚后的 package
6. `audit.tail` 记录 `skills.rollback`、`rolled_back` status 与 skill/version evidence

## 什么仍然不在这层里

以下仍然**不属于**当前 engine boundary：

- Skill Studio UI
- catalog / versions / permissions 的可视化管理界面
- skill 包物理删除或 `@versions` purge 语义
- 发布审批与交互式 rollback UX
- 多版本选择器、rollback confirmation flow、diff/preview 等完整 Studio 交互
- 任何需要用户面板或产品流程编排的功能

这些都应继续留在后续 Skill Studio / product surface 中实现。

## Skill SDK 的位置

`packages/skill-sdk` 继续保持 thin facade。

它可以消费 lifecycle/version engine contract，但不是这套 contract 的真相源，也不应在 SDK 内重新定义一套并行状态机或版本模型。

## 当前最小闭环

当前仓库已具备的最小闭环是：

1. contracts 定义 lifecycle + version policy
2. BrowserVFS 提供 snapshot / rollback / canonical version URI
3. engine surface 通过 `SkillLifecycleVersionSurface` 把生命周期状态、当前版本、rollback target 和 version policy 串起来

这让后续 Skill Studio 或 runtime orchestration 可以直接建立在统一 contract 上，而不是继续靠口头约定拼接。
