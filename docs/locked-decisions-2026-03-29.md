# Locked Decisions

本文件记录已经拍板的设计决定。默认不要在实现时偷偷改口径。

## Repo Shape

- 新仓是独立 sibling repo
- 新仓是未来主线
- 旧仓稳定前不做长期双写
- 采用 monorepo packages

## Core Model

- full public migration
- public capability id 是 invokable action 的唯一公开 API
- provider registry / policy / routing 全部基于 public capability
- `CapabilityDescriptor` 是 action canonical model
- `ToolContract` 只是 action 投影

## AI Surface

- 产品对 AI 暴露统一 AI Surface，而不只是 tools
- AI Surface 至少包含：actions、resources、events/audit、skills/workflows
- UI、聊天 Agent、Skill、外部接入应尽量共用同一套 AI Surface
- v1 优先少量强原语 + 足够上下文，不做细碎 capability 爆炸

## Execution Surfaces

- 浏览器仍是控制中枢
- `Execution Host` 是一等执行面，不再去中心化
- `Execution Host` 可以是本地，也可以是远程
- `host.*` 保持粗粒度原语，默认围绕 `read/write/edit/exec`
- `page.*` / `tabs.*` / `site.*` 仍然是浏览器本地能力

## BrowserVFS

- scope 固定为 `ephemeral / workspace / library`
- `workspace` = per-conversation
- `library` = 跨会话安装资产
- `workspace` 和 `library` 都 write-through
- v1 不做 dirty checkpoint
- 不允许依赖 shell 做文件发现和迁移

## JS Runner

- 采用长驻 host + 调用隔离
- runner 在 offscreen/sandbox host
- 不在 SW 直接跑动态模块
- 模块加载以受控注入为前提

## Site Runtime

- active-tab metadata only
- 只有显式 action invoke 时才注入
- MAIN world hook 按需安装
- 同域名多个 skill 可以共存

## Lifecycle

- `draft -> staged -> installed -> enabled <-> disabled -> archived`
- `trusted` 是 `enabled` 上的 flag，不是独立状态

## Migration

- hard cutover
- 不做旧 plugin API 兼容层
- 旧 builtins 不作为新主链的设计约束

## 对实现者的要求

- 若发现某个 slice 需要推翻这些决定，先更新设计文档和 backlog，再改代码
- 不要在单个 PR/单个 slice 里顺手改 architecture contract
