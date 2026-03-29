# 去 LIFO 后的 Skill Runtime / Site Capability 重构设计

> 日期：2026-03-29
> 目标：在不依赖 `@lifo-sh/core` 通用 shell 的前提下，保留 Browser Brain Loop 的浏览器侧大脑架构，重建可执行 Skill、`mem://` 文件系统、站点能力包装层，并收敛 `Skill / Plugin / MCP / Site Adapter` 的概念洪水。
>
> 注：本文件写于 Host 仍被去中心化的阶段。当前关于 `AI Surface`、`Execution Host` 一等化、产品自我能力暴露的方向，以 `docs/ai-native-capability-surface-design.md` 和 `docs/locked-decisions-2026-03-29.md` 为准。

---

## 0. 核心目标与主轴

这一版设计的核心不是“找个库替代 LIFO”，而是重新定义 BBL 的能力模型。

我们要解决的顶层问题只有一个：

> 去掉 `LIFO` 之后，如何仍然让 Agent 在浏览器里拥有可执行、可扩展、可分享、可自举的网站能力与运行时能力？

### 0.1 北极星目标

1. 用户侧只理解一个安装单位：`Skill`
2. 内核侧只暴露一个公共能力面：`Capability API`
3. 网站能力默认不依赖 Host，优先建立在浏览器自身能力之上
4. 同一套能力既能给 Agent toolcall 用，也能给 Skill 用，也能对外导出
5. Agent 能在聊天中生成、安装、测试、调用自己新产生的能力包

### 0.2 顶层主张

这份设计的主轴是：

- `Skill`：分发包、知识包、workflow 包、能力绑定包
- `Capability API`：唯一公共能力面，给 Skill / toolcall / MCP 共用
- `Runtime Substrates`：真正执行能力的底层实现，包括 BrowserVFS、Site Runtime、JS Runner、Host Provider
- `MCP`：外部能力的接入与导出通道，不是新的能力类型

换句话说：

- 不再把 `browser_bash` 当成中心
- 不再把 `Plugin` 当成用户主概念
- 不再让 Skill 直接碰私有内核模块
- 所有能力最终都收敛到 `Capability API`

### 0.3 顶层概念定义

#### `Skill`

用户可安装、可分享、可导出的能力包。  
它可以只是 prompt/workflow，也可以带站点运行时绑定。

#### `Capability API`

AI-native 的统一能力抽象层。  
所有上层消费者都只应调用这层，而不是直连内核私有实现。

#### `Runtime Substrate`

能力的真实执行底座。  
包括：

- `BrowserVFS`
- `JS Runner Host`
- `Site Runtime`
- `Host Provider`

#### `Site Skill`

一种特殊的 Skill。  
它不是几段随手注入脚本，而是“建立在 Capability API 之上的站点能力包”。

#### `MCP`

外部能力来源与导出通道。  
它解决的是“能力怎么接入 / 怎么共享”，不是“能力本体怎么设计”。

### 0.4 目标系统图

```text
User / Agent
    │
    ├── 安装 / 调用 / 生成 Skill
    │
    ▼
Skill
    │
    ├── prompt / workflow
    ├── site bindings
    └── mcp bindings
    │
    ▼
Capability API
    │
    ├── 给 LLM toolcall 用
    ├── 给 Skill SDK 用
    └── 给 MCP export 用
    │
    ▼
Runtime Substrates
    ├── BrowserVFS
    ├── JS Runner Host
    ├── Site Runtime
    └── Host Provider (optional)
```

### 0.5 后续评审应反复检查的 6 个问题

1. 这项设计是否让 `Skill` 作为用户概念更清晰，而不是更混乱？
2. 这项设计是否把能力继续收敛到 `Capability API`，而不是再开新平面？
3. 这项设计是否让网站能力继续默认脱离 Host？
4. 这项设计是否让 Agent 更容易自举生成、测试、调用 Skill？
5. 这项设计是否让能力更容易导出到 MCP / 外部工具？
6. 这项设计是否减少了对私有内核实现和临时 page eval 的耦合？

### 0.6 当前仓库内的实现锚点

这份设计不是从零开始。后续实现时，应优先复用当前仓库里已经存在的这些骨架：

| 关注点 | 当前文件 | 作用 |
|--------|----------|------|
| 能力调用基础类型 | `extension/src/sw/kernel/types.ts` | `ExecuteCapability`、`ExecuteStepInput`、`ExecuteStepResult` |
| 内置能力常量 | `extension/src/sw/kernel/loop-shared-types.ts` | `CAPABILITIES` 常量与 runtime loop 公共类型 |
| capability provider 注册/选择 | `extension/src/sw/kernel/tool-provider-registry.ts` | 当前最接近 `CapabilityRegistry` 的骨架 |
| 扩展侧能力注册 API | `extension/src/sw/kernel/extension-api.ts` | `registerCapabilityProvider()`、`registerModeProvider()` 等 |
| toolcall 到执行层的路由 | `extension/src/sw/kernel/loop-tool-dispatch.ts` | 当前 tool -> capability -> provider 的核心入口 |
| Skill 控制器 | `extension/src/sw/kernel/runtime-router/skill-controller.ts` | 现有 Skill 存储/加载/发现逻辑 |
| Plugin 沙箱执行 | `extension/src/sw/kernel/runtime-router/plugin-sandbox.ts` | 当前插件运行入口，后续要迁到 JS Runner |
| 浏览器侧虚拟文件入口 | `extension/src/sw/kernel/virtual-fs.browser.ts` | 当前 `mem://` 调用入口，后续要迁到 BrowserVFS |
| LIFO 兼容层 | `extension/src/sw/kernel/browser-unix-runtime/lifo-adapter.ts` | 待替换对象，可作为迁移清单 |

这些文件的价值在于：

- 它们已经把“tool / capability / provider / runtime router”几层分开了
- 新架构不该推倒重来，而应把这套骨架升级成正式的 `Capability API`

### 0.7 外部参考仓库

后续实现时，建议把以下仓库明确当成参考系写进设计与评审流程。

#### 1. Pi monorepo

- 路径：`~/work/repos/_research/pi-mono/`
- 重点参考：
  - `packages/ai/`
  - `packages/coding-agent/src/core/model-registry.ts`
  - `packages/coding-agent/docs/custom-provider.md`
  - `packages/ai/src/providers/transform-messages.ts`
- 借鉴点：
  - 统一消息模型
  - Provider Adapter + Registry 双层
  - “内部 canonical model，外部多协议投影”的做法
- 在本设计里的对应位置：
  - `CapabilityDescriptor` 作为 canonical model
  - `ToolContract / Skill SDK / MCP export` 作为投影

#### 2. AIPex

- 路径：`~/work/repos/_research/AIPex/`
- 重点参考：
  - `packages/browser-runtime/src/tools/`
  - `packages/browser-runtime/src/automation/`
  - `packages/browser-runtime/src/automation/snapshot-manager.ts`
  - `packages/browser-runtime/src/utils/dom-snapshot.ts`
  - `packages/browser-runtime/src/utils/dom-action.ts`
  - `packages/browser-runtime/src/automation/debugger-manager.ts`
- 借鉴点：
  - A11y-first DOM 快照
  - 语义定位优先
  - 动作后稳定化
  - CDP debugger 生命周期管理
- 在本设计里的对应位置：
  - `page.*` / `site.*` capability
  - Site Runtime 的 action / verifier / stabilization

#### 3. opencli

- 路径：`~/work/repos/_research/opencli/`
- 重点参考：
  - `docs/developer/architecture.md`
  - `docs/guide/browser-bridge.md`
  - `src/browser/mcp.ts`
  - `extension/src/background.ts`
- 借鉴点：
  - Browser Bridge 的薄层设计
  - adapter / command registry / auth strategy 分层
  - “连接层”和“能力层”分离
- 不照搬点：
  - 不采用 CLI-first 产品面
  - 不把 daemon/host 当网站能力前提
- 在本设计里的对应位置：
  - `Capability API` 的 export/import 层
  - Host Provider 与 Browser Runtime 的边界

#### 4. bb-browser

- 路径：`~/work/repos/_research/bb-browser/`
- 重点参考：
  - `README.md`
  - `packages/shared/src/protocol.ts`
  - `packages/cli/src/commands/site.ts`
- 借鉴点：
  - “真实浏览器即 API”
  - site adapter 独立成包
  - 页面登录态、页面内能力、站内接口调用的实用主义模型
- 不照搬点：
  - 不把 `eval` 单文件函数直接当最终产品抽象
  - 不把 CLI 作为主体验入口
- 在本设计里的对应位置：
  - `Site Skill`
  - `site/runner.js`
  - Agent 聊天内自举站点能力包

#### 5. bb-sites

- 路径：`~/work/repos/_research/bb-browser/bb-sites/`
- 重点参考：
  - `README.md`
  - 各站点单文件 adapter，如 `twitter/search.js`
- 借鉴点：
  - 站点能力包应足够小、单点聚焦、可私有覆盖社区版
  - 每个站点动作都应该是明确能力，而不是模糊提示词
- 在本设计里的对应位置：
  - `Site Skill` 的 action 设计
  - 社区 Skill / 私有 Skill 的覆盖策略

### 0.8 后续实现时的参考原则

1. 先看当前仓库骨架，确认是升级还是替换，不要无视现有分层
2. 需要 canonical model 时优先参考 `pi-mono`
3. 需要浏览器自动化与 DOM/CDP 细节时优先参考 `AIPex`
4. 需要桥接层与命令/适配器分层时参考 `opencli`
5. 需要站点包装与登录态复用时参考 `bb-browser` / `bb-sites`

### 0.9 当前运行时现状与本设计的直接衔接点

后续实现时，必须基于当前真实入口，而不是只看抽象图。

#### 当前最接近统一 Capability API 的真实入口

- 入口：`executeStep({ mode?, capability?, action, args?, verifyPolicy? })`
- 相关文件：
  - `extension/src/sw/kernel/types.ts`
  - `extension/src/sw/kernel/orchestrator.browser.ts`

这说明：

- 当前内核已经有一个 capability-first 的调用面
- 新设计不该再发明第二个平行入口，而应让 `Capability API` 直接收敛到这里

#### 当前 provider 选择规则

- 核心文件：`extension/src/sw/kernel/tool-provider-registry.ts`
- 现状：`capability first, mode fallback`
- 已支持：
  - `priority`
  - `canHandle`
  - capability provider / mode provider 双层

这说明：

- `ToolProviderRegistry` 本身就是 `CapabilityRegistry` 的雏形
- 应优先升级它，而不是新造一套 registry

#### 当前最大的北向缺口

- `ToolContract + ToolExecutionSpec` 已存在
- 但大多数 builtin tools 还没有完全声明式地挂到 `execution`
- 主链路仍有相当部分依赖 `loop-tool-dispatch.ts` 的 plan builder 硬编码

这说明：

- 新设计的关键工作之一，不只是删 `LIFO`
- 更是把“硬编码 tool plan”迁到“descriptor -> execution -> capability call”链路上

#### 当前最成熟的样板

- `mcp.call` 是当前最接近目标态的样板
- 相关文件：
  - `extension/src/sw/kernel/mcp-tool-materializer.ts`
  - `extension/src/sw/kernel/tool-provider-registry.ts`

它已经体现了我们想要的方向：

- capability 有稳定 id
- tool 是 capability 的投影
- LLM 看到的是普通 tool
- 内核实际执行的是 capability provider

#### 当前必须保留的正交轴

后续重构时，不能把下面几组轴混成一个：

1. 执行 mode：`script | cdp | bridge`
2. 浏览器路由策略：`browser-first | host-first`
3. 自动化模式：`focus | background`
4. capability policy / verify policy

这意味着：

- `Capability API` 是公共能力面
- 但它下面仍会有多个正交执行维度
- 新设计必须明确哪些是“能力定义”，哪些是“执行策略”

---

## 1. 结论先行

### 1.1 需要砍掉什么

- 不再把浏览器侧运行时定义成“类 Linux / 类 bash / 通用 shell”
- 不再以 `browser_bash` 为核心扩展平面
- 不再让“能否在浏览器里跑 shell”决定 Skill / Plugin / Site 能力的上限

### 1.2 需要保留什么

- `mem://` 虚拟文件系统抽象
- 浏览器侧可执行运行时
- 内部能力的统一公共抽象层
- Skill 生态入口
- 浏览器页面注入、CDP、站点登录态复用能力
- Agent 在聊天中自举生成能力包的路径

### 1.3 需要重新定义什么

- 对用户只保留一个核心概念：`Skill`
- 但 Skill 内部分为四类：`prompt`、`site`、`mcp`、`hybrid`
- 内部能力统一收敛成 `Capability API`，由 Skill / toolcall / MCP 共同消费
- `Plugin` 不再作为主要产品概念对外暴露；其能力收敛为“带运行时绑定的 Skill”
- `MCP` 明确定义为“外部能力来源”，不是 Skill 的替代物，也不是新的产品层级

---

## 2. 问题定义

当前架构的问题不在于“浏览器里不能跑足够多命令”，而在于系统把几个本来应分层的问题混在了一起：

1. `mem://` 文件抽象
2. 浏览器侧代码执行
3. 页面注入与站点能力
4. Skill 的 prompt/workflow 生态
5. Plugin 的运行时扩展
6. MCP 作为外部能力来源

`LIFO` 让这些问题临时共用了一个壳：

- 文件读写走它
- bash 命令走它
- JS 脚本执行借它的 `node` 壳
- Plugin Runner 借它的 CJS 加载
- Skill 脚本也借它执行

这造成三个后果：

- 产品上误以为“浏览器内 shell”是核心能力
- 架构上把文件系统、执行器、站点注入绑死在一起
- 生态上无法清楚回答“新增一个网站能力，到底该做 Skill、Plugin、还是别的”

---

## 3. 设计目标

### 3.1 产品目标

1. 用户面对的主概念收敛为 `Skill`
2. Skill 既能是 prompt/workflow，也能是可执行站点能力包
3. Agent 可以在聊天中直接生成、测试、安装这类 Skill
4. 网站能力默认不依赖 Host
5. Skill 生态仍然可以和外部 `SKILL.md` 风格兼容
6. Agent、Skill、外部工具都看到同一套能力面

### 3.2 架构目标

1. 去掉 `LIFO`
2. 保留 `mem://`，但不再依赖通用 shell
3. 以 `Capability API + JS Runner + BrowserVFS + Site Runtime` 代替 `browser_bash`
4. 页面能力走 `content script + MAIN world hook + CDP + network/session bridge`
5. 保持“脑在浏览器侧，本地只做执行代理”的铁律
6. 不让 Skill 直接绑定内核私有模块，而只依赖受控公共 API

### 3.3 非目标

- 不做浏览器内通用 Linux
- 不做浏览器内通用 Python 发行版
- 不追求让所有带脚本的 Skill 都能跨所有 Agent 产品直接运行
- 不允许 LLM 每轮临时随手写任意页面注入代码并直接执行为默认路径

---

## 4. 新的概念模型

### 4.1 对用户：只有 Skill

产品面只保留一个概念：

- `Skill` = Agent 可安装、可调用、可分享的能力包

用户不需要理解 Plugin 与 Skill 的边界，也不需要理解 site adapter 是不是另一类东西。

### 4.2 对内核：Skill 分四种

| kind | 作用 | 是否可移植 |
|------|------|------------|
| `prompt` | 纯提示词、规则、workflow | 高 |
| `site` | 带页面注入 / CDP / 站点动作的浏览器能力包 | 低 |
| `mcp` | 对外部 MCP server 能力的包装与教学层 | 中 |
| `hybrid` | 同时含 prompt + site/mcp binding | 中 |

### 4.3 对运行时：能力来源分三类

| source | 含义 |
|--------|------|
| `builtin` | 内核内置能力 |
| `skill` | 由已安装 Skill 提供的运行时能力 |
| `mcp` | 外部 MCP server 提供的能力 |

换句话说：

- `Skill` 是分发单位
- `Capability` 是运行时能力
- `MCP` 是外部能力来源

### 4.4 统一公共能力面：Capability API

新的关键方向不是继续发明更多包类型，而是把内核已有能力抽象成一套统一的 `AI-native Capability API`。

它位于：

- 下层：BrowserVFS、Site Runtime、Host Provider、CDP、Runner Host
- 上层：LLM toolcall、Skill SDK、MCP export、Studio 调试面板

也就是说：

- 内核实现细节可以变化
- 但对 AI、Skill、外部工具暴露的能力面保持稳定

### 4.5 这不是凭空发明，而是把现有骨架升级为公共契约

当前代码里其实已经有 Capability API 的雏形：

- `ExecuteCapability`
- `ExecuteStepInput / ExecuteStepResult`
- `CAPABILITIES`
- `ToolProviderRegistry`
- `ExtensionAPI.registerCapabilityProvider()`

今天它们主要是内核路由 plumbing；新架构应把它们升级为：

- 稳定 descriptor
- 稳定调用协议
- 稳定错误码
- 稳定权限模型
- 稳定 trace / verify 语义

### 4.6 不让 Skill 直接碰内核私有实现

Skill 不应直接依赖：

- `chrome.*`
- 内核私有 store / controller
- 私有 runtime router
- 私有 session 数据结构
- “猜测式” page eval

Skill 只依赖：

- `ctx.capabilities.*`
- `ctx.call(capabilityId, input)`
- `ctx.runtime.*` 的只读反射接口

### 4.7 一个最重要的判断规则

如果需求只是“教模型怎么用现有能力”，做 `prompt skill`。  
如果需求需要新增页面注入、站内 API 调用、站点结构化动作、登录态复用，做 `site skill`。  
如果能力已经存在于外部 MCP server，做 `mcp skill` 只是包一层说明和 workflow，不重造轮子。

---

## 5. Skill 包模型

### 5.1 核心原则

- `SKILL.md` 继续保留，作为生态兼容入口
- BBL 专属运行时绑定不要硬塞进 `SKILL.md` 正文
- 采用“可移植层”和“运行时层”分离
- Skill 运行时代码只调用 `Capability API`，不直接 import 内核私有模块

### 5.2 推荐目录结构

```text
mem://skills/<skill-id>/
├── SKILL.md
├── skill.runtime.json          # BBL 专属运行时绑定，可选
├── references/
│   └── ...
├── site/                       # kind=site|hybrid 时可选
│   ├── manifest.json
│   ├── runner.js
│   ├── content.js
│   ├── page.js
│   └── tests.json
├── scripts/                    # 可选，runner 入口或辅助脚本
└── assets/
    └── ...
```

### 5.3 文件职责

#### `SKILL.md`

放跨产品尽量可移植的内容：

- 何时使用
- 解决什么问题
- 用法
- 示例
- workflow
- 注意事项

#### `skill.runtime.json`

放 BBL 专属绑定：

- kind
- 运行时入口
- 权限
- 匹配规则
- 调试设置
- 对外暴露的动作

#### `site/*`

放真正的站点运行时代码：

- 内容脚本
- MAIN world hook
- 站点动作定义
- 验证器
- 测试样例
- 这些代码通过 `ctx.capabilities.*` 访问浏览器能力，而不是直连内核私有实现

### 5.4 `skill.runtime.json` 草案

```json
{
  "schemaVersion": "bbl.skill-runtime.v1",
  "kind": "site",
  "displayName": "twitter-search",
  "entry": {
    "runner": "browser-js",
    "module": "site/runner.js"
  },
  "site": {
    "matches": ["https://x.com/*"],
    "requiresActiveTab": true,
    "worlds": ["content", "main"],
    "permissions": {
      "domRead": true,
      "domWrite": true,
      "networkObserve": true,
      "networkFetchWithPageSession": true,
      "cookies": false,
      "cdp": true
    }
  },
  "actions": [
    {
      "name": "search_posts",
      "description": "Search posts on the current site",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string" },
          "count": { "type": "number" }
        },
        "required": ["query"]
      }
    }
  ],
  "verifiers": [
    {
      "name": "search_results_visible"
    }
  ]
}
```

### 5.5 Skill SDK 形态

建议同时提供两种形态：

#### 形态 A：人类友好的命名空间 API

```ts
ctx.capabilities.memfs.read({ path: "mem://skills/a/SKILL.md" });
ctx.capabilities.page.query({ text: "Compose", role: "button" });
ctx.capabilities.page.click({ uid: "u_12" });
ctx.capabilities.site.fetchWithSession({ url: "/api/me" });
ctx.capabilities.runner.invoke({ modulePath: "mem://skills/a/scripts/x.js" });
```

#### 形态 B：统一线协议

```ts
ctx.call("page.click", { uid: "u_12" });
ctx.call("site.fetch_with_session", { url: "/api/me" });
ctx.call("memfs.read", { path: "mem://skills/a/SKILL.md" });
```

前者适合 Skill 作者与 Agent 生成代码；后者适合：

- toolcall materialization
- MCP export
- 诊断与 trace
- 能力权限校验

### 5.6 Capability Descriptor 草案

`ToolContract` 不应再是唯一真相源。  
更合理的是让 `CapabilityDescriptor` 成为源头，再投影出 tool / SDK / MCP。

```ts
interface CapabilityDescriptor {
  id: string;                     // e.g. page.click
  version: string;                // e.g. 1
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  risk: "low" | "medium" | "high";
  sideEffects: boolean;
  permissions: string[];
  supportsVerify: boolean;
  supportsStreaming?: boolean;
  source: "builtin" | "skill" | "mcp";
}
```

### 5.7 反射与自举能力

如果 Agent 知道自己的能力和运行核心机制，它确实可以“调用自己”，但必须经过 Capability 边界，而不是直接递归打穿内核。

建议显式支持三类反射接口：

- `ctx.runtime.listCapabilities()`
- `ctx.runtime.getCapability(id)`
- `ctx.skills.invoke(skillId, action, args)`

这能支持：

1. Agent 生成一个 Site Skill 后，立即调用它自己的 action 做自测
2. 一个编排型 Skill 调用其他 Skill 的动作
3. Studio 做能力浏览、能力引用、导出为 MCP

但必须加护栏：

- 最大递归深度
- 循环调用检测
- 子调用 session / trace 隔离
- 权限不自动继承提升
- 对高风险 capability 强制显式确认

### 5.8 Capability 的三种投影规则

`CapabilityDescriptor` 作为 canonical model 之后，需要明确它如何被投影到不同消费面。

#### 投影 A：LLM toolcall

- 目标：给模型稳定、清晰、可选择的工具定义
- 形式：`ToolContract`
- 规则：
  - 不把所有 capability 一次性全暴露给 LLM
  - 只暴露用户可理解、任务语义清晰的那部分
  - 高风险 capability 默认不直出，需经 Skill / policy / confirm 包装

#### 投影 B：Skill SDK

- 目标：给 Skill 作者和 Agent 生成代码时使用
- 形式：`ctx.capabilities.*` / `ctx.call(...)`
- 规则：
  - 比 toolcall 更细粒度
  - 但仍然必须 schema 化、可追踪
  - 不允许绕过 capability registry 直接碰私有内核模块

#### 投影 C：MCP export

- 目标：把 BBL 内部能力暴露给外部 agent 产品
- 形式：动态 materialized MCP tools
- 规则：
  - 只导出稳定 capability
  - 导出前要做 schema 裁剪和风险分级
  - 不把浏览器内部私有对象和实现细节直接暴露出去

### 5.9 粗粒度 routing capability 与细粒度 public capability 的关系

当前运行时的 capability 常量比较粗：

- `process.exec`
- `fs.read`
- `fs.write`
- `fs.edit`
- `mcp.call`
- `browser.snapshot`
- `browser.action`

它们适合：

- provider 路由
- verify policy
- 执行层 fallback

但它们不够适合直接成为对 Skill / MCP / Studio 暴露的最终 public API。

因此建议做双层：

#### Internal Routing Capability

保留现有粗粒度能力，服务于执行层路由。

例如：

- `browser.action`
- `browser.snapshot`
- `fs.read`

#### Public Capability Namespace

新增更细粒度、AI-native 的公共命名空间，服务于 Skill SDK / MCP export / Studio。

例如：

- `page.click`
- `page.fill`
- `page.wait_for`
- `site.fetch_with_session`
- `memfs.read`
- `memfs.write`

这两层的关系应是：

```text
Public Capability
    │
    ▼
Execution Binding
    │
    ▼
Internal Routing Capability
```

例子：

- `page.click` / `page.fill` / `page.press`
  - 都可以先绑定到内部 `browser.action`
- `page.snapshot`
  - 可以绑定到内部 `browser.snapshot`
- `memfs.read`
  - 可以绑定到内部 `fs.read`

这样可以：

- 不推翻现有 provider 路由层
- 又让对外能力面足够清晰

### 5.10 初始 public capability namespace 建议

建议第一版就定出一个小而稳的 namespace，而不是无限生长。

| namespace | 初始能力 |
|-----------|----------|
| `memfs.*` | `read`, `write`, `edit`, `stat`, `list`, `mkdir`, `rm`, `mv` |
| `page.*` | `snapshot`, `query`, `click`, `fill`, `select`, `press`, `scroll`, `wait_for`, `extract` |
| `site.*` | `ensure_hook`, `eval`, `fetch_with_session`, `observe_network` |
| `tabs.*` | `list`, `get_current`, `create`, `close`, `activate` |
| `runner.*` | `invoke`, `cancel`, `describe` |
| `skills.*` | `list`, `describe`, `invoke`, `install`, `export` |
| `runtime.*` | `list_capabilities`, `get_capability`, `get_context` |
| `host.*` | `read`, `write`, `edit`, `exec` |

后续新增能力时，优先加到这些 namespace 下，不再随意平铺新顶级概念。

---

## 6. 去 LIFO 后的四层基座 + 一层公共能力面

## 6.1 Layer A: BrowserVFS

这是 `mem://` 的新宿主，不再依赖 `LIFO Sandbox.fs`。

### 目标

- 继续提供 `mem://` 抽象
- 支持 session/global/ephemeral namespace
- 保持现有 Skill/Plugin 存储路径习惯
- 提供稳定文件接口，不依赖 shell

### 必备能力

- `read`
- `write`
- `edit`
- `stat`
- `list`
- `mkdir`
- `rm`
- `mv`
- `copy`
- `staging`
- `snapshot`
- `rehydrate`

### 数据模型

```text
mem://
├── <session-default>
├── skills/
├── builtin-skills/
├── plugins/          # 迁移期可保留，最终并入 skills runtime artifacts
└── __bbl/
```

### 存储实现建议

- 底层：IndexedDB
- 上层：`BrowserVfsStore`
- 再上层：`BrowserVfsSessionManager`
- 不再暴露“shell 路径语义”，只暴露文件语义

---

## 6.2 Layer B: JS Runner Host

这是替代 `browser_bash + node runner.cjs` 的核心。

### 本质

不是“浏览器有没有 JS 引擎”，而是“内核有没有受控执行协议”。

### Runner 必须解决的问题

- 如何传入参数
- 如何设置 session / cwd
- 如何访问 `mem://`
- 如何限制 timeout
- 如何取消执行
- 如何上报 stdout/stderr
- 如何返回结构化 result
- 如何记录 trace
- 如何把 `Capability API` 注入给执行模块

### Runner Protocol 草案

```ts
interface RunnerInvokeInput {
  sessionId: string;
  modulePath: string;
  exportName?: string;
  args?: unknown;
  cwd?: string;
  timeoutMs?: number;
  permissions?: string[];
}

interface RunnerInvokeResult {
  ok: boolean;
  exitCode: number;
  result?: unknown;
  stdout: string;
  stderr: string;
  fsDiff: Array<{
    op: "add" | "modify" | "delete";
    path: string;
    content?: string;
  }>;
  trace: Array<Record<string, unknown>>;
}
```

### Runner 模块入口建议

```ts
type SkillRunnerModule = (ctx: {
  sessionId: string;
  cwd: string;
  capabilities: Record<string, unknown>;
  call(capabilityId: string, input: unknown): Promise<unknown>;
  runtime: {
    listCapabilities(): Promise<CapabilityDescriptor[]>;
  };
}, args: unknown) => Promise<unknown>;
```

### 宿主位置

建议继续使用 `sandbox page` 作为 Runner Host：

- 与 MV3 CSP 边界更清晰
- 可允许受控动态执行
- 不污染 Service Worker 主上下文

### 明确不做什么

- 不做通用 bash
- 不做 60+ Linux 命令
- 不做 Python 兼容层

Runner 只做一件事：执行受控 JS 模块。

---

## 6.3 Layer C: Site Runtime

这是新的“Agent 时代油猴增强层”。

### 命名建议

对外可以叫：

- `Site Skill`
- 或 `Site Runtime Binding`

不要再叫“油猴”，因为目标不只是注入脚本，还包括：

- 页面动作
- 结构化抽取
- 站点内 API 调用
- 网络观察
- 登录态复用
- 调试与验证

### 组成

1. `content script`
2. `MAIN world hook`
3. `CDP action bridge`
4. `network observe/intercept`
5. `page-session fetch`
6. `action verifier`

### 为什么不是纯 prompt

因为站点能力要保证：

- 复用
- 可测
- 可验证
- 有权限边界
- 不靠模型临场写临时代码

### Site Runtime 基础原语

建议内核提供固定原语，并通过 `Capability API` 暴露，而不是让 Skill 直接随意调用任意 JS：

- `snapshot_dom`
- `query_elements`
- `eval_in_page`
- `call_main_world_hook`
- `fetch_with_page_session`
- `observe_network`
- `click`
- `fill`
- `select`
- `press`
- `scroll`
- `wait_for`
- `extract_structured_data`
- `verify_action`

### Site Skill 的职责

Site Skill 不应直接成为“任意 JS 注入包”，而应负责：

- 声明匹配域名
- 安装需要的页面 hook
- 暴露站点动作
- 暴露验证器
- 将 `Capability API` 原语编排成稳定能力

### 一个 `site/runner.js` 的目标形态

```js
module.exports = {
  match(context) {
    return /https:\/\/x\.com\//.test(context.url);
  },

  async install(ctx) {
    await ctx.capabilities.site.ensureMainWorldHook({
      modulePath: "site/page.js"
    });
    return { ok: true };
  },

  actions: {
    async search_posts(ctx, args) {
      return await ctx.capabilities.site.fetchWithSession({
        url: "/i/api/graphql/...",
        method: "GET",
        query: { q: args.query }
      });
    }
  },

  verifiers: {
    async search_results_visible(ctx) {
      return await ctx.capabilities.page.waitFor({
        text: "Latest",
        timeoutMs: 3000
      });
    }
  }
};
```

---

## 6.4 Layer D: Host Provider

Host 不再是网站能力的默认依赖，只保留为可选层。

### Host 适用范围

- 本地 CLI
- Python
- Node 原生文件系统
- Electron / 桌面 App
- git / ffmpeg / yt-dlp / osascript

### Host 不适用的范围

- 页面 DOM 能力
- 登录态页面注入
- 站点包装

### 结论

网站能力默认不依赖 Host。  
只要目标是“真实浏览器里的站点能力”，优先走 Site Runtime。

---

## 6.5 Layer E: Capability API Facade

这是新架构最关键的一层，也是这次重构真正应收敛出的“AI-native API”。

### 目标

- 对 Skill、toolcall、MCP export 暴露同一套公共能力面
- 让内核内部实现可以继续演进，而上层调用保持稳定
- 让站点能力、文件能力、浏览器动作、Host 能力都能放进同一套模型

### 三种主要消费者

1. `LLM toolcall`
2. `Skill SDK`
3. `MCP export / 外部工具调用`

### 一个建议的命名空间

- `memfs.*`
- `page.*`
- `site.*`
- `tabs.*`
- `network.*`
- `runner.*`
- `host.*`
- `skills.*`
- `runtime.*`

### 一个建议的调用流

```text
LLM toolcall / Skill / MCP
          │
          ▼
    Capability API
          │
          ├── BrowserVFS
          ├── Site Runtime
          ├── JS Runner Host
          └── Host Provider
```

### 对现有内核的改造口径

- `ToolContract`：从“源头模型”降级为 `CapabilityDescriptor -> tool definition` 的投影层
- `ToolProviderRegistry`：升级为 capability provider registry 的正式实现
- `ExecuteStepInput / Result`：升级为 capability call wire format 的基础类型
- `registerCapabilityProvider()`：升级为扩展系统接入公共能力面的正式入口

### 为什么这层比“再加一个 Plugin 概念”更重要

因为用户真正需要的不是更多包名，而是：

- 一套能力面
- 一套权限面
- 一套可观测面
- 一套导出面

`Capability API` 解决的是“能力怎么被消费”；  
`Skill` 解决的是“能力怎么被打包、分发、学习、复用”。

---

## 7. 为什么不再单独强调 Plugin

### 7.1 用户心智问题

现在最大的产品问题不是能力不够，而是概念太多：

- Skill
- Plugin
- Site Adapter
- MCP
- Tool
- Provider

用户无法判断“新增一个网站能力，到底该做哪个”。

### 7.2 新口径

产品面统一成：

- 一切安装包都叫 `Skill`

内部再区分：

- prompt skill
- site skill
- mcp skill
- hybrid skill

### 7.3 Plugin 的去向

原有 Plugin 能力并没有消失，而是被吸收到“可执行 Skill”中：

- hook
- runtime message
- capability provider
- mode/provider 扩展
- UI extension

对于高级开发者，可以在文档中继续保留“plugin API”这个技术术语；但产品面不必再单独教育一套概念。

---

## 8. Skill、MCP、Site Runtime 的关系

### 8.1 Skill 不是能力来源的唯一宿主

Skill 更像：

- 分发包
- 说明书
- workflow 包装层
- 对 `Capability API` 的绑定与编排层

真正的能力来源可能是：

- 内置浏览器工具
- Site Runtime
- 外部 MCP server

### 8.2 MCP 在新架构里的位置

MCP 是外部能力来源，不是 Skill 的替代。

典型关系：

- `mcp skill`：告诉 Agent 如何组合使用某个 MCP server 的工具
- `site skill`：通过 `Capability API` 提供浏览器内站点能力
- `hybrid skill`：一部分走 site runtime，一部分走 MCP

### 8.3 生态兼容策略

#### 向外导出 Skill

- 最低保真：导出 `SKILL.md`
- 高保真：导出 `SKILL.md + skill.runtime.json + site/*`

#### 给别家 Agent 用

- 如果别家只支持 prompt skill：只吃 `SKILL.md`
- 如果别家支持 MCP：把能力通过 MCP 暴露出去，再让别家通过 MCP 调
- 不要求别家原生理解 BBL 的 site runtime

结论：

Skill 的可移植性来自 `SKILL.md`。  
能力的可移植性来自 `MCP`。  
不要试图让“带页面注入的 Skill”天然跨所有产品可执行。

---

## 9. Agent 自举生成 Site Skill 的工作流

这是新架构必须支持的关键能力。

### 9.1 目标工作流

用户在聊天里说：

> 帮我把这个网站包装成一个 Skill

Agent 应该能：

1. 观察当前站点
2. 分析页面结构、网络请求、登录态
3. 生成 Skill 草稿
4. 安装到 `mem://skills/<id>/`
5. 运行测试动作
6. 给出权限确认
7. 安装启用
8. 通过同一套 `Capability API` 自测并回归

### 9.2 需要的内置工具

- `inspect_site_surface`
- `record_network_for_site`
- `draft_site_skill`
- `install_skill`
- `invoke_skill_action`
- `test_skill`
- `export_skill`
- `list_capabilities`
- `inspect_capability`

### 9.3 为什么不能只靠 prompt

只靠 prompt 描述“怎么注入、怎么调 CDP”会导致：

- 没有版本化
- 没有权限审计
- 没有可复现测试
- 没有稳定入口
- 每轮都要重新推理一遍实现细节

Agent 可以聊天中生成 Skill，但生成结果必须固化成 Skill 包，而不是停留在对话里的临时策略。

更重要的是：

- 生成的 Skill 要面向 `Capability API`
- 而不是面向某次对话里临时猜出来的私有注入细节

---

## 10. Studio 重构建议

### 10.1 从 `Plugin Studio + Skills` 变成 `Skill Studio`

界面只暴露一套入口：

- Catalog
- Runtime
- Capabilities
- Permissions
- Test
- Export

### 10.2 Skill Studio 的三种模板

1. `Prompt Skill`
2. `Site Skill`
3. `MCP Skill`

### 10.3 `Site Skill` 的编辑面

最少应包含：

- 域名匹配
- 权限声明
- 能力浏览器（当前 Skill 实际可调用哪些 capability）
- `SKILL.md`
- `skill.runtime.json`
- 页面脚本编辑器
- 动作列表
- 测试动作面板
- trace / log / network / verifier 结果

### 10.4 主路径

主路径应是：

- 聊天中生成
- 在 Skill Studio 中调试
- 一键安装 / 导出

本地手工导入应保留，但只作为辅助路径。

### 10.5 Skill 生命周期

如果不定义生命周期，后面实现 Studio、权限确认、回滚时会很乱。

建议统一成：

1. `draft`
2. `staged`
3. `installed`
4. `enabled`
5. `trusted`
6. `disabled`
7. `archived`

#### 含义

- `draft`：Agent 或用户正在生成，还没进入可执行区
- `staged`：结构与 schema 已通过校验，但还没启用
- `installed`：文件已写入 `mem://skills/...`
- `enabled`：可以被 Agent 调用
- `trusted`：用户已明确确认高风险权限
- `disabled`：保留安装但不可执行
- `archived`：历史版本或回滚快照

#### 为什么需要这个状态机

- 便于 Agent 生成后先测试再启用
- 便于高风险 `site skill` 先确认权限
- 便于失败时快速回滚到上一版

### 10.6 版本、升级与回滚

`Site Skill` 的一个现实问题是：网站会变。

因此设计里应显式支持：

- `version`
- `previousVersion`
- `upgradeNotes`
- `rollbackTo`
- `compatibilityStatus`

建议：

- 每次 Agent 自动修复站点 Skill 时都生成新版本
- 默认保留最近 3 到 5 个版本
- 验证失败时允许一键回滚到上一个 `trusted` 版本

---

## 11. 安全与权限模型

### 11.1 Skill 安装不是纯文本导入

对于 `site skill`，安装前必须明确展示：

- 匹配站点
- 需要的页面世界
- 是否能改 DOM
- 是否能观察网络
- 是否能发起带会话请求
- 是否需要 CDP

### 11.2 运行边界

默认不允许：

- 未安装 Skill 的任意页面注入
- LLM 任意生成 JS 并直接对当前站点执行
- 未声明域名匹配时跨站点运行

### 11.3 调试与审计

每次 `site skill` 执行都应记录：

- skillId
- action
- tabId / url
- permission set
- capability calls
- stdout / stderr
- result summary
- network usage summary
- verifier result
- self-call depth

### 11.4 错误码与 trace contract

如果 `Capability API` 要成为公共能力面，就必须把错误与 trace 一起标准化。

建议每次 capability 调用统一返回：

- `errorCode`
- `retryable`
- `permissionDenied`
- `timeoutHit`
- `verifyFailed`
- `traceId`

建议至少统一这些错误类：

- `E_CAPABILITY_NOT_FOUND`
- `E_PERMISSION_DENIED`
- `E_TIMEOUT`
- `E_VERIFY_FAILED`
- `E_BAD_INPUT`
- `E_RUNTIME`
- `E_REENTRANCY_BLOCKED`

trace 至少应包含：

- `capabilityId`
- `inputSummary`
- `providerId`
- `modeUsed`
- `durationMs`
- `resultSummary`
- `errorCode`

---

## 12. 注入脚本与构建约束

本项目已有铁律必须继续保留：

- 所有注入到网页执行环境的脚本必须单文件自包含
- 最终产物禁止顶层 `import` / `export`
- 不能依赖共享 chunk 或运行时模块加载器

因此新架构必须明确区分两类代码：

### 12.1 Runner 模块

- 运行在 sandbox page / runner host
- 可以使用受控模块加载

### 12.2 页面注入模块

- 运行在页面 `content` / `MAIN world`
- 最终产物必须是单文件 bundle

Site Skill 的构建器必须显式产出这两类工件，不能混用。

---

## 13. 与 `bb-browser` / `opencli` 的取舍对比

### 13.1 借鉴什么

#### 来自 `bb-browser`

- 站点能力应该单独成包
- 站点能力应该直接建立在真实浏览器登录态上
- adapter 应该尽量小而专注
- 页面能力应尽量用稳定动作包装，而不是让上层一直碰底层实现

#### 来自 `opencli`

- 命令元数据和认证策略要明确
- 能力层和 transport 层要分开
- 浏览器桥接层应是薄层
- 对外暴露时应有统一 schema，而不是每层各说各话

### 13.2 不照搬什么

- 不照搬它们的 CLI-first 产品面
- 不照搬 daemon/host 作为网站能力前提
- 不照搬“站点能力 = 任意 eval”这个粗粒度模型

BBL 更适合的是：

- Browser-native
- Skill-first
- Site Runtime-backed

---

## 14. 迁移计划

### 14.0 旧概念 -> 新概念映射

| 旧对象 | 新对象 | 说明 |
|--------|--------|------|
| `browser_bash` | `runner.invoke` / `host.exec` / `Skill action` | 不再保留通用 shell 入口；按真实能力拆开 |
| `lifo-adapter.ts` | `BrowserVFS + JS Runner Host` | 文件层与执行层分离 |
| `browser_read/write/edit_file` | `memfs.*` public capability | 文件能力继续保留，但走新 VFS |
| `execute_skill_script` | `skills.invoke` / `runner.invoke` | 从“跑脚本文件”升级成“调用 Skill 或 runner 模块” |
| `plugin.json + index.js` | `skill.runtime.json + site/*/scripts/*` | 对用户面不再强调 Plugin，内部能力并入可执行 Skill |
| `mem://plugins/...` | `mem://skills/<id>/...` | 插件包逐步迁到 Skill 包空间；迁移期可兼容 |
| `ToolContract.execution` | `CapabilityDescriptor -> ToolContract` 投影 | Tool 定义不再是源头模型 |
| `mcp__*` 动态工具 | `Capability -> MCP export` | MCP 保持为导出/接入协议，而不是另一套能力模型 |

这张表的意义是：

- 实现时知道“删什么、留什么、迁什么”
- review 时能快速判断某项改动是不是还停留在旧心智里

## Phase 0: 明确边界

- 标记 `browser_bash` 为待删除
- 明确 `LIFO` 只剩兼容债务，不再扩能力
- 冻结任何基于通用 shell 的新特性

## Phase 1: BrowserVFS 替换

交付物：

- `BrowserVfsStore`
- `BrowserVfsSessionManager`
- `read/write/edit/stat/list/mkdir/rm/mv`
- `mem://` namespace 持久化

验收标准：

- Skill / 插件包读写不再依赖 `LIFO`
- storage reset / backup / restore 走新 VFS

## Phase 2: Runner Protocol + Capability API

交付物：

- `RunnerHost`
- `Runner Protocol`
- `invoke_js_runner`
- `CapabilityDescriptor`
- `CapabilityRegistry`
- `ctx.capabilities.*` SDK
- `Capability -> ToolContract` 投影
- timeout / cancel / trace / fsDiff

验收标准：

- `execute_skill_script(browser)` 不再借 `browser_bash`
- plugin runner 不再借 `node runner.cjs` + `LIFO`
- Skill / toolcall / MCP export 能看到同一套能力定义

## Phase 3: Site Runtime

交付物：

- `content/main/CDP/network` 四平面桥接
- `SiteContext` API
- `Site Skill` manifest
- `invoke_skill_action`
- `Site Runtime -> Capability API` provider 映射

验收标准：

- 至少 2 到 3 个真实站点能力跑通
- 能复用登录态完成结构化动作
- Agent 可生成 Site Skill 并立刻自测

## Phase 4: Skill Studio 合并

交付物：

- `Skill Studio`
- Prompt / Site / MCP 三模板
- 权限确认 UI
- 调试与测试面板

验收标准：

- 用户能在聊天中让 Agent 生成 Skill，并在 Studio 内完成调试与安装

## Phase 5: 生态与导出

交付物：

- `SKILL.md` 导出
- `skill.runtime.json` 导出
- Site Skill 打包
- `Capability -> MCP` 暴露策略

验收标准：

- prompt 层可导出给其他 Agent 产品
- 能力层可通过 MCP 暴露给其他 Agent 产品
- 内部能力与外部导出不再维护两套 schema

## Phase 5.5: 测试与发布门禁

交付物：

- capability schema 校验
- Skill package schema 校验
- Site Skill fixture tests
- live site smoke tests
- version rollback gate

验收标准：

- Agent 生成的 Skill 在进入 `enabled` 前至少过一条自动测试
- 高风险站点 Skill 升级失败时可自动回滚

## Phase 6: 删除 LIFO

交付物：

- 删除 `@lifo-sh/core`
- 删除 `browser-unix-runtime/lifo-adapter.ts`
- 删除 `browser_bash`
- 清理文档与测试

验收标准：

- 现有核心 Skill / Plugin / Site 能力均已迁移
- 构建和测试中不再出现 `LIFO` 依赖

---

## 15. 测试策略补充

这部分建议作为后续实现的强制门禁，而不是“有空再补”。

### 15.1 四层测试

1. `Schema tests`
2. `Provider / Capability unit tests`
3. `Runner / Site Runtime integration tests`
4. `Live site smoke tests`

### 15.2 Agent 生成 Skill 的最低门槛

Agent 在聊天中生成一个 `site skill` 后，至少应完成：

1. 包结构校验
2. 权限声明校验
3. 一条 action happy-path 测试
4. 一条 verifier 测试
5. 安装前用户确认

### 15.3 BDD 对齐

既然本项目已有 BDD 门禁，新的能力层必须纳入：

- Capability descriptor -> tool projection
- Skill invoke -> capability call 链路
- Site Skill 生成 -> 安装 -> 测试 -> 启用链路
- 回滚链路

否则这份设计会停留在概念层，无法稳定演进

---

## 16. 最终产品口径

对外可以统一这样描述：

> Browser Brain Loop 的能力分为两层：  
> `Skill` 负责知识、workflow 和安装包；  
> `Capability API` 负责统一能力面；  
> `Runtime` 负责真实执行。  
> 其中网站能力由 `Site Skill` 提供，建立在真实浏览器登录态、页面注入、CDP 与结构化动作之上；外部工具生态则通过 `MCP` 接入。

这套口径有三个优点：

1. 用户只需要理解一个安装单位：`Skill`
2. 内核不再被“浏览器内 shell”绑架
3. 站点能力、自定义扩展、外部工具生态终于能放进同一张图里

---

## 17. 推荐的最终决策

1. 去掉 `LIFO`，不再补通用 shell
2. 保留 `mem://`，改由 `BrowserVFS` 承载
3. 把内核能力收敛成统一 `Capability API`
4. 用 `JS Runner` 替代 `browser_bash` 作为浏览器侧可执行平面
5. 把站点能力统一定义为 `Site Skill`
6. 产品面只保留 `Skill`，不再强调独立 Plugin 概念
7. `SKILL.md` 继续保留，作为生态兼容层
8. 能力跨产品共享优先走 `MCP`，而不是要求 site runtime 跨产品直接可执行
9. 允许 Agent 基于 `Capability API` 反射、自测、调用已安装 Skill，但必须有递归与权限护栏
