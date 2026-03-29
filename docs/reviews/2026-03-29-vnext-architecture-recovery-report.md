# vNext Architecture Recovery Report

> review-date: 2026-03-29
> scope: 旧仓复核后的新仓重新定性、偏差判断与补救路线
> status: active
> audience: 产品、架构、并行开发 Agent

## 0. 核心目标

这份报告只解决一个问题：

> 在重新仔细核对旧仓之后，我们应该如何判断新仓当前的架构状态，以及如何把它拉回到正确主线，而不是继续在一个被误定性的方向上前进。

这里最重要的不是“找几个缺功能的 issue”。

这里要解决的是：

1. 旧仓到底是什么系统
2. 新仓已经做对了什么
3. 新仓真正偏在哪里
4. 应该如何补救，而且尽量不推翻已经做对的部分

---

## 1. 一句话结论

新仓没有“完全跑偏”。

更准确地说：

- 新仓已经把旧仓里最危险的几类结构性错误拆掉了
- 但新仓目前更像一个 `runtime substrate foundation`，还不是一个完整的 `browser-native agent kernel`
- 真正的问题不是“写错了”，而是“把底座误当成了主系统”

所以补救方式不是推倒重写，而是：

1. 保留当前已经做好的 substrate / contract / shell 基础
2. 明确把它们降级为底座
3. 在其上补回真正的 `Brain / Kernel / Control Plane / Observability / Memory / Intervention`

---

## 2. 本次复核依据

### 2.1 旧仓核心材料

- `/Users/envvar/work/repos/browser-brain-loop/docs/kernel-architecture.md`
- `/Users/envvar/work/repos/browser-brain-loop/docs/skill-runtime-site-capability-redesign-2026-03-29.md`
- `/Users/envvar/work/repos/browser-brain-loop/docs/background-mode-design-2026-06.md`
- `/Users/envvar/work/repos/browser-brain-loop/docs/debug-interfaces.md`
- `/Users/envvar/work/repos/browser-brain-loop/docs/runtime-debug-interface.md`
- `/Users/envvar/work/repos/browser-brain-loop/docs/diagnostics-format.md`
- `/Users/envvar/work/repos/browser-brain-loop/extension/src/sw/kernel/`

重点复核了这些旧模块的真实职责：

- `orchestrator.browser.ts`
- `runtime-loop.browser.ts`
- `session-manager.browser.ts`
- `plugin-runtime.ts`
- `runtime-router.ts`
- `runtime-router/debug-controller.ts`
- `dispatch-plan-executor.ts`
- `channel-*`

### 2.2 新仓核心材料

- `AGENTS.md`
- `docs/start-here.md`
- `docs/locked-decisions-2026-03-29.md`
- `docs/ai-native-capability-surface-design.md`
- `docs/source-of-truth-map.md`
- `docs/legacy-to-vnext-migration-matrix.md`
- `docs/reviews/2026-03-29-architecture-quality-review.md`
- `packages/*`
- `apps/mv3-shell/*`

### 2.3 参考仓

- `~/work/repos/_research/pi-mono/`
  - 参考 session / compaction / provider 路由分层
- `~/work/repos/_research/AIPex/`
  - 参考 browser automation / background mode / content-script DOM lane
- `~/work/repos/_research/opencli/`
  - 参考网站包装、Agent-facing capability 暴露、网页操作组织方式
- `~/work/repos/_research/bb-browser/`
  - 参考站点能力与站点包组织、网站增强路径

这些参考仓不是“直接照搬对象”，而是帮助判断哪些能力面在新仓应是一等设计对象。

---

## 3. 旧仓到底是什么

这是本次复核最关键的结论。

旧仓并不是一个“浏览器工具箱 + skill 包 + 沙盒”的组合体。

旧仓本质上是一个：

> 跑在浏览器扩展 Service Worker 内的 agent kernel

它至少有下面 8 个一等系统面。

### 3.1 Control Plane

旧仓真正对内对外暴露的主入口是 `runtime-router`。

它不是胶水层，而是完整产品控制面：

- `brain.run.*`
- `brain.session.*`
- `brain.step.*`
- `brain.skill.*`
- `brain.plugin.*`
- `brain.debug.*`
- `brain.mcp.*`
- `brain.channel.*`
- `brain.agent.run`

这意味着旧仓的产品形态，天然不是“几个工具函数”，而是“一个可被调度和管理的运行时”。

### 3.2 Orchestration / Session / RunState

旧仓里真正的骨架不是 tool registry，而是：

- `BrainOrchestrator`
- `BrowserSessionManager`
- `RunState`
- steer / followUp queue
- retry / stop / pause / resume
- subagent run

也就是说，旧仓不是一次性函数调用系统，而是带状态、带中断、带队列、带恢复的 agent runtime。

### 3.3 Memory / Compaction

旧仓的 `compaction` 不是边角料，而是主链路的一部分：

- 有 pre-send compaction check
- 有 overflow / threshold 触发
- 有独立 summary 请求链路
- 有 compaction hooks
- 有 session context build 逻辑
- 有 trace chunk / leaf / branch / summary entry

如果新仓只把执行 substrate 做好，但没有 memory / compaction，那么它还不能算是旧仓的主能力迁移。

### 3.4 Capability / Tool / Policy

旧仓有双层工具体系：

- `ToolContract`
- `ToolProvider`
- `CapabilityPolicy`

但这层只是运行内核的一部分，不是整个产品。

复核后可以确认：

- 旧仓的 capability/tool 体系很重要
- 但它不是旧仓的最高层抽象

### 3.5 Extension Runtime

旧仓里真正重的扩展体系其实是 `Plugin Runtime`，不是 `Skill`。

`Skill` 更多是：

- 包管理
- prompt block 注入
- create_skill
- 基础 metadata

而 `Plugin` 才承载：

- hooks
- capability provider override
- policy override
- tool contract override
- llm provider override
- runtime messages
- UI extension
- replace / restore semantics

这意味着新仓如果坚持“用户概念只保留 Skill”，就必须把旧 plugin runtime 的核心能力重新吸收进新的 skill execution model。

### 3.6 Observability

旧仓已经形成了三层可观测性：

1. `brain.debug.snapshot`
2. `brain.debug.runtime`
3. diagnostics export / debug snapshot export

而且它不是简单 log dump。

它已经有：

- scope 化 snapshot
- runtime activity tail
- plugin runtime message trace
- hook trace
- sandbox diagnostics
- timeline / summary / rawEventTail

这说明 observability 在旧仓里不是“有空再补”的工程配套，而是产品运行面的正式组成部分。

### 3.7 Intervention / Human Handoff

旧仓明确把人工介入设计成独立能力面：

- `list_interventions`
- `get_intervention_info`
- `request_intervention`
- `cancel_intervention`

它不是纯 UI 私有流程，而是 agent runtime 的显式能力。

### 3.8 Browser Automation Lanes

旧仓的 browser automation 也不是“点网页”这么简单。

它有两条执行 lane：

- focus / CDP lane
- background / DOM lane

并且 background mode 不只是注入脚本，而是包含：

- tool filtering
- DOM snapshot collection
- DOM locator
- stealth tab
- failure tracker
- mixed fallback routing

这意味着新仓未来的 `page.* / site.*` 不能只理解成“站点能力包装”，还要承接真正的浏览器自动化执行能力。

---

## 4. 新仓已经做对了什么

新仓不是空白，更不是错到不能救。

相反，新仓已经把几类很关键的结构问题拆掉了。

### 4.1 把 shell 从中心地位拿掉

这一点是正确且不可逆的。

新仓已经明确：

- 不再以 `LIFO/browser_bash` 为中心
- `BrowserVFS` 独立存在
- `JS Runner` 独立存在
- `host.*` 被收敛为少量强原语

这是一次真实的架构净化。

### 4.2 把产品概念统一回 Skill

新仓把 `Plugin / Skill / SiteAdapter` 的叠加概念收回到了：

- 用户级扩展单位 = `Skill`

这个方向是对的。

但后续必须补：

- 旧 plugin runtime 的那些执行能力，如何被 skill 吸收

否则只是“概念清爽了”，还没有“能力完整迁入”。

### 4.3 把 canonical model 从 ToolContract 提升到 descriptor

这也是正确的。

新仓已经锁住：

- `CapabilityDescriptor` 只是 action canonical model
- `ToolContract` 只是 action projection
- action / resource / workflow 的边界被明确写出来了

这一步是新仓后续能做 AI Surface 的前提。

### 4.4 把 Host 提升为一等执行面

这一点符合你现在的新判断。

新仓已经比旧仓更清楚地区分：

- `host.*` = execution substrate
- `hosts.*` = execution host control plane

这是非常重要的澄清。

### 4.5 做出了合格的 substrate foundation

当前新仓已经具备 6 个基础件：

| 模块 | 状态 | 作用 |
|---|---|---|
| `packages/contracts` | 已成型 | action canonical model + tool projection |
| `packages/core` | 已成型但偏重 | registry / ctx / bootstrap / control-plane primitive |
| `packages/browser-vfs` | 已成型 | `mem://` 抽象 |
| `packages/js-runner` | 已成型 | 隔离执行 host |
| `packages/site-runtime` | 已成型 v0 | active-tab site invoke 路径 |
| `apps/mv3-shell` | 已成型 v0 | MV3 背景桥与 offscreen/page-hook 容器 |

这些都不该被推倒。

### 4.6 把旧 God Object 打散成多个 package

旧仓 `BrainOrchestrator` 的单体膨胀问题，新仓已经部分解决：

- contracts
- core
- browser-vfs
- js-runner
- site-runtime
- skill-sdk
- mv3-shell

这也是正确方向。

但这不等于“主脑已经存在”。

它只说明“底座已拆包”。

---

## 5. 新仓真正偏在哪里

偏差不是“想法完全错了”。

偏差是：

> 新仓过早把注意力集中到了 substrate reconstruction，而没有同步重建 browser-side brain。

### 5.1 把 substrate 当成了 mainline

当前新仓看起来像：

- capability contract
- family provider
- BrowserVFS
- JS Runner
- Site Runtime
- MV3 shell

这套东西当然有价值。

但它更像：

> “未来 brain 会依赖的基础设施”

而不是：

> “未来产品本身”

### 5.2 缺少 Brain / Kernel 主层

新仓现在还没有一个明确的一等层承接这些旧仓核心职责：

- session lifecycle
- run queue
- pause / resume / stop
- steer / followUp
- retry
- subagent
- failure semantics
- no_progress
- compaction orchestration

这意味着当前新仓还不能真正承接“浏览器中的 agent 大脑”。

### 5.3 Memory / Compaction 缺位

这是最容易被忽视、但最不能忽视的差距之一。

旧仓的 compaction 是主链。

新仓当前更多在做：

- contracts
- runtime substrate
- host/site invoke

而没有正式主线去承接：

- session context
- compaction draft / summary
- overflow / threshold
- compacted memory continuity

如果这块不补，新仓之后一定会回到“工具可调用，但 agent 不稳定”的状态。

### 5.4 Observability 还没有成为一等产品面

新仓已经开始补：

- `runtime.diagnostics`

这是对的。

但它现在还更像：

- shell 层的只读快照入口

还不是完整的：

- public debug surface
- audit tail
- runtime history
- error lifecycle
- operator-facing self-diagnosis system

换句话说：

> 旧仓已经把可观测性做到“产品运行面”，而新仓目前还只做到“bridge 诊断入口”

### 5.5 Intervention 还没有定性

这是一个真实架构空洞。

旧仓里它是独立能力面。

新仓现在还没有明确：

- intervention 是正式 capability family
- 还是 runtime control plane
- 还是 workflow 级约定

如果不先定性，后面很容易在：

- confirm
- high-risk host.exec
- site action failure recovery
- user handoff

这些地方继续各写一套局部逻辑。

### 5.6 Browser automation 还没有迁到主线

当前新仓的 `site-runtime` 更像：

- active-tab site package invoke path

但它不等于旧仓完整 browser automation 主能力。

旧仓那套：

- background mode
- stealth tab
- mixed fallback
- DOM lane / CDP lane
- failure tracker

目前还没有进入新仓主线。

### 5.7 Provider / Profile / Routing 主层还没回来

旧仓还有一块容易漏掉的核心能力：

- LLM provider registry
- profile routing
- escalation policy

新仓当前的主轴更偏 execution side。

但未来要回到完整 browser brain，这块一定要补。

### 5.8 新仓有形成“新 God Object”的风险

旧仓的问题之一是 `BrainOrchestrator` 太重。

新仓虽然拆包了，但又出现两个新的聚集风险：

- `packages/core/src/index.ts`
- `apps/mv3-shell/src/background.js`

如果后续不新增真正的 brain/kernel 层，很多原本该属于 mainline brain 的逻辑，会继续堆回这两个文件里。

---

## 6. 重新定性后的 vNext 目标架构

重新定性之后，新仓的正确目标不应再被描述成：

> “Skill + AI Surface + BrowserVFS + JS Runner + Site Runtime + Execution Host”

这句话没有错，但它漏掉了真正的系统中心。

更完整、更准确的目标应该是：

> “以浏览器侧 Brain/Kernel 为中枢，以 AI Surface 为统一产品面，以 Skill 为唯一扩展单位，以 Browser/Host 为执行基座的 agent system。”

### 6.1 推荐的新顶层分层

```text
Chat UI / Skill / External Client / Future MCP
                    │
                    ▼
              AI Surface Layer
      ├── Actions
      ├── Resources
      ├── Events / Audit
      └── Workflows / Skills
                    │
                    ▼
              Brain / Kernel Layer
      ├── Sessions / Run Queue / RunState
      ├── Loop / Failure / no_progress
      ├── Memory / Compaction
      ├── Policy / Confirm / Intervention
      ├── Provider / Profile / Routing
      └── Diagnostics / Audit / Replay
                    │
                    ▼
             Execution Substrate Layer
      ├── page.* / tabs.* / site.*
      ├── memfs.*
      ├── host.*
      ├── hosts.*
      ├── JS Runner
      └── MV3 shell / offscreen / page-hook bridge
```

### 6.2 新仓现有包应该如何重新归位

| 现有模块 | 正确归位 |
|---|---|
| `packages/contracts` | AI Surface action/resource/workflow contract 层 |
| `packages/core` | AI Surface registry / ctx / invocation / bootstrap primitive |
| `packages/browser-vfs` | 执行底座 |
| `packages/js-runner` | 执行底座 |
| `packages/site-runtime` | 浏览器执行底座 |
| `apps/mv3-shell` | MV3 容器与 substrate bridge |
| `packages/skill-sdk` | skill authoring facade |

而新仓目前缺的，是一个明确的新层：

| 新模块 | 职责 |
|---|---|
| `packages/brain` 或 `packages/kernel` | session / loop / compaction / intervention / diagnostics / provider routing / audit |

### 6.3 为什么必须单独补一个 Brain 层

因为如果不单独补这层，所有“真正属于大脑”的逻辑就只能塞进：

- `packages/core`
- `apps/mv3-shell/background.js`

这会把新仓重新拖回：

- 神文件
- 角色不清
- shell/container 与 decision logic 混杂

这正是旧仓已经证明过会出问题的路径。

---

## 7. 哪些东西应该保留，哪些东西应该停止，哪些东西必须新增

## 7.1 应保留

这些东西不应该被推倒：

- `CapabilityDescriptor` 作为 action canonical model
- `ToolContract` 作为投影
- `Skill` 作为唯一用户级扩展单位
- `BrowserVFS`
- `JS Runner`
- `host.*` / `hosts.*` 分层
- `MV3 shell` 作为浏览器容器与桥接层
- `Site Runtime` 的 active-tab + explicit invoke 基线

## 7.2 应停止

这些方向现在应该暂停继续扩张：

- 把越来越多产品主逻辑继续塞进 `packages/core/src/index.ts`
- 把越来越多运行时逻辑继续塞进 `apps/mv3-shell/src/background.js`
- 在 brain 层未建立前继续扩 capability family 数量
- 过早宣称新仓已经接近 cutover
- 把 `site-runtime v0` 当成完整 browser automation 迁移

## 7.3 必须新增

下面这些是补救必需项：

1. `Brain / Kernel` 主层
2. session / run queue / run state 正式模型
3. compaction / memory continuity
4. provider / profile / escalation 主层
5. diagnostics / runtime debug / audit tail
6. intervention / confirm / human handoff 正式归位
7. browser automation 真正的 page/site execution lane

---

## 8. 具体补救路线

补救路线要尽量遵守一个原则：

> 不重写已经正确的底座，只在正确位置补回主脑。

## 8.1 Phase A: 重新定性当前新仓

目标：

- 把当前新仓从“未来主系统雏形”改写为“foundation + control-plane primitive + shell substrate”
- 明确哪些还不是主脑

应完成的事：

1. 新增这份 recovery report
2. 在后续文档里明确：
   - 当前 v0 = substrate foundation，不等于 kernel parity
3. 后续 backlog/计划按两条主线拆：
   - substrate continuation
   - brain mainline reconstruction

## 8.2 Phase B: 建立 Brain / Kernel 骨架

目标：

- 给新仓建立真正的主脑层

最小应包含：

1. session model
2. run state model
3. queue model
4. loop turn model
5. terminal status / failure reason
6. no_progress policy
7. step trace structure

这一步先不要急着补齐所有 browser automation。

先把大脑的状态机和执行边界站稳。

## 8.3 Phase C: 把 Memory / Compaction 拉回主链

目标：

- 让 agent 有可持续对话和可控上下文裁剪能力

最小应包含：

1. session context builder
2. compaction trigger policy
3. compaction summary contract
4. compacted history continuity
5. overflow / threshold 语义

这一层不要和 VFS 混淆。

`BrowserVFS` 解决的是文件抽象。

`Compaction` 解决的是 agent memory。

这是两件不同的事。

## 8.4 Phase D: 把 Observability 升格为正式产品面

目标：

- 新仓不能只有“能跑”，还要“可诊断、可解释、可回放”

最小应包含：

1. public `runtime.diagnostics` action
2. Level 1 runtime debug snapshot
3. audit tail resource
4. error lifecycle summary
5. run history / step history 最小暴露面

旧仓对我们的真正启发不是“diagnostics JSON 长什么样”，而是：

> debug surface 本身就是 control plane 的一部分

## 8.5 Phase E: 给 Skill 补回旧 Plugin Runtime 的有效能力

目标：

- 不重新引入 Plugin 概念
- 但也不丢掉旧 plugin runtime 真正有用的能力

建议收口方向：

- skill executable setup
- skill-level hook registration
- skill-level capability/provider extension
- skill-level runtime message / UI extension policy

这一步必须非常克制。

不能把旧 plugin API 原样搬回来。

但也不能只保留“prompt skill”而失去扩展能力。

## 8.6 Phase F: 补回 Intervention / Confirm / Handoff

目标：

- 在高风险动作、失败恢复和用户接管之间形成统一机制

应该先明确它属于哪一层。

本报告建议：

- `intervention` 更适合放在 `Brain / Kernel + AI Surface` 交界层
- 它不是纯 UI 流程
- 也不应该只是某个 skill 的私有协议

最小能力可包括：

1. request confirmation
2. request takeover
3. request user input / selection
4. cancel / resolve / timeout

## 8.7 Phase G: 把 Browser Automation 迁回真正主线

目标：

- `page.* / site.*` 不只是一套站点包装 API
- 它们最终要承接旧仓 browser automation 主能力

这里应拆两层理解：

1. `site skill packaging`
   - 面向特定站点 workflow
2. `browser automation substrate`
   - 通用 DOM/CDP/background execution lane

这两层要配合，但不要混在一个模块里。

---

## 9. 对现有已完成代码和 issue 的影响

这个判断非常重要。

### 9.1 不需要推翻的部分

当前已完成的大部分基础工作仍然有效：

- descriptor / contract
- registry / ctx / invoke
- BrowserVFS
- JS Runner
- Site Runtime v0
- MV3 shell
- host substrate/control-plane contract

这些不是错误实现。

它们只是“被过早当成了主系统主体”。

### 9.2 需要改口径的部分

需要改的不是代码先，而是定位：

- `v0-shipped` 不等于“已接近旧仓主能力迁移完成”
- `site runtime` 不等于“browser automation 已迁入”
- `runtime.diagnostics` 不等于“observability 已完成”
- `skill unified` 不等于“旧 plugin runtime 能力已吸收完”

### 9.3 应新增的一批 follow-up 方向

本报告认为至少还需要专门跟踪这些大项：

1. brain/kernel package introduction
2. session/run queue model
3. compaction/memory continuity
4. provider/profile routing
5. audit/event surface
6. intervention/handoff formalization
7. browser automation parity roadmap

其中有些零散问题目前已经在 backlog 里出现了。

但现在还缺少一个把这些点统一纳入“brain mainline”视角的总控判断。

---

## 10. 什么不应该从旧仓迁过来

复核旧仓不是为了“恢复旧仓全部形状”。

下面这些不该原样搬回：

### 10.1 不要恢复 Plugin 作为主产品概念

这是新仓已经做对的地方。

必须坚持：

- 用户概念只有 Skill

### 10.2 不要恢复 shell 为中心的执行心智

即便 Host 成为一等执行面，也不应该再回到：

- shell discovery
- shell-centric runtime
- browser_bash-first

### 10.3 不要把所有旧 builtins 平移成一堆新 capability

你已经明确表达过：

- 少量强原语 + 足够上下文

这个判断依旧成立。

新仓不能因为补脑就重新走回 capability 爆炸。

### 10.4 不要把旧仓 channel / 特殊 transport / studio UI 当成 cutover 前硬前提

像这些能力可以后置：

- wechat channel
- 专用 web chat transport
- Plugin Studio / Skill Studio 完整 UI

它们不是“browser brain 主线能不能成立”的前置条件。

---

## 11. 参考仓对新补救路线的启发

## 11.1 `pi-mono`

对我们最有用的不是具体接口，而是：

- session / context / compaction 是一层正式系统
- provider / routing / message transform 应和 execution substrate 分离

它提醒我们：

> brain 层不能被 shell、site runtime、host adapter 这些执行细节吞没

## 11.2 `AIPex`

它提醒我们：

- browser automation 是一套独立执行学科
- background mode 不是“再写几个 content script”
- DOM lane / CDP lane / verifier / stabilization 应是正式 runtime 能力

## 11.3 `opencli`

它提醒我们：

- 对网站能力做包装时，真正重要的是 Agent-facing abstraction
- 站点能力的价值在于 workflow、封装和上下文组织

但它不提供完整 browser brain / session / compaction 范式。

所以它更适合作为：

- skill / site packaging 参考

而不是：

- kernel 主轴参考

## 11.4 `bb-browser`

它提醒我们：

- 网站增强和站点包组织可以做得比较轻
- 站点能力不一定需要很重的平台概念

但它同样不能代替：

- browser-side brain
- product control plane

---

## 12. 新的总判断

把以上内容压缩成一句话：

> 新仓已经完成了“去掉旧心智并重建底座”的第一阶段，但还没有完成“重建浏览器侧大脑”的第二阶段。

所以现在最正确的动作不是否定新仓，而是：

1. 承认当前成果是 foundation，不是 final architecture
2. 把新仓主线从“继续扩 substrate”切换到“补回 brain/kernel”
3. 用最少的新概念，把 memory、observability、intervention、run-state 主层补回来

---

## 13. 最终建议

### 13.1 产品判断

从产品视角看：

- 新仓值得继续
- 方向没错
- 但当前状态不适合被误判为“已经接近可替代旧仓”

### 13.2 架构判断

从架构视角看：

- 当前最需要的是 `reclassification + second-wave architecture`
- 不是大回滚
- 也不是继续在底座上横向摊更多 capability

### 13.3 执行判断

从开发执行视角看：

- 下一批最高优先级不该再是新的 substrate 小功能
- 而应该是 `Brain / Kernel / Memory / Observability / Intervention`

### 13.4 对并行开发的要求

后续并行开发时，应明确分成两类 lane：

1. `substrate lane`
   - BrowserVFS
   - JS Runner
   - MV3 shell
   - Site Runtime
   - host adapter
2. `brain lane`
   - session
   - loop
   - compaction
   - diagnostics
   - audit
   - intervention
   - provider/profile

不这样分，所有人会继续默认“现在的主系统就是 substrate 包集合”，然后进一步把架构推偏。

---

## 14. 收口

这次复核之后，对新仓最准确的定义应该改成：

> 它现在是一个已经完成底座重构、但尚未补回浏览器侧 agent kernel 的 vNext 主线仓库。

这不是失败。

但这意味着后面的工作重点必须改变。

如果继续沿着“补 substrate 细节”的惯性往前推进，新仓会越来越完整，却越来越不像真正要替代的那个产品。

如果现在就把主线切回 `browser-side brain`，那么当前已经做好的这些底座，反而会成为一次非常有价值的提前投资。
