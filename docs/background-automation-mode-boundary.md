# Background Automation Mode Boundary

本文件回答 `ISSUE-039` 的核心问题：

> vNext 在 cutover 前，是否必须恢复旧仓的 background automation mode 与 background-specific failure tracking？

## 裁决结论

- **background automation mode：cutover 后可补，不属于 cutover 前必需。**
- **background-specific failure tracking：与 background mode 一起后置，不单独成为 cutover 前 contract。**
- **cutover 前只保留极简替代物：kernel 现有 no-progress / diagnostics / verify 信号。**

换句话说：

- cutover 前主线 = **focus-mode-first / active-tab-only / explicit invoke**
- background mode = **post-cutover lane**
- 旧仓 `background-failure-tracker` = **background lane 的可靠性叠加层**，不是当前主链的独立 blocker

## 旧仓到底包含什么

旧仓的 background mode 不是一个简单 toggle，而是一整套并行执行学：

| 组件 | 旧仓职责 |
|---|---|
| `automation-mode.ts` | 持久化 `focus` / `background` 模式选择 |
| tool filtering | background 模式下过滤 `computer` / `*screenshot*` 等工具 |
| DOM snapshot lane | 不走 CDP AXTree，改走 content script DOM snapshot |
| DOM locator lane | 不走 CDP Input/DOM.resolveNode，改走合成 DOM 事件 |
| stealth tab / background window | 后台创建/维持无焦点 tab |
| background failure tracker | 连续失败计数，达到阈值后建议升级到 focus mode |
| mixed fallback routing | 某些动作自动回退到 CDP lane |

**这说明 background mode 不是“再加几个 content script”就能完成的功能，而是一整套 lane。**

## 为什么它不该进 cutover 前主链

### 1. 它天然依赖“非 active-tab-only”心智

当前 locked decisions 明确：

- active-tab metadata only
- explicit invoke 才注入

而旧 background mode 的真实诉求通常是：

- 静默后台运行
- 不抢用户当前焦点
- 允许隐身 / minimized window / stealth tab
- 不把当前 active tab 当作唯一执行面

这与 cutover 前主线的 **active-tab-only** 是不同优先级的目标。

### 2. 它是一整条执行 lane，不是单点能力缺口

旧 background mode 要成立，需要同时补齐：

- content script snapshot lane
- DOM-only action lane
- tool filtering
- stealth tab / window policy
- fallback routing
- mode state / UX
- failure tracking & upgrade hint

如果在 cutover 前把它强塞进来，风险是：

- 为了恢复 lane 而重新膨胀 capability / runtime surface
- 把注意力从 Tier 1 page/tabs 实现、screenshot、intervention 挪走
- 提前恢复旧仓的多 lane 复杂度，偏离“少量强原语 + 足够上下文”

### 3. 旧 background-failure-tracker 不是通用 reliability substrate

旧仓 `background-failure-tracker.ts` 做的事其实很窄：

- 按 tab 记录连续 background-mode 失败次数
- 超阈值后附带“建议切 focus mode”的 hint
- **不会自动切换模式**

它依赖的前提是：

- 已存在 background lane
- 已存在 focus lane
- 已存在 mode 切换 UI / 心智

因此它不是一个独立的、应先于 background mode 存在的 runtime substrate。

## cutover 前真正需要的“极简替代物”是什么

虽然 background mode 与 background-specific failure tracking 可以后置，但这不等于 cutover 前不需要可靠性信号。

cutover 前保留的最小替代物应是：

| 需求 | 当前落点 | 是否已存在 |
|---|---|---|
| no-progress / ping-pong 检测 | kernel loop engine | **已存在** |
| 失败后可诊断 | runtime diagnostics / bootstrap error surface | **已存在基础面** |
| 动作完成后验证 | site-runtime verify pipe | **已存在** |
| 高风险场景交给人工 | intervention / handoff | **待 ISSUE-041** |

所以 cutover 前真正必需的是：

- **通用 no-progress / diagnostics / verify 能力**
- 而不是 **background lane 专属失败计数器**

## 与 locked decisions 的兼容关系

### active-tab-only

cutover 前保留 focus-mode-first 路线，background mode 后置，意味着：

- 不需要在当前主线里引入 stealth tab / minimized window 作为一等执行面
- `tabs.get_active` / `tabs.navigate` / `page.*` 继续围绕 active tab 收敛
- background mode future work 必须明确：它是对 active-tab-only 主线的扩展，而不是反过来吞掉主线

### explicit invoke 才注入

background mode 后置也能保持这条规则：

- cutover 前只需保证用户明确 invoke 后的 page/site runtime 注入链
- 后续若恢复 background lane，也应坚持“显式启动某个后台执行任务”，而不是重新回到隐式注入

## vNext 裁决

### 1) background automation mode

| 结论项 | 裁决 |
|---|---|
| 是否 cutover 前必需 | **否** |
| 分类 | **cutover 后可补** |
| 当前是否保留最小 contract | **否** |
| 未来定位 | browser automation 的第二执行 lane |

### 2) background-specific failure tracking

| 结论项 | 裁决 |
|---|---|
| 是否 cutover 前必需 | **否** |
| 分类 | **随 background mode 一起后置** |
| 当前是否保留最小 contract | **否** |
| 未来定位 | background lane 的 reliability overlay / upgrade hint layer |

### 3) cutover 前保留的极简替代物

| 能力 | 裁决 |
|---|---|
| kernel no-progress detection | **保留，已是主线一部分** |
| runtime diagnostics / error surface | **保留，属于 Operability** |
| background mode 切换 UI | **后置** |
| per-tab consecutive background failures | **后置** |
| stealth tab / lease policy | **后置** |

## 是否需要新增 follow-up issue

**当前不新增新的 background-mode implementation issue。**

原因：

- 这次裁决的结论不是“cutover 前保留一个最小 background contract”
- 而是“background lane 整体后置，先把 focus-mode-first 主线切通”

因此：

- 不需要为了满足本 issue acceptance 而硬拆一个最小 background contract issue
- 等 Tier 1 page runtime / screenshot / intervention 收口后，再由 batch planning 决定是否恢复 background lane

## 对其他迁移文档的同步要求

本结论要求同步到：

1. `docs/cutover-readiness-criteria.md`
   - 明确 background mode / background-specific failure tracking 不属于 cutover 前必需
2. `docs/legacy-to-vnext-migration-matrix.md`
   - `browser automation / background mode` 行从“只有 Tier 2”补充为“background-specific failure tracking 也后置；cutover 前仅保留 no-progress/diagnostics 替代物”
3. `docs/migration-parity-dashboard.md`
   - browser automation parity 备注中写清：background mode 故意后置，不是遗漏
4. `docs/browser-automation-cutover-boundary.md`
   - 保持 `Background mode` 为 Tier 2，并补充 failure tracking 与其绑定

## 一句话裁决

- **background mode 不是 cutover 前 blocker，而是 post-cutover 的第二执行 lane。**
- **background-specific failure tracking 也不应单独提前恢复；cutover 前只需要 kernel 现有 no-progress / diagnostics / verify 作为极简替代物。**
