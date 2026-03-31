# AI-Native Capability Surface Design

## 0. 核心目标

这份报告只解决一个问题：

> 我们要如何把 Browser Brain Loop 自己做成 AI-native 产品，让 Agent 不只是会操作网页，还能理解、检查、配置、扩展、调试、管理这个产品本身。

这里的重点不是“再发明更多 tool”。

重点是：

1. 把产品自己的能力面暴露给 AI
2. 让这些能力既能给聊天 Agent 用，也能给 Skill 用，也能给 UI 用，也能给外部系统用
3. 不把产品能力误等同于一堆细碎工具调用
4. 不要过度设计，优先少量强原语 + 足够上下文

## 1. 结论先行

### 1.1 我们真正要暴露的不是“工具列表”，而是“AI Surface”

对这次重构，最重要的判断是：

- `capability` 不等于 `tool call`
- `tool call` 只是 AI Surface 的一种动作投影
- 一个 AI-native 产品至少要同时暴露：
  - `Resources`：让 AI 知道当前产品是什么状态
  - `Actions`：让 AI 改变产品状态
  - `Workflows / Skills`：让 AI 复用更高层流程
  - `Events / Audit`：让 AI 追踪变化和回放执行

如果我们只暴露动作，不暴露状态：

- AI 会知道“能做什么”，但不知道“当前是什么”
- 每次都得靠 UI 文本、提示词或临场猜测建立自我认知
- 配置、权限、连接、调试这些产品能力就无法形成稳定闭环

### 1.2 Browser Brain Loop 的新主轴

这次产品层的主轴应该是：

- 浏览器仍然是控制中枢
- `Host` 升级为一等执行面
- `Skill` 仍然是唯一用户级扩展单位
- `Capability API` 不再只是“工具调用清单”，而是产品的统一 AI Surface

更准确地说：

- 浏览器负责对话、页面语义、登录态、active tab、用户交互、权限确认
- Host 负责通用计算、文件系统、命令执行、已有本机工具链、远程机器、SSH/tunnel
- Skill 负责任务知识、工作流组织、如何把这些能力组合起来

## 2. 这件事为什么重要

如果产品自身不是 AI-native 的，Agent 对产品的理解只能来自：

1. prompt 里的零散说明
2. UI 上看得到的文案
3. 开发者手写的“如何修改配置”的经验性规则

这会带来 4 个问题：

1. Agent 不知道当前真实配置、权限、连接状态、已安装能力
2. Agent 很难稳定地“操作自己”
3. UI、内部实现、Skill、外部接入会长出四套不一致接口
4. 每加一个功能，就要再补一层提示词记忆，而不是补一层产品能力

如果产品自身是 AI-native 的：

1. Agent 能直接读取产品状态
2. Agent 能直接调用产品动作
3. UI 可以复用同一套控制面
4. Skill 不需要知道一堆私有实现细节
5. 外部系统也能通过 MCP 或别的投影接入

## 3. 基本判断

### 3.1 `Capability` 不是“页面按钮 API”

不是每个功能点都要变成一个 capability。

我们真正应该暴露的是“有独立产品语义的能力”，而不是 UI 细节。

例子：

- “更新默认模型配置”是产品能力
- “打开设置页第 3 个 tab 再点保存”不是产品能力

换句话说：

- capability 应该表达业务语义
- UI 只是 capability 的一个消费者

### 3.2 `Capability` 也不等于 `tool call`

一个 capability 可能投影为：

- tool
- resource
- event stream
- MCP export
- SDK method
- UI action

所以架构上应该这样理解：

- `Capability` 是统一语义面
- `ToolContract` 是其中一种 northbound projection

### 3.3 Host 不该再被去中心化

之前的假设更接近：

- 浏览器内部可以自己补出足够强的 Linux-like sandbox

现在的判断已经变了：

- 真正强大的 Agent，必须能用到本机和远程计算环境
- 浏览器如果能调动本机已有 skills、工具、agent、服务，产品上限会陡增

所以新的架构判断应是：

- `Host` 是一等执行面
- 但 `Host` 不取代浏览器控制中枢
- 浏览器负责 control plane
- Host 负责 execution plane

### 3.4 少量强原语，优先于复杂 capability taxonomy

这里最重要的产品判断是：

- 不要因为“AI-native”就把系统拆成更多概念和更多接口
- 如果 LLM 拿到足够上下文，少量原语就能做非常多事情

所以 v1 应优先坚持：

1. 少量强动作
2. 高信号状态摘要
3. Skill 负责 workflow 语义

而不是：

1. 大量细碎 capability
2. 一堆彼此重叠的 schema 类型
3. 为了形式化而形式化

## 4. 业界模式对我们的启发

主流做法的共识很接近：

1. `tools` 用来做动作
2. `resources` 用来暴露状态和上下文
3. `prompts / workflows` 用来承载高层复用流程
4. 强调组合性，而不是把系统切成无数极细碎的专用动作

对我们最有价值的不是照搬某个协议，而是吸收这几个判断：

1. 不要把“状态读取”硬塞成动作调用
2. 不要把“工作流知识”硬塞成 capability schema
3. 不要让 AI 只能通过 UI 文案来理解产品
4. 不要把所有内部接口都直接投影成 LLM tools

## 5. 我们的统一模型

## 5.1 顶层模型

```text
Agent / UI / External Client
            │
            ▼
      AI Surface Layer
   ├── Resources
   ├── Actions
   ├── Events / Audit
   └── Skills / Workflows
            │
            ▼
      Control Plane Router
   ├── Product State
   ├── Browser Runtime
   ├── Execution Host Manager
   └── Policy / Confirm / Audit
            │
            ▼
      Execution Substrates
   ├── Browser-local
   │   ├── page.*
   │   ├── tabs.*
   │   ├── site.*
   │   └── memfs.*
   └── Execution Host
       ├── host.read
       ├── host.write
       ├── host.edit
       └── host.exec
```

### 5.2 统一术语

为了避免继续混淆，建议以后严格区分：

- `AI Surface`
  - 产品对 AI 暴露的完整能力面
- `Action Capability`
  - 可调用动作，能投影成 tool
- `Resource`
  - 可读取状态，不应被误建模成 mutation action
- `Skill`
  - 高层 workflow/package
- `Execution Host`
  - 本地或远程机器执行面
- `Offscreen Host`
  - MV3 内的 offscreen runner 容器

这两个 host 必须分开叫。

否则文档里“host”一词会持续打架。

## 6. AI Surface 的组成部分

### 6.1 Resources

Resources 解决的是：


推荐优先暴露的 resource 面：

1. `runtime summary`
   - 当前 session
   - active tab
   - loop state
   - trusted 状态
   - 最近变更
用于最小 operability 闭环；它不等于完整 observability 系统（event stream、长时序指标、全量审计回放等由后续 issue 扩展）。
   - 可用 execution hosts
   - local / remote
   - 连接状态
   - 健康状态
   - 当前默认 host
5. `capability summary`
   - 当前可用 action capabilities
   - 风险等级
   - 哪些默认投影给聊天 Agent
6. `audit tail`
   - 最近动作
   - 最近配置变更
   - 最近失败

核心原则：

- resource 默认是读
- resource 可以被缓存、注入、摘要
- resource 不要求每次都走 tool call

### 6.2 Actions

Actions 解决的是：

- AI 如何改变产品状态
- AI 如何执行外部操作
- AI 如何安装、配置、连接、诊断

Actions 分 3 层：

#### A. 产品控制面动作

这些是“操作产品自己”的动作：

- `config.update`
- `skills.install`
- `skills.enable`
- `skills.disable`
- `skills.uninstall`
- `hosts.connect`
- `hosts.disconnect`
- `hosts.set_default`
- `runtime.capture_diagnostics`
- `runtime.clear_error`

说明：`runtime.capture_diagnostics` 在 v1/Level 1 只定义为 **read-only diagnostics snapshot** 入口，
用于最小 operability 闭环；它不等于完整 observability 系统（event stream、长时序指标、全量审计回放等由后续 issue 扩展）。

#### B. 浏览器专业动作

这些是浏览器原生专业动作：

- `page.query`
- `page.click`
- `page.fill`
- `tabs.list`
- `site.fetch_with_session`

这些动作有自己的验证语义、页面状态依赖、权限边界。

它们不应该退化成“浏览器里执行 bash”。

#### C. Host 原语动作

Host 这里反而应保持极简。

默认只把最强、最通用的原语做成一等动作：

1. `host.read`
2. `host.write`
3. `host.edit`
4. `host.exec`

可选补充：

- `host.stat`
- `host.list`

但不要按产品功能继续往下细碎化成一堆 `host.xxx`。

如果一个能力可以稳定地由：

- `read`
- `write/edit`
- `exec`

组合出来，那它更适合作为：

- Skill
- workflow
- higher-level product action

而不是新的底层 host capability。

### 6.3 Skills / Workflows

Skill 继续承担高层语义。

Skill 不是 capability 的竞争者，而是 capability 的组织者。

Skill 最适合承载：

- 多步操作
- 领域知识
- 站点知识
- 失败恢复策略
- 组合 browser + host + product actions 的流程

关键判断：

- 不要把 Skill 重新压扁成 schema-only 插件
- `SKILL.md` 仍然可以保留大量自然语言表达能力
- 只有调度、权限、确认、审计必需的硬约束，才需要机器可读元数据

### 6.4 Events / Audit

这层在方向上重要，但 v1 不必急着独立成复杂模型。

更实用的做法是：

- 先把 audit 做成可读取的 runtime resource
- 真正需要连续订阅时，再演进成 event stream

如果没有事件和审计，AI 就只能看到静态快照。

最小 event/audit 面建议包括：

- runtime state changed
- host connected / disconnected
- skill installed / enabled / disabled
- config changed
- action succeeded / failed
- confirmation granted / denied

这层的作用不是给用户直接看，而是给：

- Agent 自己做连续推理
- UI 做状态刷新
- debug / replay / diagnosis

### 6.5 Intervention / Human Handoff

当前 vNext 裁决：

- intervention / human handoff 是 cutover 前必需
- 它不是 UI 私有流程
- 当前阶段也不升格成新的 public capability family

最小落点应是：

- `kernel/site-runtime` 之间的 runtime handoff contract
- 由 automation failure path / verify failure 显式产出 request
- 由上层 runtime 决定 resolve / cancel / timeout / audit
- shared read surface 收口到 `runtime.summary.interventions` 与 `audit.intervention`

与 confirm 的关系：

- high-risk capability 的 pre-dispatch yes/no 仍走 core confirm gate
- intervention 负责浏览器自动化执行过程中“需要人接管/补输入/确认继续”的 handoff

## 7. 产品到底该暴露哪些 namespace

建议把 namespace 明确分成两层。

### 7.1 Substrate namespace

这些是真正执行能力的底层面：

- `page.*`
- `tabs.*`
- `site.*`
- `memfs.*`
- `host.*`

### 7.2 Product control plane namespace

这些是“操作 BBL 自己”的产品面：

- `runtime.*`
- `config.*`
- `skills.*`
- `hosts.*`
- `audit.*`

这里最重要的新判断是：

- `host.*` 不等于 `hosts.*`

区别如下：

| Namespace | 含义 |
|---|---|
| `host.*` | 在某个 execution host 上做通用原语操作 |
| `hosts.*` | 管理 execution host 本身的连接、选择、健康、默认值 |

这会让架构非常清楚：

- `host.*` 是 substrate
- `hosts.*` 是 product control plane

## 8. “每个功能点都 AI-native” 应该怎么落地

这句话不应该被理解成：

- 每个按钮都变成 tool

应该理解成：

- 每个重要产品能力，都应该有 AI 可以稳定读取和操作的接口

落地规则建议如下：

### 8.1 先判定它属于哪一类

一个功能点先分到：

1. resource
2. action
3. skill/workflow
4. event/audit

不要一上来就问“要不要做成 tool”。

### 8.2 只给有独立语义的东西升格

一个功能点要满足下面至少 2 条，才值得升格成一等 action capability：

1. 对外有稳定语义
2. 跨多个 Skill/场景可复用
3. 需要独立权限/确认
4. 需要独立审计
5. 不能简单由更底层原语稳定组合

### 8.3 默认先暴露状态，再暴露动作

如果一个功能点只有动作，没有状态面，AI 很难稳定使用它。

例如“改配置”之前，应该先有：

- 当前值
- 可选项
- 风险提示
- 最近变更

### 8.4 UI 不是真相源

设置页、host 管理页、skill 管理页、debug 面板，都应该复用同一套 AI Surface。

不能让：

- UI 改一套内部状态
- AI 再改另一套私有接口

## 9. 对当前代码模型的具体启发

### 9.1 `CapabilityDescriptor` 不该再被误解成“所有 AI surface 的唯一对象”

当前仓的 `CapabilityDescriptor` 更适合作为：

- `ActionCapabilityDescriptor`

因为它天然面向：

- input schema
- output schema
- risk
- side effects
- execution binding

这很适合动作，不适合 resource。

但这不意味着 v1 要立刻新造一整套 descriptor 家族。

更实用的做法是：

1. 保留 `CapabilityDescriptor` 作为 action canonical model
2. resource 先用简单 registry / fixed endpoints / bootstrap bundle
3. audit 先并入 runtime resources
4. Skill 继续用 package + `SKILL.md`

当前 contracts/core 应显式把这条边界收口成：

- `CapabilityDescriptor` / `ToolContract` = action
- bootstrap bundle keys = `runtime` / `config` / `skills` / `hosts`
- workflow = skill package + `skills.invoke`

只有当 resources 真的需要统一投影到多种 northbound surface 时，再抽 `ResourceDescriptor`。

### 9.2 `ToolContract` 继续降级为动作投影

`ToolContract` 只应该由 action capability 投影出来。

不要再让它承担：

- resource 表达
- workflow 表达
- audit 表达

### 9.3 聊天 Agent 不该默认看到全部动作

AI-native 不等于把所有 capability 都直接摊成工具面板。

应该做“按 audience 投影”：

- 聊天默认动作
- skill runtime 可见动作
- UI 内部动作
- MCP export 动作

建议后续给 action descriptor 增加最小投影控制：

- `audiences`
- `defaultExposed`
- `confirmPolicy`
- `executionTarget`

### 9.4 `runner.*` 更像内部 substrate，而不是默认用户动作

`runner.invoke` 这种能力更接近内部执行基础设施。

它不一定应该作为聊天 Agent 默认可见动作。

更合理的方式是：

- Skill runtime 可用
- 系统内部可用
- 聊天 Agent 默认通过更高层能力间接使用

## 10. 产品自我认知应该怎么做

Agent 要真正“知道自己是什么产品”，最重要的不是更多 prompt，而是 bootstrap 资源包。

建议每次会话默认都给 Agent 一个高信号摘要包：

1. 产品身份
   - 版本
   - 当前 profile
   - 当前环境
2. 当前可用 execution hosts
3. 当前已安装 skills
4. 当前默认模型和权限策略
5. 当前 active tab / site context
6. 最近错误和运行态摘要

这层建议不要做成大 JSON 直塞。

而应该做：

- 小摘要
- 可展开 resource
- 按需深读

当前最小可落地 contract 可以先是单一 bootstrap read path，返回：

- `runtime` summary
- `config` placeholder/summary
- `skills` summary
- `hosts` summary

先把高信号摘要读出来，再继续扩展 resource registry。

## 11. 自然语言配置应该怎么设计

“通过自然语言直接配置产品”是这条设计主轴里非常关键的一块。

推荐闭环：

1. Agent 先读 `config summary`
2. Agent 生成明确变更意图
3. 系统将自然语言意图转成结构化 patch
4. 对高风险项进行确认
5. 调 `config.update`
6. 写入 audit event
7. 返回新配置摘要

也就是说：

- 自然语言是入口
- 结构化 patch 是执行合同
- audit 是可追踪闭环

## 12. Host 一等化之后该怎么设计

### 12.1 Host 的角色

Host 现在应被定义成：

- 可本地
- 可远程
- 可通过 SSH/tunnel 接入
- 可承载已有本机工具和其他 agent

这意味着 Host 不再只是“bridge 后面那台电脑”。

它是执行网络。

### 12.2 但 Host 不要膨胀成产品概念中心

Host 虽然升级成一等执行面，但它不应该吞掉其余抽象。

仍然保持：

- `Skill` 是用户安装单位
- 浏览器是控制中枢
- `page/site/tabs` 仍是浏览器本地能力
- `host.*` 是通用执行原语

### 12.3 Host 的最小产品面

至少需要：

- `hosts.list`
- `hosts.get`
- `hosts.connect`
- `hosts.disconnect`
- `hosts.set_default`
- `hosts.health`

以及最小 substrate 动作：

- `host.read`
- `host.write`
- `host.edit`
- `host.exec`

## 13. Skill 体系应该怎么受益

这条设计不是为了把 Skill 弄复杂。

相反，它会让 Skill 更自由。

因为 Skill 不需要再去绑定：

- 私有 UI 实现
- 隐含配置位置
- 暗含 host/browser 假设

Skill 只需要：

1. 用自然语言说清楚自己是什么
2. 在需要的地方调用统一 AI Surface
3. 只声明少量硬约束

建议保留“metadata-minimal”原则：

- `SKILL.md` 负责 rich semantic intent
- 机器可读字段只保留：
  - execution targets
  - required permissions
  - secrets/auth requirement
  - risk / side effects

## 14. 这套设计对产品的直接收益

1. Agent 能更像“这个产品自己的驾驶员”，而不是仅仅会调几个工具
2. UI、Skill、聊天、外部接入复用同一套控制面
3. Host 接入本机和远程能力后，产品上限显著变高
4. 浏览器能力和 Host 能力边界更清楚
5. capability 不会继续无意义细碎化

## 15. 风险与容易犯的错

### 15.1 错误一：把所有产品接口都变成 tool

后果：

- tool 面爆炸
- 上下文噪音过大
- 权限和审计难理解

### 15.2 错误二：把所有东西都硬塞进 `CapabilityDescriptor`

后果：

- resource 和 action 混模型
- descriptor 变成超级肥对象

### 15.3 错误三：Host 一等化后又重新发明大量 `host.xxx`

后果：

- 失去 Host 原语的通用性
- Skill 和 workflow 的价值被侵蚀

### 15.4 错误四：UI 继续走私有状态改写

后果：

- AI 和 UI 看到的是两套产品

## 16. 建议落地顺序

### Phase 1: 定义最小 AI Surface primitives

先补：

1. `CapabilityDescriptor` 明确只代表 action
2. 最小 resource registry / bootstrap bundle
3. audience / projection 规则
4. 不引入多余 descriptor family

其中第 1 步和 bootstrap bundle keys 已可先在 contracts/core 以轻量边界常量落地；当前仓也已补到 `readAiSurfaceResource()` + MV3 `resource.read` 最小 lookup surface；更完整的 resource metadata registry 仍属于后续实现。

### Phase 2: 先把产品自我认知做出来

优先实现：

1. `runtime summary`
2. `config summary`
3. `skills summary`
4. `hosts summary`
5. `audit tail`

### Phase 3: 做产品控制面动作

优先实现：

1. `config.update`
2. `skills.install/enable/disable`
3. `hosts.connect/disconnect/set_default`
4. `runtime.capture_diagnostics`

### Phase 4: 收口 Host 一等执行面

优先实现：

1. `hosts.*` control plane
2. `host.read/write/edit/exec`
3. local + remote host 选择
4. patch / confirm / audit

### Phase 5: UI 与聊天共用控制面

目标是：

- 设置 UI
- Host 管理 UI
- Skill 管理 UI
- 聊天 Agent

都走同一套 AI Surface。

## 17. 最终判断

对这个项目来说，真正该坚持的不是“capability 要不要更细”。

真正该坚持的是：

1. 产品自己必须有 AI-native control plane
2. `Capability` 不应再等同于 `tool call`
3. Host 应是一等执行面，但保持粗粒度原语
4. 浏览器仍是控制中枢，不是被 Host 取代
5. Skill 继续作为高层语义和 workflow 单位

如果这 5 条成立，后面很多实现细节都会自然变简单。

## 18. 参考模式

- Model Context Protocol: tools / resources / prompts primitives
- Model Context Protocol: composability over specificity
- OpenAI / Anthropic: tool/action schema 清晰、参数稳定、说明高信号
- VS Code LM tool 模式：只暴露稳定语义动作，不暴露 UI 实现细节
