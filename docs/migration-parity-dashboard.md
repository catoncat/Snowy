# Migration Parity Dashboard

这是迁移状态总览，不是详细设计文档。

## 图例

- `green`
- `yellow`
- `red`
- `gray`

## Dashboard

| Area | Status | Why |
|---|---|---|
| descriptor / contract / projection | `green` | canonical model、projection、registry 基础已成形，且 action-only 边界已显式锁定 |
| core runtime ctx / invoke | `green` | permissions / trace / nested invoke 已收口并有测试 |
| BrowserVFS baseline | `green` | read/write/snapshot/rehydrate/quota/package discovery 已落地 |
| BrowserVFS public skill URI parity | `green` | canonical `mem://skills/...` round-trip 已测 |
| JS Runner host | `green` | host / cancel / timeout / health / offscreen bridge 已测 |
| MV3 shell substrate | `green` | offscreen bridge 与显式 page-hook bridge 已测 |
| local execution host adapter | `yellow` | 默认 offscreen local adapter 已实现 read/write/edit（ISSUE-038）；remote exec path、single/multi remote host record、production config 与 restart rehydrate 已落地，但 local exec 与更广 execution-host cutover 仍未完成 |
| site runtime baseline | `green` | active-tab 边界、explicit invoke 与真实 injection chain 已测 |
| kernel session/run/compaction baseline | `green` | `SessionStore` / `RunController` / `LoopEngine` / `CompactionManager` / `createKernel()` / `runLoop()` / child-run seam 与 prompt context message wiring 已落地并有测试；剩余问题已转入 provider policy / observability 等相邻模块 |
| AI-native product control plane | `yellow` | 最小 `runtime/config/skills/hosts` bootstrap summary、轻量 `runtime.summary/config.summary/skills.summary/hosts.summary/audit.tail` resource contract、`readAiSurfaceResource()` / MV3 `resource.read` 统一 lookup、`runtime.capture_diagnostics` / `runtime.clear_error`、本地 `hosts.*` / `config.update` / `skills.install/enable/disable/uninstall` 与统一 `audit.tail` read path 已落地并有测试；`ISSUE-085` 已补 sidepanel chat shell，`ISSUE-093` 已补齐 shared control-plane management consumer；完整 Skill Studio / lifecycle UI 仍是 cutover 后项 |
| old browser automation parity | `yellow` | Tier 1/2/3 cutover boundary 已锁定；`tabs.navigate`、`page.query/click/fill`、`page.press_key`、`page.screenshot` 已落地；background mode / background-specific failure tracking 已明确后置（见 `docs/background-automation-mode-boundary.md`）；intervention 的 runtime handoff、durable restart round-trip、shared summary/audit read surface，以及 page action failure integration 已收口。剩余 gap 已转为更广的 browser automation breadth 与 cutover 后范围 |
| old visual/download/intervention parity | `yellow` | screenshot/download/intervention 边界已锁定：`page.screenshot` 已由 `ISSUE-057` 落地，intervention 的 request/resolve/cancel/timeout/audit、restart durability、shared sidepanel handoff UI 与 page action failure handoff 已落地；download 继续延后到 product/workflow 层，因此该组合 area 仍保持 `yellow` |
| skill SDK / authoring | `yellow` | typed facade 与文档已起步，完整 authoring/studio 不足 |
| plugin -> executable skill migration | `yellow` | 方向明确，但还不是可替代旧 plugin 生态的状态 |
| Skill Studio / lifecycle product surface | `red` | 生命周期模型有，产品 UI 没有；Soft Gate 1 已裁决为 cutover 后补；`ISSUE-093` 已完成 shared control-plane management consumer |
| provider / profile routing | `yellow` | `packages/kernel` 已有 provider health negotiation、lane-aware routing、ordered profile chain、retry escalation，以及 `primary / compaction / title` 的 runtime-owned baseline capability requirements；剩余 gap 是更细的 capability taxonomy、非 kernel 调用点 rollout 与更广 provider policy hardening |
| diagnostics / debug / audit | `yellow` | `runtime.capture_diagnostics` / `runtime.history` / `audit.tail` / `audit.intervention` / error lifecycle / provider routing diagnostics 已落地，满足 Gate F；更广 export surface（timeline / summary / rawEventTail）已显式延迟至依赖模块就绪后（详见 `docs/module-tracking-ledger.json` observability-audit 条目） |
| bridge-side MCP export | `yellow` | descriptor-derived handoff contract 已落地并有测试；真正 bridge-side MCP server/transport 仍未实现 |

## Current Gate View

### 已基本稳定的基础层

- descriptor / contract
- core invoke baseline
- BrowserVFS baseline
- JS Runner host
- MV3 shell substrate
- site runtime baseline

### 仍不能宣称“已完成迁移”的关键层

- AI-native product control plane
- provider / profile policy hardening
- 完整 browser automation 能力
- diagnostics / observability
- Skill Studio / lifecycle 产品面

## 文档维护规则

- 每次某个 area 状态变化时，同步更新本文件
- 若新增迁移 area，也先补到本文件
- 状态争议较大时，以：
  - 代码 + 测试
  - `docs/legacy-to-vnext-migration-matrix.md`
  - `docs/cutover-readiness-criteria.md`
  三者交叉判断
