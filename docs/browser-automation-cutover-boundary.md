# Browser Automation Cutover Boundary

> 2026-05-31 修正：browser automation 的第一性原则以 `docs/browser-automation-first-principles.md` 为准。本文保留为 cutover 历史边界；其中 `page.query`、verify pipe、intervention 等条目不得被解释为继续扩张旧仓评分器、智能 locator、UID ranking、hidden recovery engine 或防御性兼容层的授权。

本文件回答 Soft Gate 2（`docs/cutover-readiness-criteria.md`）的核心问题：

> 哪些旧 browser automation 能力属于 cutover 前必需？

## 裁决原则

1. **Browser Harness lane 优先**：少数强原语 + 完整证据 + 当前 Codex Agent 判断；不做代码评分器、智能 locator、隐式 verify、hidden fallback/recovery 或防御性兼容。
2. **active-tab metadata only**（locked decision）
3. **explicit invoke 才注入**（locked decision）
4. 旧仓 ~39 tools 不原样平移；新仓收敛为 public capability namespace
5. cutover 前只需证明"核心原语 + dogfood 观察闭环"可用，不需证明"所有旧工具都已迁完"

## 旧仓能力全景（~39 tools）

| 类别 | 典型工具 | 数量 |
|------|---------|------|
| 页面交互 | click, fill, press_key, scroll, select_option, navigate, hover, highlight | ~12 |
| DOM 检查 | AXTree snapshot, DOM snapshot, element locator, value read, page metadata | ~7 |
| Tab 管理 | get_all_tabs, get_current_tab, create_new_tab, close_tab, stealth tab | ~6 |
| 视觉捕获 | screenshot, screenshot_with_highlight, download_image | ~5 |
| 自动化控制 | mode toggle, tool filtering, failure tracker, no-progress, lease, retry | ~6 |
| 验证 | observe-progress-verify, verify policy, terminal status | ~3 |
| 人工干预 | list/get/request/cancel intervention | ~4 |

## 新仓当前状态

| 层 | 状态 |
|----|------|
| 9 个 descriptor 已声明 | `page.query/click/fill/press_key/screenshot`, `site.fetch_with_session`, `tabs.list/get_active/navigate` |
| FamilyProvider 路由 | 未接入；且当前阶段不要求 `page.*` / `site.*` / `tabs.*` 先完成默认 provider 绑定（见 ISSUE-045 决策） |
| site-runtime invoke pipe | 已实现（match→install→run→verify），独立于 capability routing |
| kernel loop/no-progress | 已实现 |
| automation mode | 未实现 |

## Cutover 前必需（Tier 1）

这些能力是新仓替代旧仓主线的最低门槛。

| 能力 | 新仓 Namespace | 理由 |
|------|---------------|------|
| DOM 查询 / snapshot | `page.query` | 一切自动化的基础——不能看页面就不能操作 |
| 点击 | `page.click` | 最基本的交互原语 |
| 填写 | `page.fill` | 表单交互是核心产品场景 |
| 按键 | `page.press_key` | 键盘交互无法由 click/fill 替代 |
| 获取当前 Tab | `tabs.get_active` | active-tab 上下文是所有操作的前提 |
| 截图 | `page.screenshot` | verify 和 diagnostics 都依赖截图 |
| 导航 | `tabs.navigate` | 打开 URL 是最基本的浏览器动作 |
| 观察-验证 | site-runtime verify pipe | 已有；cutover 前先沿用独立编排路径，不要求先桥接到 capability 层 |
| 人工干预请求 | site-runtime / kernel runtime handoff contract | CAPTCHA/2FA/登录/verify failed 场景必需；当前不升格为新的 public capability family |

**总计：8 个原语 + verify + intervention = 最小闭环**

注意：
- `page.press_key`、`page.screenshot` 已由 ISSUE-057 落地；`tabs.navigate` 已由 ISSUE-058 落地
- intervention 已由 ISSUE-041 定性：cutover 前必需，但当前先以 runtime handoff contract 落地
- no-progress detection 已在 kernel loop-engine 中实现

## Cutover 后可补（Tier 2）

这些能力有产品价值但不阻塞切主线。

| 能力 | 说明 |
|------|------|
| `page.scroll` | 滚动操作——大多场景可由 scrollIntoView 替代 |
| `page.select_option` | 下拉选择——频率低于 click/fill |
| `page.hover` | 悬停——非核心交互 |
| `tabs.list` | 列出所有 tab——active-tab-only 规则下优先级低 |
| `tabs.create` / `tabs.close` | Tab 生命周期——active-tab-only 限制优先级低 |
| `site.fetch_with_session` | 带登录态 fetch——重要但可独立补 |
| Background mode / background-specific failure tracking | 第二执行 lane；Focus mode-first 足够支撑 cutover |
| highlight / bounding box / screenshot with highlight | 辅助调试 composite——非阻塞 |

注：Tier 2 表示“不是 cutover 前 blocker”，并不等于“尚未实现”。当前仓内的 `tabs.list`、`site.fetch_with_session` 与 background lane baseline 已有最小 runtime/test 覆盖，但它们仍不构成 cutover 前必需门槛。

## 暂不纳入主链（Tier 3）

| 能力 | 说明 |
|------|------|
| Stealth tab / 隐身窗口 | Background mode 的子功能，depend on Tier 2 |
| Computer (坐标模式) | Focus mode 专有，极少使用 |
| `download_image` / batch download | 更适合作为 product/workflow export layer，不进 browser automation 主链 |
| Tab ungroup | 边缘操作 |
| `download_chat_images` | chat/product workflow 专用导出，不纳入主链 |
| Fill form (批量) | 可由多次 fill 替代 |
| Lease policy | Background mode 并发控制，Focus mode 不需要 |
| Focus escalation UI | 依赖 Background mode |

## Tier 1 Descriptor 收口状态

基于当前代码与测试，Tier 1 所需 descriptor 已补齐到 `BUILTIN_CAPABILITIES`：

| ID | 状态 | 备注 |
|----|------|------|
| `page.query` / `page.click` / `page.fill` | 已落地 | 生产路径由 `ISSUE-154` 收口 |
| `page.press_key` | 已落地 | `ISSUE-057` |
| `page.screenshot` | 已落地 | `ISSUE-057` + `ISSUE-147` |
| `tabs.get_active` / `tabs.navigate` | 已落地 | `ISSUE-058` |
| verify + intervention handoff | 已落地 | `ISSUE-068` / `ISSUE-071` / `ISSUE-141` / `ISSUE-152` |

额外补充：`tabs.list`（`ISSUE-138`）与 `site.fetch_with_session`（`ISSUE-149`）也已具备最小 runtime path，但它们属于 Tier 2 扩展面，而不是 cutover 前 blocker。

## 当前阶段的 production path 边界

ISSUE-045 已锁定：

- `page.*` / `site.*` 继续保留 public capability namespace
- cutover 前不要求 `SiteSkillRuntime` 立即桥接到 `CapabilityRegistry` / `FamilyProviderRegistry`
- 站点级动作执行先走 `SiteSkillRuntime` 的 match → install → invoke → verify 独立编排路径
- `tabs.*` 的最小 Tier 1 原语可先通过 MV3 runtime path 落地，不要求提前补全 tab family provider

因此，Tier 1 的目标不是“先把 provider bridge 全做完”，而是先证明：

1. active-tab-only
2. explicit invoke 才注入
3. 最小 page/tabs automation 原语
4. verify / intervention 闭环

能够在当前架构边界内成立。

## 实现路径映射

| Tier 1 能力 | 需要的代码变更 | 相关 Package |
|-------------|---------------|-------------|
| page.query/click/fill 真实实现 | public contract 对齐现有 `SiteSkillRuntime` invoke pipe，沿用 injected DOM 执行 | site-runtime, mv3-shell |
| page.press_key | 已落地：descriptor + site-runtime invoke pipe + injected key dispatch；不要求提前注册 `page` FamilyProvider | core, site-runtime, mv3-shell |
| page.screenshot | 已落地：descriptor + `chrome.tabs.captureVisibleTab` active-tab path | core, mv3-shell |
| tabs.navigate | 已落地：descriptor + `chrome.tabs.update` active-tab round-trip | core, mv3-shell |
| tabs.get_active 真实实现 | 已落地：绑定到 MV3 active-tab metadata read path；`tabs.list` 也已有对外桥接，但不属于 Tier 1 blocker | core, mv3-shell |
| verify 扩展 | 已落地：继续复用 site-runtime verify pipe；统一 trace / capability bridge 仍留给后续批次 | site-runtime, core |
| intervention / handoff | 已落地：`ISSUE-068/071/141/152` 已补齐 request/resolve/cancel/timeout/audit、restart durability、sidepanel handoff UI 与 page action failure 接管主链 | contracts, site-runtime, kernel, mv3-shell |

## 与其他迁移文档的口径对齐

### migration-matrix 判定更新

| Legacy Area | Old Status | New Status |
|-------------|-----------|-----------|
| browser automation / background mode | `not-started` | `not-started` (boundary defined) |
| tab / page interaction tools | `partial` | `partial` (Tier 1 boundary locked) |

### parity-dashboard 判定更新

| Area | Old Status | New Status |
|------|-----------|-----------|
| old browser automation parity | `red` | `red` → `yellow` (boundary locked, implementation pending) |

### cutover-criteria Soft Gate 2 判定

Soft Gate 2 要求"必须明确哪些旧 automation 能力属于 cutover 前必需"。

**本文件已明确回答此问题。** Soft Gate 2 的“边界裁决 + Tier 1 active-tab 路径”都已满足。当前剩余 scope 已转为 Tier 2 / Tier 3 breadth 与 product/export 范围，而不再是 cutover 前 blocker。

## 当前已收口的实现

- `ISSUE-057`：补齐 `page.press_key` / `page.screenshot` descriptor 与 runtime path
- `ISSUE-058`：补齐 `tabs.navigate` active-tab automation path
- `ISSUE-138`：补齐 `tabs.list` 对外桥接与覆盖
- `ISSUE-147`：补齐 `page.screenshot` runtime binding
- `ISSUE-149`：补齐 `site.fetch_with_session` bridge
- `ISSUE-154`：补齐 `page.query/click/fill` production path
- `ISSUE-110` / `ISSUE-118` / `ISSUE-123` / `ISSUE-124`：补齐 background lane baseline、stabilization 与 non-active-tab page action 覆盖
- `ISSUE-068` / `ISSUE-071` / `ISSUE-141` / `ISSUE-152`：补齐 intervention lifecycle、restart durability、shared UI 与 page action failure handoff

## 当前仍属 deferred 的范围

- Tier 2 / Tier 3 breadth：`page.scroll/select_option/hover`、`tabs.create/close`、stealth/computer mode
- download / export composites：`screenshot_with_highlight`、`download_image`、`download_chat_images`
- 若未来要统一 northbound dispatch，再考虑把 `page.*` / `tabs.*` / `site.*` 默认桥接到 FamilyProvider；当前 cutover 不把它当 blocker
