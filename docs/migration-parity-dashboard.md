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
| local execution host adapter | `yellow` | 默认 offscreen local adapter 已实现 read/write/edit（ISSUE-038）；exec 需 remote host；remote host path 仍未实现 |
| site runtime baseline | `green` | active-tab 边界、explicit invoke 与真实 injection chain 已测 |
| kernel session/run/compaction baseline | `yellow` | `SessionStore` / `RunController` / `LoopEngine` / `CompactionManager` / `createKernel()` / `runLoop()` / `buildSystemPromptBase()` 已落地并有测试；剩余 gap 是 prompt/context injection、retry escalation、failure tracking 与 MV3 end-to-end 收口 |
| AI-native product control plane | `yellow` | 最小 `runtime/config/skills/hosts` bootstrap summary、轻量 `runtime.summary/config.summary/skills.summary/hosts.summary/audit.tail` resource contract、`readAiSurfaceResource()` / MV3 `resource.read` 统一 lookup、`runtime.capture_diagnostics` / `runtime.clear_error`、本地 `hosts.*` / `config.update` / `skills.install/enable/disable/uninstall` 与统一 `audit.tail` read path 已落地并有测试；剩余主缺口是完整 resource metadata registry / audience projection 与 product UI |
| old browser automation parity | `yellow` | Tier 1/2/3 cutover boundary 已锁定；`tabs.navigate`、`page.press_key`、`page.screenshot` 已落地；background mode / background-specific failure tracking 已明确后置（见 `docs/background-automation-mode-boundary.md`）；intervention 也已定性为 cutover 前必需的 runtime handoff contract，durable restart round-trip 与 shared summary/audit read surface 已补齐；剩余 gap 主要是 `page.query/click/fill` production path |
| old visual/download/intervention parity | `yellow` | screenshot/download/intervention 边界已锁定：`page.screenshot` 已由 `ISSUE-057` 落地，download 延后到 product/workflow 层；intervention 的 request/resolve/cancel/timeout/audit、restart durability 与 `runtime.summary.interventions` / `audit.intervention` 已落地，剩余 gap 主要是 product/studio 层接管 UI |
| skill SDK / authoring | `yellow` | typed facade 与文档已起步，完整 authoring/studio 不足 |
| plugin -> executable skill migration | `yellow` | 方向明确，但还不是可替代旧 plugin 生态的状态 |
| Skill Studio / lifecycle product surface | `red` | 生命周期模型有，产品 UI 没有 |
| provider / profile routing | `yellow` | `packages/kernel` 已有 `LlmProviderRegistry`、`resolveLlmRoute()`、OpenAI-compatible provider、kernel LLM adapter 与对应测试；剩余 gap 是 escalation、prompt enrichment 与 provider policy hardening |
| diagnostics / debug / audit | `red` | 轻量 `audit.tail` / summary resource contract 与覆盖 `hosts.*` / `config.update` / `skills.*` lifecycle 的统一 `audit.tail` app read path 已落地，但新仓仍没有旧仓同等级 debug/diagnostics 主面 |
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
- kernel orchestration / prompt policy hardening
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
