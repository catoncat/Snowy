# Kernel 骨架设计

> design-date: 2026-03-29
> status: locked-decisions; kernel skeleton 与 2026-04-09 主线 follow-ups 已落地
> scope: packages/kernel 整体设计、与现有模块关系、三个 slice 的实施计划
> prerequisite: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md

---

## 0. 背景

Recovery Report 确认：新仓已完成底座重构（contracts / core / browser-vfs / js-runner / site-runtime / mv3-shell），但尚未补回浏览器侧 agent kernel 主层。

本文档锁定 `packages/kernel` 的骨架设计，使其成为新仓的 "browser-side brain"——负责 session lifecycle、run state machine、loop turn orchestration、memory compaction、以及未来的 diagnostics / intervention / provider routing。

### 0.1 当前落地快照（2026-04-09）

截至 2026-04-09，下面这些能力已经有代码与测试落地，但仍不应被描述成“整体 shipped / 旧仓 parity 完成”：

- `packages/kernel` 已具备 session store、run controller、loop engine、compaction manager 与 facade 主路径。
- kernel mainline follow-up 已补到 diagnostics snapshot / runtime summary、provider health + base profile routing、loop 内 policy-driven intervention。
- secondary follow-up 已补到 generic config persistence、background automation lane、offscreen runner host integration regression。

当前仍应保留为“partial / secondary follow-up 继续推进”的部分：

- 更完整的 browser automation stabilization / DOM lane 扩展。
- 更广的 execution-host / remote-host cutover 语义。
- provider/profile routing 仍缺 execution-lane-aware 初始 profile 选择与 ordered profile chain contract；当前 loop / compaction 仍主要落在 implicit worker/primary defaults。
- minimal child-run / subagent contract 仍未进入当前 kernel run model；现状仍只有 session-local run queue。
- browser-vfs、skill-sdk / studio、repo workflow DX 等 deferred 模块。

---

## 1. 核心设计原则

1. **先定类型，再定行为** — 所有 canonical types 先进 `packages/contracts`，kernel 只写实现。
2. **不搬旧 God Object** — 旧仓 `BrainOrchestrator` 有 30+ public methods。新仓拆成 4 内部子系统 + 1 facade。
3. **可测试优先** — 每个子系统可独立 unit test，不依赖完整 MV3 环境。
4. **不抢已有模块的活** — VFS 是 VFS，JS Runner 是 Runner，capability invoke 留在 core。Kernel 只管"何时调度、如何编排、状态怎么流转"。
5. **不暴露内核操作为 capability** — Compaction、session 管理等内核级操作不注册为 CapabilityDescriptor，不出现在 `runtime.listCapabilities()` 中。

---

## 2. 已锁定决策

| 决策 | 结论 | 理由 |
|------|------|------|
| 包名 | `packages/kernel` | 不用 `brain`，与旧仓 kernel 概念对齐 |
| 持久化后端 | BrowserVFS + 薄 `SessionStorage` 接口 | 统一存储层 + 测试友好 + 可替换（详见 §4） |
| Compaction LLM 调用 | kernel 内部 `KernelLlmAdapter` 注入 | pi-mono / 旧仓一致、避免循环依赖、不暴露内核操作（详见 §5） |
| 类型归属 | session / run / loop / compaction canonical types → `packages/contracts` | 保持 contracts 为 canonical model 单一来源 |

---

## 3. 与现有包的关系

```text
packages/contracts   ← 新增 session / run / loop / compaction 类型
packages/core        ← 不变；kernel 通过 core 的 registry + ctx 调度能力
packages/kernel      ← 新包；组合 core 的 invoke + vfs 的存储 + 自身的编排
packages/browser-vfs ← kernel 的 SessionStorage 默认实现基于 VFS
packages/js-runner   ← kernel loop 调度 skill 执行时走 runner
packages/site-runtime← kernel loop 中 page/site 类 step 走 site-runtime
packages/skill-sdk   ← skill authoring facade；不直接依赖 kernel
apps/mv3-shell       ← 构造 kernel 实例并注入依赖
```

依赖方向（单向）：

```text
contracts ← core ← kernel → browser-vfs
                           → js-runner
                           → site-runtime
apps/mv3-shell → kernel + core + browser-vfs + js-runner + site-runtime
```

---

## 4. 持久化: BrowserVFS + SessionStorage 接口

### 4.1 为什么用 BrowserVFS

- 浏览器端无原生文件系统；BrowserVFS 已具备 `mem://` + IndexedDB 后端
- 已有 `ephemeral / workspace / library` scope 分级，session 可放 `workspace` scope
- 复用 VFS 的 quota / snapshot / rehydrate 能力
- 避免新增独立基础设施

### 4.2 为什么加一层 SessionStorage 接口

- 测试时用 `InMemorySessionStorage`，不需要真 IndexedDB
- 如果未来 session 数据量大、查询模式复杂（tree 回溯等），可换 IndexedDB 直连实现，不动 kernel
- 接口极薄（5 个方法），代价近乎为零

### 4.3 SessionStorage 接口定义

```ts
interface SessionStorage {
  createSession(header: SessionHeader): Promise<void>
  appendEntry(sessionId: string, entry: SessionEntry): Promise<void>
  getEntries(sessionId: string): Promise<SessionEntry[]>
  listSessions(): Promise<SessionHeader[]>
  deleteSession(sessionId: string): Promise<void>
}
```

### 4.4 默认实现映射

| 操作 | BrowserVFS 映射 |
|------|-----------------|
| createSession | `vfs.write("mem://kernel/sessions/<id>/header.json", ...)` |
| appendEntry | `vfs.write("mem://kernel/sessions/<id>/entries.jsonl", ..., { append: true })` |
| getEntries | `vfs.read("mem://kernel/sessions/<id>/entries.jsonl")` → parse JSONL |
| listSessions | `vfs.list("mem://kernel/sessions/")` → read headers |
| deleteSession | `vfs.rm("mem://kernel/sessions/<id>/", { recursive: true })` |

---

## 5. Compaction LLM 调用: KernelLlmAdapter

### 5.1 为什么不走 capability invoke

1. **Compaction 是内核级操作**，不是用户级能力。不该出现在 `listCapabilities()` 中。
2. **Capability invoke 链路太重**。标准路径包含 permission check → risk confirm → family provider dispatch → trace，compaction 全都不需要。
3. **循环依赖风险**。Compaction 在 loop turn 之间触发；如果走 capability invoke，而 invoke 本身可能触发 compaction check，形成环。
4. **行业实证**。pi-mono 用 `completeSimple` 直接调 LLM provider 接口；旧仓 orchestrator 内部直接调 `llmProviders.get()`。无成熟实现将 compaction 注册为 capability。

### 5.2 pi-mono compaction 流程参考

```text
触发
├─ overflow: LLM 返回 context 超限错误 → 自动 compaction + retry
├─ threshold: usage.totalTokens > contextWindow - reserveTokens(16384)
├─ manual: 用户命令
└─ pre-prompt: 发送新 prompt 前检查

执行
├─ prepareCompaction: 找 cut point、提取待压缩消息、收集 previousSummary
├─ generateSummary: 直接调 completeSimple（同模型、reasoning:high）
│   ├─ 首次: <conversation>…</conversation> + structured format prompt
│   └─ 迭代: + <previous-summary>…</previous-summary> + UPDATE prompt
└─ 并行: generateTurnPrefixSummary（仅 split turn）

写入
├─ appendCompaction(summary, firstKeptEntryId, tokensBefore, details)
├─ buildSessionContext → 重建 messages
└─ agent.replaceMessages(rebuilt)
```

### 5.3 KernelLlmAdapter 接口定义

```ts
interface KernelLlmAdapter {
  complete(opts: {
    systemPrompt: string
    messages: Array<{ role: "user" | "assistant"; content: string }>
    maxTokens?: number
    signal?: AbortSignal
  }): Promise<string>
}
```

### 5.4 注入方式

```ts
const kernel = createKernel({
  registry,          // CapabilityRegistry from core
  providers,         // FamilyProviderRegistry from core
  storage,           // SessionStorage (BrowserVFS-backed)
  llm,               // KernelLlmAdapter
})
```

---

## 6. Contracts 新增类型（B-1 slice）

以下类型应新增到 `packages/contracts/src/index.ts`：

### 6.1 Session Model

```ts
type SessionEntryType =
  | "message" | "compaction" | "thinking_level_change"
  | "model_change" | "label" | "session_info"

interface SessionHeader {
  id: string
  parentSessionId?: string
  createdAt: string
  title?: string
  model?: string
}

interface SessionEntry {
  entryId: string
  parentId?: string
  type: SessionEntryType
  timestamp: string
  payload: unknown
}

interface MessagePayload {
  role: "user" | "assistant" | "system"
  text: string
  toolName?: string
  toolCallId?: string
}

interface CompactionPayload {
  reason: CompactionReason
  summary: string
  firstKeptEntryId: string
  previousSummary?: string
  tokensBefore: number
  tokensAfter: number
}

interface SessionContext {
  sessionId: string
  entries: SessionEntry[]
  messages: SessionContextMessage[]
}

interface SessionContextMessage {
  role: "user" | "assistant" | "system" | "compactionSummary"
  content: string
  entryId: string
  toolName?: string
  toolCallId?: string
}
```

### 6.2 Run State Model

```ts
type RunPhase = "idle" | "running" | "paused" | "compacting" | "stopped"

interface RunState {
  sessionId: string
  phase: RunPhase
  retry: RetryState
  queue: RunQueue
}

interface RetryState {
  active: boolean
  attempt: number
  maxAttempts: number
}

interface RunQueue {
  steer: QueuedPrompt[]
  followUp: QueuedPrompt[]
}

interface QueuedPrompt {
  id: string
  text: string
  enqueuedAt: string
}
```

### 6.3 Loop Turn Model

```ts
type LoopTerminalStatus =
  | "done" | "failed_execute" | "failed_verify"
  | "progress_uncertain" | "max_steps" | "stopped" | "timeout"

type NoProgressReason = "repeat_signature" | "ping_pong"

type LoopTurnStatus = "pending" | "executing" | "succeeded" | "failed" | "skipped"

interface LoopTurn {
  turnId: string
  sessionId: string
  stepIndex: number
  capabilityId?: string
  status: LoopTurnStatus
  terminalStatus?: LoopTerminalStatus
  noProgressReason?: NoProgressReason
  startedAt: string
  endedAt?: string
}
```

### 6.4 Compaction Contract

```ts
type CompactionReason = "overflow" | "threshold" | "manual"

interface CompactionDraft {
  reason: CompactionReason
  summary: string
  firstKeptEntryId: string
  previousSummary?: string
  tokensBefore: number
  tokensAfter: number
}
```

### 6.5 Run Phase Transition Table

```text
idle       →  running          (startRun)
running    →  paused           (pause)
running    →  compacting       (threshold/overflow trigger)
running    →  stopped          (stop / terminal condition)
paused     →  running          (resume)
compacting →  running          (compaction done, willRetry=true)
compacting →  idle             (compaction done, willRetry=false)
stopped    →  idle             (reset)
```

---

## 7. Kernel 内部子系统（B-2 / B-3 slice）

### 7.1 SessionStore

```text
职责: session CRUD、entry append、tree 遍历、context build
依赖: SessionStorage 接口
不含: LLM 调用、run state、loop 调度
```

核心方法:
- `createSession(opts?)` → `SessionHeader`
- `appendEntry(sessionId, entry)` → `void`
- `getEntries(sessionId)` → `SessionEntry[]`
- `buildContext(sessionId)` → `SessionContext`
  - 找最后一个 CompactionEntry
  - 从 `firstKeptEntryId` 处截断
  - 拼装 compactionSummary + kept messages

### 7.2 RunController

```text
职责: RunState 状态机、phase 转换校验、queue enqueue/dequeue、retry 策略
依赖: 无外部依赖；纯状态管理
不含: session 持久化、LLM 调用、step 执行
```

核心方法:
- `getState(sessionId)` → `RunState`
- `transition(sessionId, event)` → `RunState` （event = start/pause/resume/stop/compact/done/reset）
- `enqueue(sessionId, behavior, prompt)` → `void`
- `dequeue(sessionId, behavior)` → `QueuedPrompt[]`
- `shouldRetry(sessionId)` → `boolean`
- `recordRetryAttempt(sessionId)` → `void`

### 7.3 LoopEngine

```text
职责: loop turn 调度、step 执行编排、terminal condition 判定、no_progress 检测
依赖: RunController (状态管理)、core SkillRuntimeContext (能力调度)
不含: session 持久化、compaction 执行
```

核心方法:
- `executeTurn(sessionId, step)` → `LoopTurn`
- `checkTerminal(sessionId, turn)` → `LoopTerminalStatus | null`
- `checkNoProgress(sessionId, recentTurns)` → `NoProgressReason | null`

### 7.4 CompactionManager

```text
职责: threshold 检查、compaction draft 生成、LLM summary、compacted entry 写入
依赖: SessionStore (读 entries)、KernelLlmAdapter (LLM 调用)
不含: run state 管理、loop 调度
```

核心方法:
- `shouldCompact(sessionId, opts?)` → `boolean`
- `prepare(sessionId, reason)` → `CompactionPreparation`
- `execute(preparation)` → `CompactionDraft`
- `apply(sessionId, draft)` → `void` （写入 CompactionEntry）

### 7.5 KernelFacade

```text
职责: 对外统一 API、组合 4 子系统、对接 core registry/ctx
暴露: brain.* control plane
```

loop step 执行边界：

- facade 接收 `registry` / `providers`
- step 先由 kernel 创建 turn，再通过 core runtime context / provider dispatch 调 capability
- 结果仍由 `LoopEngine` 统一记录为 `StepResult`

构造参数:
- `registry: CapabilityRegistry`
- `providers: FamilyProviderRegistry`
- `storage: SessionStorage`
- `llm: KernelLlmAdapter`

---

## 8. 实施 Slice 计划

### B-1: Contracts + SessionStore（最先交付）

范围:
- `packages/contracts/src/index.ts` 新增 §6 全部类型
- `packages/contracts/test/` 类型合法性测试
- `packages/kernel/` package 初始化
- `packages/kernel/src/session-store.ts` + `packages/kernel/src/session-storage.ts`
- `packages/kernel/test/session-store.spec.ts`

验收:
- session CRUD、entry append、context build 全部可用
- compaction entry 参与 context rebuild
- 100% 使用 InMemorySessionStorage 测试

### B-2: RunController + LoopEngine 骨架

范围:
- `packages/kernel/src/run-controller.ts`
- `packages/kernel/src/loop-engine.ts`
- 对应测试

验收:
- RunState 状态机所有合法转换可用
- LoopTurn 用 mock capability 可驱动
- no_progress 检测可用

### B-3: CompactionManager + KernelFacade

范围:
- `packages/kernel/src/compaction-manager.ts`
- `packages/kernel/src/index.ts` (KernelFacade)
- 集成测试: session → run → loop → compaction 端到端

验收:
- compaction trigger → LLM summary → entry 写入 → context rebuild 全链路
- KernelFacade 暴露完整 API

---

## 9. 实施状态

> 更新日期: 2026-03-29

### B-1: Contracts + SessionStore ✅ 已交付

实际产出:
- `packages/contracts/src/index.ts` — 新增 ~200 行类型（SessionHeader, SessionEntry, SessionEntryType, MessagePayload, CompactionPayload, SessionContext, SessionContextMessage, RunPhase, RunState, RetryState, RunQueue, QueuedPrompt, RUN_PHASE_TRANSITIONS, LoopTurn, LoopTurnStatus, LoopTerminalStatus, NoProgressReason, CompactionReason, CompactionDraft, KernelLlmAdapter, SessionStorage）
- `packages/contracts/test/contracts.spec.ts` — 新增 5 个 describe block（41 总测试）
- `packages/kernel/` — package 初始化，bun workspace 注册
- `packages/kernel/src/session-store.ts` — session CRUD + entry append + tree + compaction-aware context build
- `packages/kernel/src/in-memory-session-storage.ts` — 测试用内存实现
- `packages/kernel/test/session-store.spec.ts` — 13 测试

### B-2: RunController + LoopEngine ✅ 已交付

实际产出:
- `packages/kernel/src/run-controller.ts` — RunState 状态机（idle→running→paused/stopped/compacting）+ prompt queue + retry strategy（默认 maxAttempts=2）
- `packages/kernel/src/loop-engine.ts` — turn scheduling + step counting + terminal condition detection（7 种状态）+ no-progress detection（repeat_signature 默认二连且阈值可配置 + ping_pong AB交替）+ budget 系统
- `packages/kernel/test/run-controller.spec.ts` — 15 测试
- `packages/kernel/test/loop-engine.spec.ts` — 11 测试

### B-3: CompactionManager + KernelFacade ✅ 已交付

实际产出:
- `packages/kernel/src/compaction-manager.ts` — threshold-based trigger + prepare→execute(LLM)→apply cycle + iterative compaction with `<previous-summary>` (pi-mono pattern)
- `packages/kernel/src/kernel-facade.ts` — `createKernel()` unified facade, 组合 4 子系统，暴露 session/run/queue/loop/compaction 统一 API + 子系统直接访问；后续 follow-up 已补回 registry/providers 注入与 loop capability dispatch
- `packages/kernel/test/compaction-manager.spec.ts` — 5 测试（threshold, full cycle, iterative compaction）
- `packages/kernel/test/kernel-facade.spec.ts` — 13 测试（session/run/queue/loop/compaction 端到端集成 + capability dispatch）

### 后续已补回的 kernel 扩展层

- `packages/kernel/src/intervention-controller.ts` — intervention lifecycle / summary / audit 共享状态
- `packages/kernel/src/vfs-session-storage.ts` — VFS-backed session persistence adapter
- `packages/kernel/src/llm-provider-registry.ts` / `llm-profile-resolver.ts` / `llm-openai-provider.ts` / `llm-stream-parser.ts` — provider/profile/transport 基础层（execution-lane-aware routing 仍 follow-up）
- `packages/kernel/src/llm-kernel-adapter.ts` / `llm-message-model.ts` — provider 到 kernel loop 的消息转换与适配层
- `packages/kernel/src/loop-orchestrator.ts` / `prompt-builder.ts` — 主 LLM loop 与 system prompt/task progress 注入
- 对应验证入口见 `packages/kernel/test/*.spec.ts`

### 当前实现快照

| Area | Current Implementation |
|------|------------------------|
| session / run / compaction | `session-store.ts`, `run-controller.ts`, `loop-engine.ts`, `compaction-manager.ts`, `kernel-facade.ts` |
| intervention / persistence | `intervention-controller.ts`, `vfs-session-storage.ts` |
| provider / profile / transport | `llm-provider-registry.ts`, `llm-profile-resolver.ts`, `llm-openai-provider.ts`, `llm-stream-parser.ts`, `llm-kernel-adapter.ts`, `llm-message-model.ts` |
| orchestration / prompt | `loop-orchestrator.ts`, `prompt-builder.ts` |
| behavior truth | `packages/kernel/src/*.ts` + `packages/kernel/test/*.spec.ts` |

### 实际 vs 设计偏差

| 项目 | 设计文档 §7 | 实际实现 | 说明 |
|------|------------|----------|------|
| LoopEngine.executeTurn | 直接编排 step 执行 | `createTurn()` + `recordTurnResult()` 拆分 | 更灵活，允许调用方控制执行过程 |
| KernelFacade 构造参数 | `registry` + `providers` + `storage` + `llm` | `storage` + `llm` + `registry?` + `providers?` + `dispatch/step overrides` + `loop?` + `compaction?` | 后续 wiring 已补回 registry/providers，并为 MV3/runtime 集成补了 dispatch 与 step override 入口 |
| CompactionManager.shouldCompact | `(sessionId, opts?)` | `(sessionId, contextWindow, currentTokens?)` | 需要显式 contextWindow 参数，更符合调用方已知信息 |

---

## 10. 后续 Phase（未展开）

以下在 B-1/B-2/B-3 交付后再展开详设：

- **Phase C**: Memory continuity（compaction 与 session 的深度集成）
- **Phase D**: Observability（runtime.diagnostics → 正式产品面）
- **Phase E**: Skill 吸收旧 plugin runtime 能力
- **Phase F**: Intervention / Confirm / Handoff
- **Phase G**: Browser automation parity

---

## 11. 不做清单

- 不把 compaction 注册为 capability
- 不在 kernel 中引入 Plugin 概念
- 不把 session store 和 BrowserVFS 的 `mem://` path 耦合（走 SessionStorage 接口）
- 不在 B slice 范围内做 Provider / Profile / Routing（留给后续 Phase）
- 不在 B slice 范围内做 channel / transport（不是 kernel 主线）
