# Architecture Quality Review: 旧仓核心问题解决状态

> review-date: 2026-03-29
> scope: 架构设计质变 — 新仓是否真正解决旧仓核心设计问题
> status: active
> refresh-trigger: 任意 P5/P7 相关 backlog issue 完成时需刷新

## 0. 一句话结论

新仓在 9 个旧仓核心架构问题中，**7 个完全解决、2 个部分解决**。质变方向正确且不可逆，当前最大风险不在设计层而在实现收口层。

## 1. 评估矩阵

| ID | 旧仓问题 | 根因类型 | 解决状态 | 新仓解决机制 |
|----|---------|---------|---------|-------------|
| P1 | Shell 中心化 | 架构心智模型 | ✅ 已解决 | BrowserVFS 纯浏览器实现，零 shell 依赖 |
| P2 | Plugin/Skill/SiteAdapter 多概念叠加 | 产品概念泄漏 | ✅ 已解决 | Skill 统一收敛，Plugin 概念清除 |
| P3 | ToolContract 作为唯一真相源 | 模型抽象层级错误 | ✅ 已解决 | CapabilityDescriptor 是唯一真相源，ToolContract 纯投影 |
| P4 | Tool dispatch 硬编码 | 扩展机制缺陷 | ✅ 已解决 | descriptor-driven registry + family provider dispatch |
| P5 | 去中心化 Host | 架构定位错误 | ⚠️ 部分解决 | contract + control plane 完整，host provider 实现缺失 |
| P6 | 细碎 capability 爆炸 | 治理规则缺失 | ✅ 已解决 | 34 个/9 namespace + 穷举治理机制 |
| P7 | AI Surface 只有 tool list | 产品 AI-native 程度 | ⚠️ 部分解决 | 三原语声明完成，event/audit 面缺失 |
| P8 | Orchestrator 单体膨胀 | 职责边界模糊 | ✅ 已解决 | 6 个独立 package，无 God Object |
| P9 | 执行模式正交轴混淆 | 分层不清 | ✅ 已解决 | Capability routing / Family dispatch / Host routing 三轴正交 |

## 2. 已解决问题 — 关键设计证据

### P1: Shell 中心化 → 已彻底消除

- 全仓 `packages/` 下搜索 `shell|bash|lifo|child_process|spawn` → 零命中
- `BrowserVfs` 完全基于 IndexedDB + 内存 Map，无外部进程依赖
- `JsRunnerHost` 使用 `new Function()` 模块执行，不依赖 shell
- `host.exec` 以 `risk: "high"` 显式声明为外部效果，不默认可用
- **不可逆性**：锁在 `docs/locked-decisions-2026-03-29.md`「不要把 shell 命令重新塞回 VFS/skill discovery」

### P2: 多概念叠加 → 统一为 Skill

- 全仓无 `Plugin` 类、`PluginRuntime`、`SiteAdapter` 等旧概念
- `SkillDefinition` → `SkillInvocationService` → `SiteSkillDefinition` → `defineSkill()` 形成统一链路
- 生命周期状态机 `draft → staged → installed → enabled ↔ disabled → archived` 统一覆盖
- **不可逆性**：锁在 locked decisions「不要重新引入 Plugin 作为主概念」

### P3: ToolContract → 降级为纯投影

- `descriptorToToolContract()` 是纯函数，单向 `CapabilityDescriptor → ToolContract`
- 全仓无任何从 `ToolContract` 反向推导 `CapabilityDescriptor` 的代码路径
- 整个调用链（registry lookup → permission check → provider dispatch）全程使用 descriptor
- **不可逆性**：锁在 locked decisions「ToolContract 只是 action 投影」+ code 注释显式锁定

### P4: 硬编码 dispatch → descriptor-driven 路由

- `ctx.call(id, input)` → `registry.require(id)` → `descriptor.executionBinding.family` → `providers.invoke()` 全链路 descriptor 驱动
- `FamilyProviderRegistry` 按 `family` 字符串 map lookup，一行 switch 都没有
- 唯一内联处理：`skills` family 的 invoke/list（语义必要，非硬编码）
- **不可逆性**：被 134+ 条测试锁住

### P6: 细碎 capability → 收敛治理

- `PUBLIC_CAPABILITY_NAMESPACES` 穷举 9 个合法 namespace
- `CAPABILITY_ID_RE` 强制 dotted 格式
- `assertCapabilityDescriptor()` 注册时校验
- `hasPublicNamespaceCoverage()` 测试断言所有 public namespace 已覆盖
- 旧仓 46 tool → 新仓 34 capability（在增加了 hosts/host/runtime/skills 之后仍收敛）

### P8: Orchestrator → 6 package 拆分

| Package | 职责 | LOC |
|---------|------|-----|
| contracts | canonical model + 校验 + 状态机 | 504 |
| core | registry + dispatch + ctx + bootstrap + control plane | 1236 |
| browser-vfs | VFS + IndexedDB + snapshot | 820 |
| js-runner | 隔离执行 + RPC + timeout | 248 |
| site-runtime | active-tab + injection + verifier | 262 |
| skill-sdk | thin facade + defineSkill | 77 |

无 God Object。最大类 `BrowserVfs` 严格单一职责。

### P9: 执行模式正交轴 → 三轴分离

1. **Capability routing**：`id → descriptor → permission gate`
2. **Family dispatch**：`descriptor.executionBinding.family → provider`
3. **Host routing**：`resolveHostSubstrateTarget(snapshot, { hostId? })` 独立于 capability id

三个轴互不干扰，组合可预测。

## 3. 部分解决问题 — 差距分析

### P5: Host 一等执行面（contract 完整，实现占位）

**已完成**：
- `host.*` / `hosts.*` catalog descriptor 全部注册
- `ExecutionHostRecord` 支持 `local|remote` kind + 三态
- `createHostControlPlaneSnapshot` / `connect` / `disconnect` / `setDefault` / `resolveTarget` 完整
- 无 `browser-first` 默认策略残留

**缺口**：
- `host` family 的 `FamilyProvider` 未注册——catalog 有 descriptor 但没有真实 provider
- 真正的 local/remote host adapter 未实现
- Chrome offscreen → host bridge 尚无真实 RPC 链路

**风险等级**：中。contract 保证了未来实现不会再走旧路，但当前 `ctx.call("host.exec", { command: "ls" })` 会 throw "No provider registered"。

**跟踪**：对应 backlog —
- `2026-03-29-offscreen-execution-host-is-still-contract-only.md`（已 done）
- 真实 adapter 开发属于后续 batch

### P7: AI Surface 三面暴露（action + resource ✅ / event ❌）

**已完成**：
- `AI_SURFACE_PRIMITIVES = ["action", "resource", "workflow"]` 声明
- **Actions**: CapabilityDescriptor → ToolContract 完整链路
- **Bootstrap Resources**: `runtime/config/skills/hosts` 四维 summary 已实现 (`createBootstrapSummary()`)
- **Workflows**: `SkillInvocationService` + `skills.invoke` capability

**缺口**：
- **Event/Audit**: 搜索 `event|EventEmitter|audit|AuditLog` → 零命中。`CapabilityTraceEntry` 只在 per-invocation 内存数组中，无持久化 audit log 或事件总线
- **Config bootstrap**: 明确注释 `"Config control plane is not implemented yet."`
- Agent 无法追踪自身行为历史

**风险等级**：中偏高。这是 cutover 前 Gate F（Operability）和 Gate G（Product Self-Awareness Surface）的 hard gate 依赖。

**跟踪**：对应 backlog —
- `2026-03-29-audit-tail-is-still-missing-for-host-control-plane-changes.md`（open）
- `2026-03-29-runtime-diagnostics-is-still-bridge-only-and-not-part-of-public-control-plane.md`（open）

## 4. 新架构潜在风险

### 4.1 core/src/index.ts 单文件膨胀

当前 1236 行，包含 BUILTIN_CATALOG (34 个 descriptor) + host control plane + bootstrap summary + ctx factory + invocation service + typed facade。随着 builtin 扩充，建议考虑拆分为 `catalog.ts`、`control-plane.ts`、`bootstrap.ts`、`context.ts` 等子模块。

**触发条件**：当文件超过 ~1500 行或新增 2+ namespace 时。

### 4.2 Site Runtime 与 Capability Routing 的平行路径

`SiteSkillRuntime.invoke()` 不经过 `CapabilityRegistry` / `FamilyProviderRegistry`，是一条独立的 match → plan → install → invoke → verify 链路。如果未来 `site.*` / `page.*` capability 需要从 Skill ctx 中调用，需要一个 site family provider 桥接层。

**触发条件**：当需要 `ctx.call("page.click")` 实际走 content script injection 时。

### 4.3 TypeScript 静态检查遗留

当前有 1 个 TS 错误位于 `packages/js-runner/test/js-runner.spec.ts:352`——`HostSubstrateRpcRequest` union type 推断问题。非阻断但应修复。

## 5. 核心质变评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 概念收敛 | 9/10 | Skill 统一、Plugin 清除、ToolContract 降级 |
| 执行模型 | 8/10 | 三轴正交、descriptor-driven，Host 实现待补 |
| AI Surface | 7/10 | 三面声明完成，action + resource 已实现，event 缺失 |
| 代码治理 | 8/10 | namespace 穷举、ID 格式校验、测试锁契约 |
| 模块化 | 8/10 | 6 个独立 package，core 稍重 |
| 不可逆性 | 9/10 | locked decisions + 代码注释 + 测试断言三层锁定 |
| **综合** | **8.2/10** | 质变方向正确且不可逆，剩余差距在实现层收口 |

## 6. 文档维护规则

- 本文档随以下事件更新：
  1. P5 相关 host provider/adapter issue 完成
  2. P7 相关 event/audit issue 完成
  3. 任何新发现的架构回退（违反 locked decisions）
  4. core/src/index.ts 拆分完成
- 刷新时需重新验证代码证据，不能只改表格
- 若发现新的旧仓问题未在本文覆盖，新增 P10+
