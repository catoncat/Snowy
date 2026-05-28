# AGENTS.md

## 0. Fast Index

| 我现在要做什么 | 先读什么 | 做完前必须补什么 |
|---|---|---|
| 认领 / 判断下一个 issue | `docs/agent-task-index.md` → `docs/workflow/live-queue.json` | 真正 claim 只看 queue + lease，不扫 backlog |
| 实现已认领 issue | 当前 issue → `acceptance_ref` → 对应 `src/` / `test/` | 聚焦验证；不要顺手修 write scope 外 |
| 收口已完成 issue | 当前 issue → `docs/backlog/README.md` 的 Completion Record | code commit + `status: done` + `## 工作总结` + `## 相关 commits` |
| queue / backlog 变了 | `docs/backlog/README.md` | `bun run workflow:queue:build` |
| queue 为空且 cutover gate 绿 | `docs/release-cutover-decision-packet-2026-05-27.md` → `docs/cutover-readiness-criteria.md` | 推进 PR / CI / 外部验收决策；不要默认拆新小票 |
| 规划下一批 | `docs/source-of-truth-map.md` → `docs/module-tracking-ledger.json` → `docs/backlog/README.md` | 先落 backlog，再重建 queue |
| 改 architecture / public surface | `docs/locked-decisions-2026-03-29.md` → review report → kernel skeleton | 过 Doc Freshness Gate |

- 一句话规则：先锁任务，再补最小上下文；完成任务不等于写完代码，必须完成 commit 和 issue 收口；如果已经进入 cutover 交付阶段，不要把 deferred breadth 自动拆成下一批 queue。

## 1. Repo Mission

- 本仓是 Browser Brain Loop 的 vNext 主线实验仓。
- 目标：去掉 `LIFO/browser_bash`，重建 `AI Surface + Browser-side Kernel + BrowserVFS + JS Runner + Site Runtime + Execution Host`。
- 产品面只保留一个概念：`Skill`。
- 产品对 AI 暴露统一 `AI Surface`；其中 invokable actions 继续通过 `Capability API` 暴露。
- 默认不做 legacy/fallback 设计；旧仓只作行为和概念参考，不作兼容前提。
- 当前阶段判断：repo-side Level 2 cutover evidence 已可由 `bun run release:acceptance` / `bun run release:cutover:status` 刷新；当前默认主线是 cutover delivery / 外部验收，而不是继续补零散 deferred breadth。
- planning truth 是 `docs/module-tracking-ledger.json`。
- dispatch truth 是 `docs/workflow/live-queue.json` + `~/.codex/workflow-leases/browser-brain-loop-next.json`。
- planning 是 agent 原生的 reflection / recommendation 环节，不是脚本驱动的自动派工器。
- queue / lease / metadata 校验可以脚本化，但“下一步做什么”必须由 agent 结合主线、代码、测试和当前上下文判断。
- 当 queue 为空、lease 为空且 `release:cutover:status` 绿时，下一步是推动 review / CI / release acceptance / old-mainline cutover decision；只有该 gate 暴露真实产品缺口时，才回到 milestone planning。

## 1.1 Mandatory Onboarding

- 任何新进入本仓的 agent，在动代码前先读：
  1. `docs/agent-task-index.md`
- 然后只按当前任务类型补读，不要默认全量读文档：
  - claim / workflow：`docs/workflow/live-queue.json`
  - implement claimed issue：当前 issue + `acceptance_ref` + 对应 `src/` / `test/`
  - finish / close issue：当前 issue + `docs/backlog/README.md`
  - planning：`docs/source-of-truth-map.md` + `docs/module-tracking-ledger.json` + `docs/backlog/README.md`
  - architecture / public surface：`docs/locked-decisions-2026-03-29.md` + `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md` + `docs/kernel-skeleton-design.md`
- 如果要改 architecture-level 代码，再去读旧仓：
  - `/Users/envvar/work/repos/snowy/browser-brain-loop/docs/skill-runtime-site-capability-redesign-2026-03-29.md`
  - `/Users/envvar/work/repos/snowy/browser-brain-loop/docs/kernel-architecture.md`

## 2. Architecture North Star

- `CapabilityDescriptor` 是 action canonical model。
- `ToolContract` 是 action projection，不是完整 AI Surface 本体。
- 产品 AI Surface 同时包含 actions、resources、events/audit、skills/workflows。
- 文档系统分为 locked / workflow-control / behavior-truth / reference 四类。
- `BrowserVFS` 负责 `mem://` 与持久化，不再依赖 shell。
- `JS Runner Host` 负责执行用户/skill 代码，不在 SW 直接跑动态模块。
- `Site Runtime` 负责 active-tab match、按需注入、action、verifier。
- 浏览器是控制中枢；`Execution Host` 是一等执行面，可本地也可远程。
- 早期架构主线是补回 `packages/kernel` 这一层 browser-side brain；当前 cutover 交付阶段不要再用 deferred breadth 重新横向扩 substrate。
- `packages/kernel` 负责 session / run / compaction / diagnostics / intervention 主层。
- planning 默认按模块台账推进：module stage → module order → issue priority。
- dispatch 默认按 live queue 推进：queue entry order → active lease exclusion。
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
- 默认假设有别的 Agent 在并行开发；看到陌生 diff 先判断是否为并行改动，不要直接回滚。
- 共享文件不是自动禁区；若不存在真实前后依赖，可以在独立 worktree 中并行推进，但要保持改动最小、提交小步，并显式意识到可能存在并行编辑。
- 验证默认先做自己 `write_scope` 内的聚焦 lint / test；repo 级 `bun run check` 若被其他活跃 slice 阻塞，要记录 blocker，不顺手修 unrelated 文件。
- 提交默认小步、单一目的，减少并行冲突与共享文件重写。

## 3.1 Completion Contract

- 一个 issue 只有在下面都完成后才算 done：
  1. 代码改动已提交 commit
  2. issue frontmatter 已改 `status: done`
  3. issue 已追加 `## 工作总结`
  4. issue 已追加 `## 相关 commits`
  5. 若 backlog 元数据变化影响 dispatch，已执行 `bun run workflow:queue:build`
- 不要把“测试过 / 代码写完 / 本地能跑”当成 issue 已收口。
- 如果 repo 级 gate 被并行改动挡住，仍要把 blocker 和已通过的聚焦验证写进 issue。

## 3.2 Planning Contract

- planning 的首要职责不是“再找几个 gap”，而是重新确认 repo 当前最值得推进的 milestone。
- planning 必须显式包含：
  1. `North Star Check`
  2. `Batch Retrospective`
  3. `Rot / Freshness Check`
  4. `Recommended Next Milestone`
  5. `Not Now`
- planning 不是命令输出的同义词；命令只负责事实收集、落盘和最小校验，不代替 agent 的判断、推荐和反省。
- planning 使用的参考文档默认都可能腐坏；必须把文档视为候选真相，而不是静态真理。
- 对“当前行为是否真的如此”“某个能力是否已经 landed”“某个 gap 是否仍存在”的判断，优先回到 `src/` + `test/` + 最近已完成 issue / commits 验证。
- 如果 ledger、review、batch、issue 与代码现状不一致，planning 应先指出失真并优先安排 truth-repair，而不是继续沿着旧文档机械拆票。
- 并非每个 review finding 都值得变成下一批 issue；只有能推进 module stage、解除真实阻塞、修复真相源腐坏，或明显影响当前 cutover/gate 的 finding 才应进入推荐集。

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

旧仓根路径：`/Users/envvar/work/repos/snowy/browser-brain-loop`

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

- 当前 repo-side Level 2 cutover evidence 已完整，见 `docs/level-2-cutover-acceptance-2026-05-27.md`。
- 当前交付入口是 `docs/release-cutover-decision-packet-2026-05-27.md`。
- 默认刷新命令：
  - `bun run release:acceptance`
  - `bun run release:cutover:status`
- 当前主线不是继续拆 issue 补 deferred breadth，而是推动外部 release acceptance / old-mainline cutover decision。
- secondary / deferred 的当前可做项以 `docs/migration-parity-dashboard.md` / `docs/module-tracking-ledger.json` 为候选真相；只有被明确提升为产品主线时才进入 queue。

## 9. Workflow

- backlog 规则：`docs/backlog/README.md`
- live dispatch queue：`docs/workflow/live-queue.json`
- live lease file：`~/.codex/workflow-leases/browser-brain-loop-next.json`
- 历史 batch / planning snapshot：`docs/next-development-slices-2026-03-29.md`
- Agent 工作流说明：`docs/multi-agent-workflow.md`
- 统一 workflow skill：`.agents/skills/agent-workflow-next/`
- claim skill：`.agents/skills/auto-claim-issues-next/`
- batch planning skill：`.agents/skills/next-batch-planner/`
- 所有 Agent 默认能力相同；差异来自当前状态和当前上下文
- role prompt 只作为可选 stance overlay，不是系统前提
- queue build 由 backlog + module ledger 生成；claim path 本身不再扫描 backlog
- live ticket 只通过 lease 文件加锁；`in-progress` 不再是 dispatch lock
- `write_scope` 是协调提示，不是 dispatch 锁；除非 issue 之间存在真实前后依赖，否则不要只因为会改同一文件就阻止 claim
- batch 文档只是历史 planning snapshot；当前 dispatch 只看 live queue + lease
- backlog 变化后必须重建 live queue，至少包括：新增 issue、改 `done`、改 `depends_on`、改 `write_scope`
- 若 live queue 返回空，先判断是否需要重建 queue；确认无票且无 active lease 后先运行 `bun run release:cutover:status`。gate 绿则进入 cutover delivery，不进入下一批规划；gate 暴露真实产品缺口时才规划 backlog。
- issue 一旦明确或 claim 成功，默认直接推进到验证、commit、issue 收口，不要把“是否继续”当成中断点
- planning commit 完成后默认继续 queue rebuild -> claim loop；只有遇到真实 blocker（缺失真相源、越权改动、外部输入、并行冲突无法自行化解）才停下来问
- worker 默认只对自己当前 slice / `write_scope` 的聚焦验证负责；repo 级 gate 是补充，不是并行情况下的唯一完成依据
- 若 repo 级 lint / check 被别的 Agent 的活跃改动挡住，必须在 issue `## 工作总结` 里写明 blocker 和自己已通过的聚焦检查
- 共享接线文件优先交给 integrator 或对应 lane owner；但共享写域重叠只是一种协调信号，不应替代真实 `depends_on`
- 不要因为共享文件出现陌生改动就直接 revert；先看 lease / queue / issue owner，再决定是否需要协调

## 10. Commands

- `bun install`
- `bun run test`
- `bun run typecheck`
- `bun run check`
- `./node_modules/.bin/biome check <files...>`（推荐：只检查当前 slice 相关文件）
- `bun run workflow:queue:build`
- `bun run workflow:queue:preview`
- `bun run workflow:queue:json`
- `BBL_AGENT_NAME=<agent-name> bun run workflow:claim:preview`
- `BBL_AGENT_NAME=<agent-name> bun run workflow:claim`
- `BBL_AGENT_NAME=<agent-name> bun run workflow:claim:json`
- `bun run workflow:claim -- --name=<agent-name>`
- `bun run workflow:plan:preview`
- `bun run workflow:plan`
- `bun run workflow:plan:json`
- `bun run workflow:new-review-issue -- --module=... --title=... --epic=... --acceptance-ref=... --scope=... --accept=...`

## 11. First Places To Read Before Changing Code

1. `docs/agent-task-index.md`
2. 当前任务对应的最小 read path
3. 当前 issue / 当前 package 的 `src/` 和 `test/`

<!-- mainline:agents:start version=28 checksum=sha256:7d47b5355fb5a47f07d94fb2efc10dd0d5441f8f93d91b63bd95ae54ab8a40ac -->
## Mainline

<!-- mainline-agents-md-version: 28 -->

**Stop AI coding agents from repeating old engineering mistakes.**

This repository uses Mainline, a Git-native memory layer that tells coding agents why the code is the way it is before they edit it. Agents must use the Mainline skill workflow for non-trivial engineering work and read agent autonomy stop lines from preflight/status. Autonomy is advisory; hard gates and current user instructions take priority. Review autonomy may push a non-main branch and stops at PR; it never authorizes pushing main, merge, or release. Seal-time conflicts are phase-1 overlap warnings: agents classify overlap warnings before escalating and do not paste raw JSON by default. mainline publish publishes intent metadata, not product releases. mainline agents update refreshes this repo guidance; update global skills separately with npx --yes skills update mainline --global --yes or the matching skills add.
<!-- mainline:agents:end -->
