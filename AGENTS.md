# AGENTS.md

## 1. Repo Mission

- 本仓是 Browser Brain Loop 的 vNext 主线实验仓。
- 目标：去掉 `LIFO/browser_bash`，重建 `AI Surface + Browser-side Kernel + BrowserVFS + JS Runner + Site Runtime + Execution Host`。
- 产品面只保留一个概念：`Skill`。
- 产品对 AI 暴露统一 `AI Surface`；其中 invokable actions 继续通过 `Capability API` 暴露。
- 默认不做 legacy/fallback 设计；旧仓只作行为和概念参考，不作兼容前提。
- 当前阶段判断：v0 已完成的是 substrate foundation；当前主线是补回 browser-side kernel。

## 1.1 Mandatory Onboarding

- 任何新进入本仓的 agent，在动代码前必须先读：
  1. `docs/start-here.md`
  2. `docs/source-of-truth-map.md`
  3. `docs/agent-bootstrap-context-pack.md`
  4. `docs/locked-decisions-2026-03-29.md`
  5. `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
  6. `docs/kernel-skeleton-design.md`
  7. `docs/ai-native-capability-surface-design.md`
  8. `docs/ai-surface-index.md`
  9. `docs/v0-slice.md`
  10. `docs/legacy-reference-map.md`
- 如果要改 architecture-level 代码，再去读旧仓：
  - `/Users/envvar/work/repos/browser-brain-loop/docs/skill-runtime-site-capability-redesign-2026-03-29.md`
  - `/Users/envvar/work/repos/browser-brain-loop/docs/kernel-architecture.md`

## 2. Architecture North Star

- `CapabilityDescriptor` 是 action canonical model。
- `ToolContract` 是 action projection，不是完整 AI Surface 本体。
- 产品 AI Surface 同时包含 actions、resources、events/audit、skills/workflows。
- 文档系统分为 locked / workflow-control / behavior-truth / reference 四类。
- `BrowserVFS` 负责 `mem://` 与持久化，不再依赖 shell。
- `JS Runner Host` 负责执行用户/skill 代码，不在 SW 直接跑动态模块。
- `Site Runtime` 负责 active-tab match、按需注入、action、verifier。
- 浏览器是控制中枢；`Execution Host` 是一等执行面，可本地也可远程。
- 当前主线不是继续横向扩 substrate，而是补回 `packages/kernel` 这一层 browser-side brain。
- `packages/kernel` 负责 session / run / compaction / diagnostics / intervention 主层。
- `host.*` 保持粗粒度原语，不要按产品功能无限细分。
- `Skill` 通过 `ctx.call()` / `ctx.capabilities.*` 使用能力，不直连私有内核实现。

## 3. Working Rules

- 先写测试，再补实现；默认 TDD。
- 新能力先进入 public capability namespace，不要新增私有平行入口。
- 少量强原语 + 足够上下文，优先于细碎 capability 设计。
- 触及 `contracts/core/mv3-shell` 或 public surface 时，必须过 Doc Freshness Gate。
- issue 完成前必须过 Definition Of Done，并判断是否需要 follow-up issue。
- 不要重新引入 `Plugin` 作为主概念；统一收敛为 executable skill。
- 不要重新引入 `bash.exec`/`find` 这类 shell 依赖去完成 VFS/skill discovery。
- 变更优先从 `packages/contracts` 开始推导，再改 `core` 和 substrate。

## 4. Repo Index

### 4.1 Contracts / Canonical Model

- `packages/contracts/src/index.ts`
  - `CapabilityDescriptor`
  - `ExecutionBinding`
  - `ToolContract`
  - `CapabilityError`
  - skill lifecycle state machine
- `packages/contracts/test/contracts.spec.ts`
  - descriptor 合法性
  - tool projection
  - lifecycle / trusted flag
  - session / run state / loop turn / compaction type validity
  - kernel adapter interface shapes

### 4.2 Core / Capability API

- `packages/core/src/index.ts`
  - `BUILTIN_CAPABILITIES`
  - `CapabilityRegistry`
  - `FamilyProviderRegistry`
  - `createSkillRuntimeContext()`
  - permission check / trace / reentrancy guard
- `packages/core/test/core.spec.ts`
  - public namespace coverage
  - family provider dispatch
  - `ctx.call()`
  - `ctx.capabilities.*`
  - recursion blocking

### 4.2.1 Kernel / Browser Brain Mainline

- `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
  - 当前为什么要把主线切回 browser-side kernel
- `docs/kernel-skeleton-design.md`
  - `packages/kernel` 的骨架、切片和边界
- `packages/kernel/src/`
  - 当前 kernel 相关实现入口
  - 重点关注 `session-store.ts`、`in-memory-session-storage.ts`

### 4.3 BrowserVFS

- `packages/browser-vfs/src/index.ts`
  - `resolveMemUri()`
  - `BrowserVfs`
  - `IndexedDbVfsStore`
  - scopes: `ephemeral / workspace / library`
  - ops: `read/write/edit/stat/list/mkdir/rm/mv/copy/stage/snapshot/rehydrate`
- `packages/browser-vfs/test/browser-vfs.spec.ts`
  - write-through persistence
  - quota
  - snapshot / rehydrate

### 4.4 JS Runner

- `packages/js-runner/src/index.ts`
  - `JsRunnerHost`
  - isolated invocation
  - timeout / abort
  - `new Function()` module loader
- `packages/js-runner/test/js-runner.spec.ts`
  - ctx/input injection
  - per-invocation isolation
  - timeout contract

### 4.5 Site Runtime

- `packages/site-runtime/src/index.ts`
  - `SiteSkillRegistry`
  - `SiteSkillRuntime`
  - active-tab metadata match
  - explicit install on invoke
  - verifier flow
- `packages/site-runtime/test/site-runtime.spec.ts`
  - active-tab gating
  - content/main install order
  - action + verifier trace

### 4.6 Kernel

- `packages/kernel/src/index.ts`
  - `SessionStore`
  - `InMemorySessionStorage`
  - `RunController` / `RunEvent`
  - `LoopEngine` / `StepRequest` / `StepResult` / `LoopEngineOptions`
  - `CompactionManager` / `CompactionOptions` / `CompactionPreparation`
  - `createKernel` / `Kernel` / `KernelOptions`
- `packages/kernel/src/session-store.ts`
  - session lifecycle
  - compaction-aware context rebuild
- `packages/kernel/src/in-memory-session-storage.ts`
  - `SessionStorage` 接口的内存实现（测试用）
- `packages/kernel/src/run-controller.ts`
  - `RunState` state machine (idle → running → paused/stopped/compacting)
  - prompt queue (steer/followUp)
  - retry strategy with max attempts
- `packages/kernel/src/loop-engine.ts`
  - turn scheduling / step counting
  - terminal condition detection (maxSteps / failed / verified / user_stop)
  - no-progress detection (repeat_signature / ping_pong) with budget
- `packages/kernel/src/compaction-manager.ts`
  - threshold-based compaction trigger
  - prepare → execute (LLM call) → apply cycle
  - iterative compaction with previous summary (pi-mono pattern)
- `packages/kernel/src/kernel-facade.ts`
  - `createKernel()` unified API facade
  - session / run / queue / loop / compaction 统一入口
  - 子系统直接访问 (`sessions`, `runs`, `loop`, `compaction`)
- `packages/kernel/test/session-store.spec.ts`
  - session CRUD
  - entry parentId chain
  - context build (with/without compaction)
  - multiple compaction handling
- `packages/kernel/test/run-controller.spec.ts`
  - phase transitions / illegal transitions
  - queue steer/followUp
  - retry management
- `packages/kernel/test/loop-engine.spec.ts`
  - turn creation / result recording
  - terminal conditions
  - no-progress detection / session reset
- `packages/kernel/test/compaction-manager.spec.ts`
  - shouldCompact threshold
  - full compaction cycle (prepare → execute → apply)
  - iterative compaction with previous summary
- `packages/kernel/test/kernel-facade.spec.ts`
  - session lifecycle integration
  - run lifecycle integration
  - queue integration
  - loop turn integration
  - triggerCompaction end-to-end

### 4.7 Skill SDK

- `packages/skill-sdk/src/index.ts`
  - 当前是 thin facade
  - 未来放 `defineSkill()`、skill author helpers、typed namespaces

### 4.8 MV3 Shell

- `apps/mv3-shell/manifest.json`
  - 最小 MV3 壳
  - `offscreen`/`tabs`/`scripting`
- `apps/mv3-shell/src/background.js`
  - background worker 入口
- `apps/mv3-shell/src/offscreen.html`
- `apps/mv3-shell/src/offscreen.js`
  - runner host/offscreen 容器入口
- `apps/mv3-shell/src/page-hook.js`
  - MAIN world 注入脚本占位
- `apps/mv3-shell/test/manifest.spec.ts`
  - manifest 契约

## 5. Concept Lookup

| Concept | Start Here |
|---|---|
| canonical capability model | `packages/contracts/src/index.ts` |
| tool projection | `packages/contracts/src/index.ts` |
| builtin capability catalog | `packages/core/src/index.ts` |
| capability routing / provider dispatch | `packages/core/src/index.ts` |
| skill ctx / permission model | `packages/core/src/index.ts` |
| skill call depth limit | `packages/contracts/src/index.ts` + `packages/core/src/index.ts` |
| `mem://` URI rules | `packages/browser-vfs/src/index.ts` |
| workspace/library persistence | `packages/browser-vfs/src/index.ts` |
| version snapshot model | `packages/browser-vfs/src/index.ts` |
| runner isolation / timeout | `packages/js-runner/src/index.ts` |
| active-tab site activation | `packages/site-runtime/src/index.ts` |
| verifier contract | `packages/site-runtime/src/index.ts` |
| session model / run state / loop turn | `packages/contracts/src/index.ts` |
| session store / context build | `packages/kernel/src/session-store.ts` |
| run state machine / retry | `packages/kernel/src/run-controller.ts` |
| loop turn scheduling / no-progress | `packages/kernel/src/loop-engine.ts` |
| compaction trigger / LLM summarization | `packages/kernel/src/compaction-manager.ts` |
| kernel unified API facade | `packages/kernel/src/kernel-facade.ts` |
| compaction contract | `packages/contracts/src/index.ts` |
| kernel LLM adapter / session storage interface | `packages/contracts/src/index.ts` |
| kernel skeleton design | `docs/kernel-skeleton-design.md` |
| MV3/offscreen shell | `apps/mv3-shell/` |

## 6. Old Repo Lookup Index

旧仓根路径：`/Users/envvar/work/repos/browser-brain-loop`

### 6.1 Kernel / Capability / Routing

| Old Path | Why It Matters |
|---|---|
| `extension/src/sw/kernel/types.ts` | 旧 `executeStep()` 能力调用类型 |
| `extension/src/sw/kernel/orchestrator.browser.ts` | 旧内核 capability-first 真实入口 |
| `extension/src/sw/kernel/tool-provider-registry.ts` | 旧 provider 选择骨架 |
| `extension/src/sw/kernel/extension-api.ts` | capability provider 注册 API |
| `extension/src/sw/kernel/loop-tool-dispatch.ts` | 旧 tool -> capability 路由硬编码 |
| `extension/src/sw/kernel/loop-shared-types.ts` | 旧 capability 常量 |

### 6.2 Skill / Plugin / Runtime

| Old Path | Why It Matters |
|---|---|
| `extension/src/sw/kernel/runtime-router/skill-controller.ts` | 旧 skill 安装/加载/发现 |
| `extension/src/sw/kernel/skill-registry.ts` | 旧 skill 注册 |
| `extension/src/sw/kernel/plugin-runtime.ts` | 旧 plugin runtime |
| `extension/src/sw/kernel/runtime-router/plugin-sandbox.ts` | 旧 plugin sandbox；vNext 要被 JS Runner 取代 |
| `extension/src/sw/kernel/runtime-router.ts` | 旧 runtime 路由总入口 |
| `extension/src/panel/plugin-studio-main.ts` | 旧 Plugin Studio UI 起点 |

### 6.3 VFS / Sandbox / LIFO

| Old Path | Why It Matters |
|---|---|
| `extension/src/sw/kernel/virtual-fs.browser.ts` | 旧 `mem://` 入口 |
| `extension/src/sw/kernel/browser-unix-runtime/lifo-adapter.ts` | 旧 LIFO 适配层，迁移清单来源 |
| `extension/src/sw/kernel/browser-unix-runtime/virtual-path-resolver.ts` | 旧 path/scope 解析参考 |
| `extension/src/sw/kernel/virtual-resource-ops.ts` | 旧 shell 依赖点；vNext 应避免 |

### 6.4 Browser / Site Automation

| Old Path | Why It Matters |
|---|---|
| `extension/src/content/dom-snapshot-collector.ts` | DOM snapshot content script |
| `extension/src/sw/kernel/dom-locator.ts` | DOM action 执行器 |
| `extension/src/sw/kernel/automation-mode.ts` | focus/background 自动化模式 |
| `extension/src/sw/kernel/runtime-loop.browser.ts` | runtime loop 与 verify 语义 |

### 6.5 Old Docs Worth Reading

| Old Path | Why It Matters |
|---|---|
| `docs/skill-runtime-site-capability-redesign-2026-03-29.md` | 本仓顶层设计来源 |
| `docs/kernel-architecture.md` | 旧大脑结构总览 |
| `docs/background-mode-design-2026-06.md` | browser automation/background 模式设计 |
| `docs/debug-interfaces.md` | 调试接口入口 |
| `docs/diagnostics-format.md` | 诊断格式 |
| `docs/runtime-debug-interface.md` | 运行态调试接口 |

## 7. External Reference Index

| Repo | Use For |
|---|---|
| `~/work/repos/_research/pi-mono/` | canonical model、registry/projection 思路 |
| `~/work/repos/_research/AIPex/` | DOM snapshot、action、stabilization、CDP |
| `~/work/repos/_research/opencli/` | bridge 薄层、adapter/auth 分层 |
| `~/work/repos/_research/bb-browser/` | 真实浏览器即 API、site 包 |
| `~/work/repos/_research/bb-browser/bb-sites/` | 单站点单能力包设计 |

## 8. Current Status

- 当前 v0 已完成的范围见 `docs/v0-slice.md`。
- v0 的准确定位：
  - 已完成 substrate / control-plane primitive foundation
  - 还没有达到 browser-side kernel parity
- 当前主线：
  - `packages/kernel`
  - session / run / compaction 骨架
  - diagnostics / intervention / browser automation 后续收口
- 当前次级 open queue：
  - operability
  - site-runtime automation
  - js-runner real local host adapter
  - DX / 测试补洞

## 9. Workflow

- backlog 派工入口：`docs/backlog/README.md`
- 当前 batch 指针：`docs/next-development-slices-2026-03-29-batch-7.md`
- 历史批次索引：`docs/next-development-slices-2026-03-29.md`
- Agent 工作流说明：`docs/multi-agent-workflow.md`
- 统一 workflow skill：`.agents/skills/agent-workflow-next/`
- claim skill：`.agents/skills/auto-claim-issues-next/`
- batch planning skill：`.agents/skills/next-batch-planner/`
- 所有 Agent 默认能力相同；差异来自当前状态和当前上下文
- role prompt 只作为可选 stance overlay，不是系统前提
- claim / done 回写只在 canonical workspace 可靠
- 真正 claim 时，`assignee` 必须写 Agent 自己选定并持续复用的名字，不能写通用 `agent`
- 若 claim 预览返回无可认领 issue，当前 Agent 必须进入下一批规划，而不是默认停工

## 10. Commands

- `bun install`
- `bun run test`
- `bun run typecheck`
- `bun run check`
- `BBL_AGENT_NAME=<agent-name> bun run workflow:claim:preview`
- `BBL_AGENT_NAME=<agent-name> bun run workflow:claim`
- `BBL_AGENT_NAME=<agent-name> bun run workflow:claim:json`
- `bun run workflow:claim -- --name=<agent-name>`
- `bun run workflow:plan:preview`
- `bun run workflow:plan`
- `bun run workflow:plan:json`
- `bun run workflow:new-review-issue -- --title=... --group=... --epic=... --acceptance-ref=... --scope=... --accept=...`

## 11. First Places To Read Before Changing Code

1. `docs/start-here.md`
2. `docs/source-of-truth-map.md`
3. `docs/locked-decisions-2026-03-29.md`
4. `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
5. `docs/kernel-skeleton-design.md`
6. `docs/v0-slice.md`
7. `docs/legacy-reference-map.md`
8. `docs/backlog/README.md`
9. `docs/multi-agent-workflow.md`
10. 对应 issue / 对应 package 的 `src/` 和 `test/`
