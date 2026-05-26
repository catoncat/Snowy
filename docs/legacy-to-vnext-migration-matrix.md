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
| skill package install / metadata / content injection | `skill-registry.ts`, `skill-content-resolver.ts`, `skill-create.ts` | `packages/skill-sdk`, BrowserVFS, future Studio | replace-and-simplify | `partial` | SDK 和 authoring 有基础；`ISSUE-172` 已证明代表性 executable skill 可经 shared MV3 runtime 完成 install/persist/enable/invoke/observe；`ISSUE-173` 已证明 `skills.install` setupPlan 可 materialize 到 `mem://skills/<skillId>/...`，重启后由 enabled skill 通过 `memfs.read` 读回。完整管理面、版本管理与 studio 仍未完成 |
| plugin runtime as extension model | `plugin-runtime.ts`, `plugin-sandbox.ts` | executable Skill + JS Runner | hard-cutover | `partial` | 方向已锁；`ISSUE-172` / `ISSUE-173` 已证明一条旧 plugin loop 可由 executable Skill 调用真实 `tabs.get_active` 能力、读取安装期 package 文件并通过 `audit.tail` 留证，完整生态收拢仍未完成 |
| Plugin Studio UI | `plugin-studio-main.ts` | future Skill Studio | replace | `not-started` | 只有方向，没有产品主链 |
| browser sandbox shell / `browser_bash` | `lifo-adapter.ts`, prompt policy | BrowserVFS + JS Runner + capabilities | intentionally-drop-old-center | `intentionally-dropped` | 不再把 shell 当中心能力 |
| host shell / `host_bash` | bridge + old tool contracts | execution host substrate + `hosts.*` control plane | promote-and-simplify | `partial` | `hosts.*` control plane、`host.read/write/edit/exec` contract、capability-aware host summary/default routing 已落地；默认 offscreen local adapter 的真实边界现已锁定为 browser-only file adapter：继续承担读写编辑与 offscreen diagnostics，而 true exec parity 由 exec-capable remote host path 承担（ISSUE-038 / ISSUE-073 / ISSUE-125 / ISSUE-126 / ISSUE-127 / ISSUE-134 / ISSUE-157 / ISSUE-165）。该 lane 在 parity matrix 里仍记为 `partial`，只是因为 vNext 刻意不再追求 old `host_bash` 的单一同质 host 幻觉；对应 planning ledger 已可按 cutover-critical shipped + deferred breadth 跟踪 |
| settings / runtime / skill management UI | panel stores + settings / skills / plugins surfaces | AI-native product control plane (`runtime.*` / `config.*` / `skills.*` / `hosts.*` / `audit.*`) | replace-with-control-plane | `partial` | descriptor-owned action projection、bootstrap summary、`runtime.summary/config.summary/skills.summary/hosts.summary/audit.tail` resource contract、`readAiSurfaceResource()` / MV3 `resource.read` 统一 lookup、`runtime.capture_diagnostics` / `runtime.clear_error`、最小本地 `hosts.*` / `config.update` / `skills.install/enable/disable/uninstall`、provider routing 的 `model.routing` shared control-plane、`ISSUE-093` 的 shared management consumer，以及 `ISSUE-172` / `ISSUE-173` 的 executable skill invoke + setupPlan materialization 纵向证明都已落地；该 row 保持 `partial` 仅因为完整 Skill Studio / lifecycle UI 仍是 cutover 后项，对应 planning ledger 已按 shipped-with-deferred-scope 追踪 |
| `mem://` virtual FS | `virtual-fs.browser.ts`, `lifo-adapter.ts` | `packages/browser-vfs` | keep-and-rebuild | `v0-shipped` | read/write/snapshot/quota/package discovery 已测 |
| canonical skill package URI | old `mem://skills/...` path semantics | `packages/browser-vfs` | keep-and-tighten | `v0-shipped` | canonical `mem://skills/...` round-trip 已有测试 |
| JS plugin sandbox / dynamic code execution | `plugin-sandbox.ts` | `packages/js-runner` + `apps/mv3-shell` | replace | `v0-shipped` | runner + health + cancel + offscreen bridge 已测 |
| MV3 shell / offscreen host container | extension SW + sandbox page | `apps/mv3-shell` | keep-and-rebuild | `v0-shipped` | offscreen bridge + explicit page-hook bridge 已有测试 |
| site activation / page hook / verifier | `dom-snapshot-collector.ts`, `dom-locator.ts`, runtime loop | `packages/site-runtime` + `apps/mv3-shell` | keep-and-rebuild | `v0-shipped` | active-tab boundary、explicit invoke、real injection chain 已有测试 |
| browser automation / background mode | `automation-mode.ts`, `stealth-tab.ts`, `background-failure-tracker.ts` | future `page.*` / `site.*` substrate | keep-core-ability | `review-gap` | 边界已裁决（见 `docs/background-automation-mode-boundary.md`）：background mode 与 background-specific failure tracking 均后置到 cutover 后；cutover 前仅保留 kernel no-progress / diagnostics / verify 作为极简替代物 |
| screenshot / visual / download utilities | old builtin tools | future capability families | keep-by-capability | `partial` | 边界已裁决且最小截图路径已落地（见 `docs/screenshot-download-surface-boundary.md`）：`page.screenshot` 已由 `ISSUE-057` 落地；`screenshot_with_highlight` 为 Tier 2 composite；download 延后到 product/workflow 层 |
| interventions / human handoff | intervention tools + panel UI | runtime handoff contract + future kernel / studio lifecycle | replace-and-phase | `v0-shipped` | cutover 前必需地位已锁定且最小主链已收口：`packages/site-runtime` 已能对 verify/runtime blocked 返回结构化 intervention request，kernel / MV3 已具备 request/resolve/cancel/timeout/audit、durable restart round-trip、跨端同步与 `runtime.summary.interventions` / `audit.intervention` shared read surface，shared sidepanel handoff UI 也已落地；更丰富的 studio/operator polish 继续由相邻产品面承接 |
| tab / page interaction tools | old builtin page/tab tools | public namespaces `page.*`, `tabs.*` | replace-with-public-api | `partial` | 最小 public automation path 已锁定（见 `docs/page-tabs-public-automation-path.md`）：Tier 1 = page.query/click/fill/press_key/screenshot + tabs.get_active/navigate；`tabs.navigate` 已由 `ISSUE-058` 落地，`page.query/click/fill` 已由 `ISSUE-154` 落地，`page.press_key` / `page.screenshot` 已由 `ISSUE-057` 落地，page action failure intervention lifecycle integration 已由 `ISSUE-152` 收口；剩余 gap 已转到更广的 browser automation breadth 与 cutover 后范围 |
| LLM provider registry / profile routing | `llm-provider-registry.ts`, profile resolver | provider/profile layer in `packages/kernel` | keep-core-idea | `partial` | `packages/kernel` 已有 `LlmProviderRegistry`、provider health negotiation、lane-aware routing、ordered profile chain、retry escalation、kernel LLM adapter，以及 `primary / compaction / title` 的 runtime-owned baseline capability requirements；shared control-plane 现已通过 `config.summary/config.update` 的 `model` + `model.routing` 合同暴露 provider override/policy state，`runtime-services` 也会把 shared `model.routing` 的 default/fallback/lane overrides rehydrate 回 runtime-owned provider profile config，并让 restart 后的 config summary 与 kernel active route 保持一致。该 row 继续记 `partial`，只因为 parity 视角下仍有非 kernel 调用点 rollout 与更广 provider policy hardening；对应 planning ledger 已可按 shipped-with-deferred-scope 跟踪 |
| orchestration/session/run queue/compaction | `BrainOrchestrator`, session manager, loop | browser-side kernel mainline in `packages/kernel` | keep-product-capability | `v0-shipped` | `SessionStore` / `RunController` / `LoopEngine` / `CompactionManager` / `createKernel()` / `runLoop()` / child-run seam 与 prompt context message wiring 已落地并有测试；更广 provider policy / diagnostics / observability 继续由相邻模块承接 |
| hooks system / extension points | `hook-runner.ts`, plugin hooks | future executable Skill setup hooks | replace-and-simplify | `partial` | `packages/skill-sdk` 已提供 install-only declarative setup hook contract 与 `runSkillSetupHooks()` 计划 runner；shared MV3 runtime 已能把 install setupPlan 写入 BrowserVFS package root；剩余 gap 是更丰富 phase、版本/rollback product UI 与 studio authoring 仍未定义 |
| diagnostics / runtime debug / audit | debug snapshot + diagnostics HTTP | future observability layer | keep-and-rebuild | `partial` | Gate F 的最小 operability surface 已 landed：轻量 summary / `audit.tail` resource contract、runtime diagnostics action、以及覆盖 `hosts.*` / `config.update` / `skills.*` lifecycle 的统一 `audit.tail` app integration path 已落地，timeline / summary / rawEventTail 也已通过 shared MV3 read path 暴露；该 row 仍记 `partial`，只因为旧仓同等级 debug 面、bulk export/persistent store 与更宽 event breadth 仍未补齐 |
| MCP export / external capability bridge | bridge + export plan | bridge-side MCP export | defer-but-required | `partial` | descriptor-derived handoff contract 已有代码和测试；真正 bridge-side MCP server/transport 仍未实现 |
| Skill Studio / versions / lifecycle UI | old panel skills/plugins UI | future Skill Studio | keep-product-need | `not-started` | 生命周期模型、shared management consumer、`ISSUE-172` 的 executable skill invoke proof 与 `ISSUE-173` 的 setupPlan materialization proof 已有；完整产品 UI、版本管理与 studio 仍没有；Soft Gate 1 已裁决为 cutover 后补 |

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
2. provider policy / diagnostics / observability 主链
3. Skill Studio / lifecycle / versioning 产品面，以及 executable Skill 旧产品替代链路的更广覆盖

## 如何使用本文件

- 判断某块旧功能是否已迁：先查本表，再去代码/测试验证
- 新开迁移 issue：先判断该 area 是 `partial`、`review-gap` 还是 `not-started`
- 判断能否切主线：继续看
  - `docs/migration-parity-dashboard.md`
  - `docs/cutover-readiness-criteria.md`
