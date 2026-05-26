# Cutover Readiness Criteria

本文件定义：

什么时候新仓可以从“重构实验仓”进入“可替代旧主线”的状态。

## Cutover Levels

### Level 0: Runtime Prototype

- 已证明北极星方向可行
- 但还不能替旧主线

### Level 1: Migration-Controlled Mainline Candidate

- 核心 runtime substrate 已稳定
- 关键 review gap 已收口
- 迁移矩阵和 parity dashboard 在维护

### Level 2: Mainline Cutover Ready

- 新仓已满足切主线门槛
- 旧仓可进入维护 / 收尾阶段

## Hard Gates For Level 2

### Gate A: Contract / Runtime Correctness

- `CapabilityDescriptor` / projection / namespace / registry 稳定
- `ctx / permissions / trace / nested invoke` 已收口

### Gate B: BrowserVFS Correctness

- `ephemeral / workspace / library` 行为稳定
- `mem://skills/<id>/...` 已成为 canonical public URI

### Gate C: JS Runner + MV3 Host Correctness

- runner timeout / cancel / health / isolation 稳定
- offscreen host 路径稳定
- 注入脚本构建约束被测试锁住

### Gate D: Site Runtime Minimum Production Path

- active-tab metadata only 已锁住
- explicit invoke 才注入已锁住
- 至少一条真实 injection chain 被验证，不只靠 fixture

### Gate E: Migration Control Plane Exists

- migration matrix 已覆盖主要旧能力面
- parity dashboard 已维护
- 未迁项与明确放弃项都能说清楚

### Gate F: Operability

- 新仓至少有最小 diagnostics / debug / audit 面
- 出故障时，不必回到旧仓才能定位核心 runtime 问题

### Gate G: Product Self-Awareness Surface

- Agent 至少能读取最小 `runtime/config/skills/hosts` 摘要
- 关键产品变更至少有一套统一 action 面，而不是分散在私有 UI 改写里
- audit 至少能覆盖配置变更、skill 生命周期、host 连接变化

当前最小已落地口径：`audit.tail` 已覆盖 `config.update`、`skills.install/enable/disable/uninstall`、`hosts.connect/disconnect/set_default`。

补充：`ISSUE-172` 已把旧产品替代判断从 lifecycle-only 推到一条纵向 Skill 证明链：代表性 executable skill 可经 shared MV3 runtime 完成 `install → persist/restart → enable → skills.invoke → tabs.get_active → audit.tail`。`ISSUE-173` 继续把 package-install 边界接上：`skills.install` 的 setup plan 会在 shared MV3 runtime 中 materialize 到 `mem://skills/<skillId>/...`，重启后 enabled skill 可通过 `memfs.read` 读取安装写入的 package 文件，并在 `audit.tail` 留下 install/enable/invoke/child-capability 证据。`ISSUE-174` 再把 package execution 接上：重启后的 shared MV3 runtime 会从 BrowserVFS 发现 `SKILL.md` + `skill.json` package，注册有效 manifest 的 `handler.js`，并让 `skills.invoke` 通过现有 JS runner 执行该 package handler；malformed manifest 不会拖垮 runtime boot，而是跳过注册并在调用时返回结构化 capability error。`ISSUE-175` 把 package discoverability 接到 shared AI surface：`skills.summary` / `runtime.bootstrap` 会暴露 package-backed skill 的 lifecycle state、actions、matches、requiresActiveTab、entry、version、kind、description、permissions 和 tags。`ISSUE-176` 把这些 per-skill items 接到 sidepanel management 的可见 Skills catalog，让用户可从同一 shared summary inspect package metadata 并触发现有 enable/disable/uninstall actions。`ISSUE-181` 把旧 hook-driven plugin 的最小自动触发语义接回这条主链：package manifest 可声明 `eventSubscriptions`，shared MV3 runtime 通过 `runtime.event.dispatch` 只投递给已启用订阅 Skill，并复用 `skills.invoke` + JS Runner + `audit.tail` 留证。这证明新版共享运行面已经能替代旧 plugin loop 的一条最小用户能力链、安装内容注入链、持久 package execution 链、action catalog 发现链、可见管理面入口和代表性 hook/event 自动触发入口，但不等于完整 Skill Studio、版本管理、旧 plugin 生态批量迁移都已完成。

## Level 2 Gate Proof Pack

`ISSUE-177` 对当前 cutover-critical 证据的结论是：旧产品替代主链已经从 review gap 收敛为一条可验证的 shipped-with-deferred-scope product loop。它证明的是一条代表性旧 Plugin / Skill 用户能力链已可由 vNext shared runtime 和 shared product surface 替代；它不是完整 Skill Studio、版本管理、旧 plugin 生态全迁移或外部切主线批准。

- Gate A: `CapabilityDescriptor`、projection、ctx permissions、trace、nested invoke 已由 contracts/core 测试覆盖；`skills.invoke` 继续走 public Capability API。
- Gate B: BrowserVFS 已提供 canonical `mem://skills/<skillId>/...` package root；`ISSUE-173` 证明 setup plan 写入、restart 后读取与 package-root escape guard。
- Gate C: JS Runner + MV3 offscreen host 已承担 package handler execution；`ISSUE-174` 证明 installed `skill.json` + `handler.js` 在 restart 后可注册并执行。
- Gate D: active-tab path 已有 Tier 1 automation baseline；`ISSUE-172` 的代表性 skill 通过 `tabs.get_active` 触达真实 shared capability path 并写入 audit evidence。
- Gate E: migration matrix、parity dashboard、module ledger、source-of-truth 文档已维护当前 cutover-critical proof 与 deferred breadth 的边界。
- Gate F: `audit.tail`、runtime diagnostics、intervention/audit read surfaces 已能记录 config、skill、host、loop 和 child-capability evidence；`ISSUE-172` 到 `ISSUE-176` 的 proof 都不需要回旧仓定位主链状态。
- Gate G: Agent/product consumer 可通过 `runtime.summary`、`config.summary`、`skills.summary`、`hosts.summary` 和 `runtime.bootstrap` 读取共享状态；sidepanel management 也消费同一 `skills.summary.items`，不再维护 app-local package truth。

剩余 blocker 不再是这条 old-product replacement loop 未证明，而是下面这些显式后置或治理项：

- 完整 Skill Studio、版本选择、rollback、authoring studio 与旧 plugin 生态批量迁移仍属 post-cutover product breadth。
- Tier 2 / Tier 3 browser automation、download/export composites、bulk debug export、bridge-side MCP server 等仍按各自 deferred scope 跟踪。
- 是否把新仓正式切成旧主线替代，需要一次外部 cutover decision / release acceptance；本文件只提供 gate evidence，不自动执行切换。

## Soft Gates

### Soft Gate 1: Skill Studio / Lifecycle Product Surface

必须明确它是：

- cutover 前必需
- 或 cutover 后补

**当前裁决：cutover 后补。**

- Level 2 cutover 不以完整 Skill Studio / sidepanel management UI 为前置；Gate G 继续只要求 shared AI-surface summary/action 主链成立，而不是要求先补完整产品壳。
- `ISSUE-085` 已交付 sidepanel chat shell，`ISSUE-093` 也已补齐 shared management consumer；但它们仍不等于完整 Skill Studio / lifecycle UI。
- sidepanel management UI 的最小范围已锁定为：通过统一 `resource.read` 消费 `runtime.summary` / `config.summary` / `skills.summary` / `hosts.summary`，并通过 `runtime.capture_diagnostics` / `runtime.clear_error` / `config.update` / `skills.install|enable|disable|uninstall` / `hosts.connect|disconnect|set_default` 触发共享 control-plane 动作；不新增 app-local bootstrap truth。
- `ISSUE-172` / `ISSUE-173` / `ISSUE-174` / `ISSUE-175` / `ISSUE-176` 补齐的是 executable skill 的 shared runtime invoke、install setup materialization、package manifest execution、package action catalog discoverability 与 sidepanel catalog consumption 纵向证明，不改变完整 Skill Studio / lifecycle product UI 仍为 cutover 后补的裁决。

### Soft Gate 2: Browser Automation Product Parity

必须明确哪些旧 automation 能力属于 cutover 前必需。

**状态：边界已裁决。** 详见 `docs/browser-automation-cutover-boundary.md`。

Tier 1（cutover 前必需）：page.query/click/fill/press_key/screenshot + tabs.navigate/get_active + verify + intervention。Tier 2（cutover 后可补）：scroll, select_option, hover, tabs.create/close, background mode 等。Tier 3（暂不纳入）：stealth tab, computer mode, batch download 等。当前阶段默认沿用 site-runtime / MV3 独立路径，不要求先补 page/tabs FamilyProvider bridge；其中 cutover 前必需的 active-tab Tier 1 闭环已经成立，`tabs.list`、`site.fetch_with_session` 与 background lane baseline 也已有最小 runtime/test 覆盖。当前剩余 scope 已收敛为 Tier 2 / Tier 3 breadth：`page.scroll/select_option/hover`、`tabs.create/close`、stealth/computer mode，以及 screenshot/download export composites 等 cutover 后范围。

补充裁决：background automation mode 与 background-specific failure tracking 不属于 cutover 前必需，详见 `docs/background-automation-mode-boundary.md`。cutover 前仅保留 kernel no-progress / diagnostics / verify 作为极简替代物。

### Soft Gate 3: Visual / Download / Intervention Surface

必须明确这些能力是核心主线还是可延后。

**状态：screenshot / download / intervention 边界已裁决。** 详见 `docs/screenshot-download-surface-boundary.md` 与 `docs/browser-automation-cutover-boundary.md`。

- `page.screenshot`：cutover 前必需的最小视觉原语，作为 substrate capability 保留；最小 active-tab runtime path 已由 `ISSUE-057` 落地
- `screenshot_with_highlight`：cutover 后可补的 diagnostics composite
- `download_image`：cutover 后可补的 product/workflow export ability
- `download_chat_images`：暂不纳入主链
- intervention / human handoff：cutover 前必需；`ISSUE-068` 已补齐最小 request / resolve / cancel / timeout / audit lifecycle，`ISSUE-071` 已补齐 durable restart round-trip 与 `runtime.summary.interventions` / `audit.intervention` shared read surface，`ISSUE-141` 已补齐 sidepanel handoff resolve/reject UI，`ISSUE-152` 已把 page action failure 接回 shared runtime handoff contract。

## Not Enough To Claim Cutover

- 只有 v0 substrate，但没有迁移矩阵
- 有 backlog，但没有 parity dashboard
- runtime 问题仍只能回旧仓 diagnostics 里查

## Current Assessment

当前新仓：

- 已经超过空壳
- 已达到 cutover-critical substrate foundation + representative old-product replacement loop 的 shipped-with-deferred-scope 状态
- 仍未由本文自动宣称为 `Level 2 cutover ready`，因为正式切主线还需要外部 release / product acceptance

主要原因：

1. AI-native product control plane 的 Gate G 最小主链已成立；`config.*` / `skills.*` / `hosts.*`、`readAiSurfaceResource()` / MV3 `resource.read`、descriptor-owned action projection、`model.routing` shared control-plane、最小 `audit.tail`，以及 `ISSUE-172` / `ISSUE-173` / `ISSUE-174` / `ISSUE-175` / `ISSUE-176` 的 `install setupPlan → mem://skills package files → persist/restart → discover skill.json → expose actions in skills.summary/runtime.bootstrap → sidepanel Skills catalog → register handler.js → enable → skills.invoke → JS runner → tabs.get_active/memfs.read → audit.tail` executable skill 纵向证明已形成主链；`ISSUE-181` 继续补上 `eventSubscriptions → runtime.event.dispatch → event-triggered skills.invoke → audit.tail` 的 hook/event pilot。
2. `ISSUE-177` 把上述证据映射到 Level 2 gates，并把 `old-product-replacement-loop` 记录为 shipped-with-deferred-scope；后续 planning 不应再把 `ISSUE-172` 到 `ISSUE-176` 拆成局部补票。
3. 完整 Skill Studio/lifecycle UI、版本管理、旧 plugin 生态全迁移、Tier 2 / Tier 3 browser automation、download/export composites、bulk debug export 与 bridge-side MCP server 仍是 deferred breadth，不是当前代表性 old-product replacement proof 的 blocker。
4. 正式 `Level 2 cutover ready` 仍需要外部 cutover decision / release acceptance；通过 `bun run check` 只能证明仓库质量门禁，不等于产品切换批准。

## Maintenance Rule

- 每关闭一个关键迁移 issue，回看本文件
- 若某个 gate 判定变化，必须同步更新本文件
- 若要宣称“可以切主线”，必须逐条过本文件，而不是只过 `bun run check`
