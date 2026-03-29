  # 新 sibling repo 重构计划：Skill Runtime / Site Capability vNext

  ## Summary

  - 新建一个独立 sibling repo，作为未来主线；旧仓暂不承载本次重构实现，只作为参考与后续反向移植
    目标。
  - 新仓采用 Monorepo packages + Chrome MV3 app 形态，且 TDD for everything：所有实现先写
    failing test，再补实现。
  - v0 第一里程碑只证明核心内核 slice：Capability API + BrowserVFS + JS Runner + 最小 Site Skill
    激活链路，不先做完整产品壳。
  - 架构主轴固定为：Skill 是唯一产品概念，CapabilityDescriptor 是唯一 canonical model，
    ToolContract / Skill SDK / MCP export 都是它的投影。

  ## Decisions Locked

  ### Repo / Product Shape

  - 新仓定位：未来主线。
  - 交接策略：新仓先跑稳，再按切片反向移植或切换入口；不做持续双写。
  - 仓库形态：Monorepo。
  - 建议包结构：
      - packages/contracts：descriptor、router、errors、trace、state machine、schemas
      - packages/core：capability registry/router、policy、skill runtime、versioning
      - packages/browser-vfs：mem://、IDB store、workspace/library/ephemeral scopes
      - packages/js-runner：runner host protocol、RPC client/server、module loader
      - packages/site-runtime：content/main/CDP/network adapters、site activation
      - packages/skill-sdk：ctx.capabilities.*、ctx.call()、ctx.skills.invoke()
      - apps/mv3-shell：最小 Chrome MV3 承载壳
  - 旧仓关系：只参考，不复用实现，不做兼容设计驱动。

  ### D1 / D2 Capability Model

  - 采用 Full public migration。
  - provider registry、policy registry、execution routing 全部直接使用 public capability id。
  - registry 形态采用 public ids + family providers，不是 one-provider-per-capability。
  - CapabilityDescriptor 是唯一源头；ToolContract 仅为运行时投影。
  - 所有 builtin tools 一次性迁到 descriptor 投影，不保留旧 ToolContract 主链。
  - local.* 不再作为特例心智保留；统一纳入 public capability namespace。
  - 调用链固定：
      - ctx.call("page.click", input)
      - CapabilityRegistry.resolveDescriptor("page.click")
      - ExecutionBinding.resolve("page.click")
      - providerRegistry.invoke("page.click", boundInput)
      - policy/verify/trace
  - 明确双层：
      - Public capability：唯一公开 API
      - 执行绑定：public -> provider family / adapter
      - 不再把 coarse internal capability 作为正式契约保留；若实现期临时存在，也必须完全藏在
        adapter 内。

  ### Public Interfaces

  - CapabilityDescriptor
      - id
      - version
      - description
      - inputSchema
      - outputSchema
      - risk
      - sideEffects
      - permissions
      - supportsVerify
      - supportsStreaming
      - exportable
      - executionBinding
  - ctx
      - ctx.capabilities.<namespace>.<method>()
      - ctx.call(capabilityId, input)
      - ctx.runtime.listCapabilities()
      - ctx.runtime.getCapability(id)
      - ctx.skills.invoke(skillId, action, args)
  - 初始 public namespaces
      - memfs.*
      - page.*
      - site.*
      - tabs.*
      - runner.*
      - skills.*
      - runtime.*
      - host.*

  ### D3 BrowserVFS

  - scope 立即改名为：
      - ephemeral
      - workspace
      - library
  - workspace = per-conversation 工作区。
  - library = 跨会话安装资产与共享内容。
  - ephemeral = 纯运行时临时态，不持久化。
  - v1 落盘策略：workspace、library 都 write-through 到 IDB。
  - 不做 dirty tracking / checkpoint v1。
  - bash.exec 完全移除；VFS 必须原生支持：
      - read/write/edit/stat/list/mkdir/rm/mv/copy/staging/snapshot/rehydrate
  - Skill 发现、迁移、版本切换都基于原生 VFS API，不允许依赖 shell 命令。
  - quota 默认：
      - workspace 单会话 50MB
      - library 总量 200MB
      - 超限行为：拒绝写入并返回明确错误码

  ### D4 JS Runner Host

  - 采用 长驻 Host + 调用隔离。
  - 运行载体：MV3 app 内的 offscreen/sandbox host。
  - 单次 invocation 使用独立模块上下文 + request id + AbortController；不共享模块级状态。
  - 模块加载：new Function() 注入受控 ctx，不依赖 eval() 字符串协议，也不在 SW 执行动态模块。
  - 通信：SW 与 runner host 走 request/response RPC。
  - runner.js 运行在 JS Runner Host，不在 SW。
  - 超时：SW 侧 deadline + host 侧 abort；失败后销毁本次 invocation 上下文，不重建整个长驻
    host，除非 host 失健康。
  - 并发：host 可并发多 invocation，但每次 invocation 必须隔离 trace / fsDiff / capability
    scope。

  ### D5 Site Skill Activation

  - 激活模式固定为：
      - active-tab metadata only：只对当前活跃 tab 做轻量 metadata 匹配
      - 显式 action 调用时才执行注入
  - content/page 脚本注入采用动态注入，不改静态 manifest 主路径。
  - MAIN world hook 在 skills.invoke(skillId, action) 时按需安装。
  - 同域名多个 Site Skill 不互斥，按 skillId.action 分流。
  - runner.js 负责编排 capability 调用，不直接操作 DOM。
  - 最小激活链路：
      - active tab matched
      - action selected
      - install hooks if needed
      - invoke capability-backed action
      - run verifier
      - record trace

  ### D6 / D10 Skill Lifecycle & Versioning

  - 状态机：
      - draft -> staged -> installed -> enabled <-> disabled -> archived
      - trusted 为 enabled 上的布尔 flag，不是独立状态
  - 触发权：
      - Agent：draft -> staged -> installed
      - User/System：installed -> enabled
      - User：授予 trusted
      - System/User：任意可转 archived
  - Site Skill 版本模型：
      - 每次 Agent 修复/升级都生成新版本
      - 版本号使用 ISO timestamp
      - 快照位置：mem://skills/<id>/@versions/<iso>/
      - 最多保留 3 个版本
      - rollback 目标：最近一个 trusted 版本
      - rollback 触发：verifier 失败 + 用户确认 或 发布门禁失败

  ### D7 Plugin Migration

  - 采用 Hard cutover。
  - 不做旧 Plugin API 兼容层。
  - 旧官方/示例 plugin 在切换期可暂时下线。
  - 新模型统一为 executable Skill：
      - skill.runtime.json
      - runner module
      - actions
      - verifiers
      - setup(api) 扩展入口
  - Plugin Studio 直接被 Skill Studio 取代。
  - 遇到 legacy plugin 包时，系统返回 unsupported / migration required，不自动适配。

  ### D8 ctx / Permissions / Reentrancy

  - 每次 skills.invoke() 都新建一个 ctx。
  - ctx 绑定：
      - sessionId
      - skillId
      - permissionSet
      - traceId
      - depth
  - 权限检查发生在 ctx.call() 入口。
  - listCapabilities() 只返回当前 skill 权限范围内的 descriptor。
  - 递归深度上限固定为 3。
  - 每次 capability call 必须写 trace entry。
  - 高风险 capability 需要显式 confirm gate。
  - 标准错误码至少包括：
      - E_CAPABILITY_NOT_FOUND
      - E_PERMISSION_DENIED
      - E_TIMEOUT
      - E_VERIFY_FAILED
      - E_BAD_INPUT
      - E_RUNTIME
      - E_REENTRANCY_BLOCKED

  ### D9 MCP Export

  - v0 不实现完整 MCP export server，但 descriptor 必须预留：
      - exportable
      - exportName
      - exportRisk
  - 正式 MCP server 放 Bridge 侧。
  - 导出粒度：per-capability。
  - 默认可导出候选：
      - memfs.* 只读类
      - page.* 只读类
      - tabs.list
      - runtime.list_capabilities
  - 认证复用 BRIDGE_TOKEN。

  ## Implementation Plan

  ### Phase 0: New Repo Bootstrap

  - 建新 sibling repo，初始化 Monorepo、TypeScript、Vitest、Chrome MV3 app skeleton。
  - 先写 repo-level RFC tests，锁 CapabilityDescriptor、VFS scopes、Skill state machine、runner
    protocol。
  - 建立 contracts 包作为最上游依赖，其他包不得绕过它定义类型。

  ### Phase 1: Descriptor / Registry / Projection

  - 先实现 CapabilityDescriptor、family provider registry、execution binding、tool projection。
  - 所有 builtin capability/tool 直接进入 public namespace，不再新增旧式 registry path。
  - 完成 LLM tool list 由 descriptor 全量生成。
  - 完成 ctx.call()、ctx.runtime.*、ctx.skills.invoke() 契约测试。

  ### Phase 2: BrowserVFS

  - 实现 ephemeral/workspace/library 三层 VFS。
  - 完成 write-through IDB 存储、配额控制、版本快照目录。
  - 移除任何 shell 依赖的文件操作路径。
  - 先用纯 VFS 测试覆盖 skill 安装、发现、版本切换、rollback path。

  ### Phase 3: JS Runner Host

  - 实现 offscreen/sandbox host、RPC、module loader、abort/timeout、fsDiff、trace。
  - 让 executable skill 在 runner host 内跑通。
  - 验证 ctx 注入、权限检查、depth limit、traceId 传播。

  ### Phase 4: Site Runtime

  - 接入 active-tab metadata matching。
  - 实现动态 content/page hook 注入。
  - 提供最小 page.* / site.* capabilities。
  - 跑通 1 个最小 Site Skill fixture：match -> install -> action -> verifier -> trace。

  ### Phase 5: Skill Studio / Lifecycle / Versioning

  - 做最小 Skill Studio：catalog、runtime、permissions、test、versions。
  - 实现 draft/staged/installed/enabled/disabled/archived 转换与 trusted flag。
  - 实现版本保留、rollback gate、legacy plugin unsupported 流程。

  ### Phase 6: Export / Migration Readiness

  - 预留 MCP export metadata。
  - 准备旧仓反向移植 checklist：
      - descriptor model
      - VFS
      - runner
      - site activation
      - studio state machine

  ## Test Plan

  - 全程 TDD for everything。
  - Contract tests
      - descriptor schema
      - execution binding
      - public namespace completeness
      - state machine legality
  - Unit tests
      - family provider dispatch
      - ctx.call() permissions
      - recursion blocking
      - version selection / rollback
  - Integration tests
      - BrowserVFS write-through semantics
      - runner host RPC + timeout + abort
      - executable skill invoke path
      - active-tab metadata matching + explicit injection
  - MV3 app tests
      - offscreen host health
      - site hook install path
      - capability trace emission
  - Acceptance tests
      - Agent 生成一个 site skill 后，必须先通过包结构、权限、1 条 action、1 条 verifier，才能进
        入 enabled
      - legacy plugin 包安装必须显式失败并给 migration required

  ## Assumptions

  - 新 sibling repo 名称默认可先定为 browser-brain-loop-next，后续可改名，不影响架构。
  - v0 先不承接完整 UI/商业功能，只承接重构核心。
  - 旧仓在新仓稳定前不跟随同步实现，只保留设计参考。
  - 若 Chrome MV3 动态模块边界出现不可接受限制，优先调整 runner host 技术实现，不回退到旧 LIFO/
    browser_bash 路线。
