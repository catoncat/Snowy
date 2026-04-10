# Legacy To vNext Migration Matrix

本文件解决两个问题：

1. 旧仓到底有哪些能力面需要迁到新仓
2. 每一块在新仓里现在处于什么状态

它是迁移控制面文档，不是 backlog，也不是 planning。

## 状态图例

- `v0-shipped`
- `partial`
- `review-gap`
- `not-started`
- `intentionally-dropped`

## 迁移原则

- 文档定义 intent，不单独定义行为
- 行为真相仍以代码 + 测试为准
- 迁移优先看“用户能力是否保留”，不是旧接口是否逐字照搬

## Matrix

| Legacy Area | Old Repo Source | vNext Target | Disposition | Current Status | Proof / Gap |
|---|---|---|---|---|---|
| canonical tool / capability model | `tool-contract-registry.ts`, `tool-provider-registry.ts`, `loop-tool-dispatch.ts` | `packages/contracts`, `packages/core` | replace-with-descriptor | `v0-shipped` | descriptor / projection / registry / ctx / invoke 已有测试，且 action/resource/workflow 边界已显式锁定 |
| skill permission / trace / nested invoke | orchestrator + skill runtime | `packages/core` | keep-and-tighten | `v0-shipped` | trace / nested invoke / permission clamp 已有测试 |
| skill package install / metadata / content injection | `skill-registry.ts`, `skill-content-resolver.ts`, `skill-create.ts` | `packages/skill-sdk`, BrowserVFS, future Studio | replace-and-simplify | `partial` | SDK 和 authoring 有基础，完整管理面未完成 |
| plugin runtime as extension model | `plugin-runtime.ts`, `plugin-sandbox.ts` | executable Skill + JS Runner | hard-cutover | `partial` | 方向已锁，完整收拢未完成 |
| Plugin Studio UI | `plugin-studio-main.ts` | future Skill Studio | replace | `not-started` | 只有方向，没有产品主链 |
| browser sandbox shell / `browser_bash` | `lifo-adapter.ts`, prompt policy | BrowserVFS + JS Runner + capabilities | intentionally-drop-old-center | `intentionally-dropped` | 不再把 shell 当中心能力 |
| host shell / `host_bash` | bridge + old tool contracts | execution host substrate + `hosts.*` control plane | promote-and-simplify | `partial` | `hosts.*` control plane、`host.read/write/edit/exec` contract、default-host routing 已落地；默认 offscreen local adapter 继续承担读写编辑（ISSUE-038），remote host record / default exec routing 已由 ISSUE-125 收口；剩余 gap 是 concrete remote transport/health handshake 仍是 injectable bridge，尚未达到多 remote host parity |
| settings / runtime / skill management UI | panel stores + settings / skills / plugins surfaces | AI-native product control plane (`runtime.*` / `config.*` / `skills.*` / `hosts.*` / `audit.*`) | replace-with-control-plane | `partial` | bootstrap summary、轻量 `runtime.summary/config.summary/skills.summary/hosts.summary/audit.tail` resource contract、`readAiSurfaceResource()` / MV3 `resource.read` 统一 lookup、`runtime.capture_diagnostics` / `runtime.clear_error`、最小本地 `hosts.*` / `config.update` / `skills.install/enable/disable/uninstall` 与统一 `audit.tail` app read path 已落地；`ISSUE-085` 仅补了 sidepanel chat shell，真正 management consumer 仍由 `ISSUE-093` 承接，且必须继续复用 shared resource/action path，不回退到 app-local state |
| `mem://` virtual FS | `virtual-fs.browser.ts`, `lifo-adapter.ts` | `packages/browser-vfs` | keep-and-rebuild | `v0-shipped` | read/write/snapshot/quota/package discovery 已测 |
| canonical skill package URI | old `mem://skills/...` path semantics | `packages/browser-vfs` | keep-and-tighten | `v0-shipped` | canonical `mem://skills/...` round-trip 已有测试 |
| JS plugin sandbox / dynamic code execution | `plugin-sandbox.ts` | `packages/js-runner` + `apps/mv3-shell` | replace | `v0-shipped` | runner + health + cancel + offscreen bridge 已测 |
| MV3 shell / offscreen host container | extension SW + sandbox page | `apps/mv3-shell` | keep-and-rebuild | `v0-shipped` | offscreen bridge + explicit page-hook bridge 已有测试 |
| site activation / page hook / verifier | `dom-snapshot-collector.ts`, `dom-locator.ts`, runtime loop | `packages/site-runtime` + `apps/mv3-shell` | keep-and-rebuild | `v0-shipped` | active-tab boundary、explicit invoke、real injection chain 已有测试 |
| browser automation / background mode | `automation-mode.ts`, `stealth-tab.ts`, `background-failure-tracker.ts` | future `page.*` / `site.*` substrate | keep-core-ability | `review-gap` | 边界已裁决（见 `docs/background-automation-mode-boundary.md`）：background mode 与 background-specific failure tracking 均后置到 cutover 后；cutover 前仅保留 kernel no-progress / diagnostics / verify 作为极简替代物 |
| screenshot / visual / download utilities | old builtin tools | future capability families | keep-by-capability | `partial` | 边界已裁决且最小截图路径已落地（见 `docs/screenshot-download-surface-boundary.md`）：`page.screenshot` 已由 `ISSUE-057` 落地；`screenshot_with_highlight` 为 Tier 2 composite；download 延后到 product/workflow 层 |
| interventions / human handoff | intervention tools + panel UI | runtime handoff contract + future kernel / studio lifecycle | replace-and-phase | `partial` | cutover 前必需地位已锁定；`packages/site-runtime` 已能对 verify/runtime blocked 返回结构化 intervention request，kernel / MV3 的 request/resolve/cancel/timeout/audit 已具备 durable restart round-trip；剩余 gap 主要是 product/studio 层的人机接管 UI |
| tab / page interaction tools | old builtin page/tab tools | public namespaces `page.*`, `tabs.*` | replace-with-public-api | `partial` | 最小 public automation path 已锁定（见 `docs/page-tabs-public-automation-path.md`）：Tier 1 = page.query/click/fill/press_key/screenshot + tabs.get_active/navigate；`tabs.navigate` 已由 `ISSUE-058` 落地，`page.press_key` / `page.screenshot` 已由 `ISSUE-057` 落地；剩余 gap 是 `page.query/click/fill` production path |
| LLM provider registry / profile routing | `llm-provider-registry.ts`, profile resolver | provider/profile layer in `packages/kernel` | keep-core-idea | `partial` | `packages/kernel` 已有 `LlmProviderRegistry`、`resolveLlmRoute()`、OpenAI-compatible provider、kernel LLM adapter 与对应测试；剩余 gap 是 retry escalation、available skills/shared tabs context 注入与 provider policy hardening |
| orchestration/session/run queue/compaction | `BrainOrchestrator`, session manager, loop | browser-side kernel mainline in `packages/kernel` | keep-product-capability | `partial` | `SessionStore` / `RunController` / `LoopEngine` / `CompactionManager` / `createKernel()` / `runLoop()` / `buildSystemPromptBase()` 已落地并有测试；剩余 gap 是 prompt/context policy、failure tracking 与 MV3 end-to-end wiring 完整收口 |
| hooks system / extension points | `hook-runner.ts`, plugin hooks | future executable Skill setup hooks | replace-and-simplify | `partial` | `packages/skill-sdk` 已提供 install-only declarative setup hook contract 与 `runSkillSetupHooks()` 计划 runner；剩余 gap 是 authoring docs、runtime 接线与更丰富 phase 仍未定义 |
| diagnostics / runtime debug / audit | debug snapshot + diagnostics HTTP | future observability layer | keep-and-rebuild | `partial` | 轻量 summary / `audit.tail` resource contract、runtime diagnostics action、以及覆盖 `hosts.*` / `config.update` / `skills.*` lifecycle 的统一 `audit.tail` app integration path 已落地；但仍没有旧仓同等级 debug 面 |
| MCP export / external capability bridge | bridge + export plan | bridge-side MCP export | defer-but-required | `partial` | descriptor-derived handoff contract 已有代码和测试；真正 bridge-side MCP server/transport 仍未实现 |
| Skill Studio / versions / lifecycle UI | old panel skills/plugins UI | future Skill Studio | keep-product-need | `not-started` | 生命周期模型有，产品 UI 没有；Soft Gate 1 已裁决为 cutover 后补，但后续实现边界已由 `ISSUE-093` 锁定为 shared control-plane consumer |

## 明确不按旧仓原样迁的东西

| Legacy Thing | Why Not Preserve As-Is | vNext Replacement |
|---|---|---|
| `browser_bash` 作为浏览器内通用执行中心 | 把 shell 误当主能力面 | `BrowserVFS + JS Runner + Capability API` |
| `Plugin` 作为主产品概念 | 与 `Skill` 重叠 | executable `Skill` |
| `ToolContract` 作为唯一真相源 | 不能统一投影到 SDK / MCP / runtime | `CapabilityDescriptor` |
| `<all_urls>` + 宽松站点权限默认 | 与 active-tab-only 北极星冲突 | active-tab metadata only + explicit invoke |
| 旧工具名全集直接平移 | 新仓优先收敛 public capability namespace | `page.*`, `tabs.*`, `site.*`, `memfs.*`, `skills.*`, `runtime.*` |

## 对完整迁移最关键的未收口区域

1. browser automation / screenshot / download 的剩余 runtime integration 与 intervention lifecycle 是否真正闭环
2. kernel prompt / context / provider policy / diagnostics / observability 主链
3. Skill Studio / lifecycle / versioning 产品面

## 如何使用本文件

- 判断某块旧功能是否已迁：先查本表，再去代码/测试验证
- 新开迁移 issue：先判断该 area 是 `partial`、`review-gap` 还是 `not-started`
- 判断能否切主线：继续看
  - `docs/migration-parity-dashboard.md`
  - `docs/cutover-readiness-criteria.md`
