# Browser Automation Cutover Boundary

本文件回答 Soft Gate 2（`docs/cutover-readiness-criteria.md`）的核心问题：

> 哪些旧 browser automation 能力属于 cutover 前必需？

## 裁决原则

1. **少量强原语 + 足够上下文**（locked decision）
2. **active-tab metadata only**（locked decision）
3. **explicit invoke 才注入**（locked decision）
4. 旧仓 ~39 tools 不原样平移；新仓收敛为 public capability namespace
5. cutover 前只需证明"核心自动化能闭环"，不需证明"所有旧工具都已迁完"

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
| 6 个 descriptor 已声明 | `page.query/click/fill`, `site.fetch_with_session`, `tabs.list/get_active` |
| FamilyProvider 路由 | 未接入（page/site/tabs 无 provider） |
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
| 按键 | `page.press_key` (新增) | 键盘交互无法由 click/fill 替代 |
| 获取当前 Tab | `tabs.get_active` | active-tab 上下文是所有操作的前提 |
| 截图 | `page.screenshot` (新增) | verify 和 diagnostics 都依赖截图 |
| 导航 | `tabs.navigate` (新增) | 打开 URL 是最基本的浏览器动作 |
| 观察-验证 | site-runtime verify pipe | 已有，需要扩展到 capability 层 |
| 人工干预请求 | 独立 issue (ISSUE-041) | CAPTCHA/2FA/登录 场景必需 |

**总计：8 个原语 + verify + intervention = 最小闭环**

注意：
- `page.press_key`、`page.screenshot`、`tabs.navigate` 是新仓需要补充声明的 descriptor
- 人工干预由 ISSUE-041 单独推进
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
| Background mode | 双轨执行——Focus mode 足够支撑 cutover |
| highlight / bounding box | 辅助调试——非阻塞 |

## 暂不纳入主链（Tier 3）

| 能力 | 说明 |
|------|------|
| Stealth tab / 隐身窗口 | Background mode 的子功能，depend on Tier 2 |
| Computer (坐标模式) | Focus mode 专有，极少使用 |
| Download image (批量) | 非核心产品场景 |
| Tab ungroup | 边缘操作 |
| Screenshot with highlight | 可由 screenshot + highlight 组合 |
| Fill form (批量) | 可由多次 fill 替代 |
| Lease policy | Background mode 并发控制，Focus mode 不需要 |
| Focus escalation UI | 依赖 Background mode |

## 新仓需要补充的 Descriptor

基于 Tier 1 分析，以下 descriptor 需要加入 `BUILTIN_CATALOG`：

| ID | Family | Operation | Risk | Side Effects |
|----|--------|-----------|------|-------------|
| `page.press_key` | `page` | `press_key` | medium | writes |
| `page.screenshot` | `page` | `screenshot` | low | reads |
| `tabs.navigate` | `tabs` | `navigate` | medium | writes |

现有 `page.query/click/fill` 和 `tabs.list/get_active` 已在 catalog 中。

## 实现路径映射

| Tier 1 能力 | 需要的代码变更 | 相关 Package |
|-------------|---------------|-------------|
| page.query/click/fill 真实实现 | 注册 `page` FamilyProvider + CDP/DOM 执行 | site-runtime, mv3-shell |
| page.press_key | 新增 descriptor + provider | contracts, core, site-runtime |
| page.screenshot | 新增 descriptor + CDP capture | contracts, core, mv3-shell |
| tabs.navigate | 新增 descriptor + `chrome.tabs.update` | contracts, core, mv3-shell |
| tabs.get_active 真实实现 | 注册 `tabs` FamilyProvider + `chrome.tabs.query` | core, mv3-shell |
| verify 扩展 | 连接 site-runtime verify 到 capability 层 | site-runtime, core |

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

**本文件已明确回答此问题。** Soft Gate 2 的"边界裁决"部分已满足。剩余是 Tier 1 的实际实现。

## Follow-up Issues 需求

基于本 cutover boundary 裁决，需要新增以下 backlog issue：

1. **page FamilyProvider + page.press_key/screenshot descriptor**
   - 注册 `page` FamilyProvider
   - 新增 `page.press_key`、`page.screenshot` descriptor
   - scope: contracts, core, site-runtime

2. **tabs FamilyProvider + tabs.navigate descriptor**
   - 注册 `tabs` FamilyProvider
   - 新增 `tabs.navigate` descriptor
   - scope: contracts, core, mv3-shell

以上两个 issue 与已有的 ISSUE-037 (page and tabs public automation path) 存在重叠，应检查是否合并或作为 ISSUE-037 的前置。
