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

## Soft Gates

### Soft Gate 1: Skill Studio / Lifecycle Product Surface

必须明确它是：

- cutover 前必需
- 或 cutover 后补

**当前裁决：cutover 后补。**

- Level 2 cutover 不以完整 Skill Studio / sidepanel management UI 为前置；Gate G 继续只要求 shared AI-surface summary/action 主链成立，而不是要求先补完整产品壳。
- `ISSUE-085` 已交付 sidepanel chat shell，但它不等于 management UI；settings/runtime/skills/hosts 的产品面仍由 follow-up `ISSUE-093` 承接。
- sidepanel management UI 的最小范围已锁定为：通过统一 `resource.read` 消费 `runtime.summary` / `config.summary` / `skills.summary` / `hosts.summary`，并通过 `runtime.capture_diagnostics` / `runtime.clear_error` / `config.update` / `skills.install|enable|disable|uninstall` / `hosts.connect|disconnect|set_default` 触发共享 control-plane 动作；不新增 app-local bootstrap truth。

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
- 但仍未达到 `Level 1 fully stable`
- 更未达到 `Level 2 cutover ready`

主要原因：

1. 迁移控制面刚建立，还未长期维护
2. AI-native product control plane 已有最小实现；`config.*` / `skills.*` / `hosts.*`、`readAiSurfaceResource()` / MV3 `resource.read` 与最小 `audit.tail` 已形成主链，但完整 resource metadata registry 与更完整 product surface 仍未完成
3. browser automation 的 cutover 前 active-tab Tier 1 路径已闭环，但旧仓更广的 automation parity 仍未完整迁入：`page.scroll/select_option/hover`、`tabs.create/close`、stealth/computer mode，以及 screenshot/download export composites 仍属 cutover 后范围；background lane 目前也只保留已验证的最小 baseline
4. diagnostics / provider / studio / automation parity 仍未成体系

## Maintenance Rule

- 每关闭一个关键迁移 issue，回看本文件
- 若某个 gate 判定变化，必须同步更新本文件
- 若要宣称“可以切主线”，必须逐条过本文件，而不是只过 `bun run check`
