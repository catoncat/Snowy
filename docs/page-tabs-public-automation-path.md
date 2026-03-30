# Page/Tabs Public Automation Path

本文件回答 ISSUE-037 的核心问题：

> 在 ISSUE-036 锁定 cutover boundary 后，`page.*` / `tabs.*` 的最小 public automation path 是什么？

## 设计原则

1. **少量强原语 + 足够上下文**（locked decision）
2. **active-tab metadata only**（locked decision）
3. **`page.*` / `tabs.*` / `site.*` 仍然是浏览器本地能力**（locked decision）
4. **UID-based selector strategy**：沿用旧仓的 `data-brain-uid` 范式——snapshot 先打标→LLM 拿 UID→action 用 UID 定位
5. **不在 public namespace 膨胀过程工具**：scroll_to, highlight, bounding_box 等辅助工具不进入 Tier 1 public path
6. **execution lane 收敛**：cutover 前只用 `chrome.scripting.executeScript` lane（DOM action）+ `chrome.tabs` API（tab 管理），不引入 CDP lane

## 旧仓 page/tabs 工具映射

### 旧仓 Element Actions（DomLocator）

| 旧工具 | 参数 | 执行路径 | vNext 对应 |
|--------|------|---------|-----------|
| `click` | `{ uid }` + options | `chrome.scripting.executeScript` → `runDomAction({ action: "click", uid })` | `page.click` |
| `fill_element_by_uid` | `{ uid, value }` + options | 同上 → `runDomAction({ action: "fill", uid, value })` | `page.fill` |
| `hover_element_by_uid` | `{ uid }` + options | 同上 → `runDomAction({ action: "hover", uid })` | Tier 2 (`page.hover`) |
| `select_option_by_uid` | `{ uid, value }` | 同上 → `runDomAction({ action: "select" })` | Tier 2 (`page.select_option`) |
| `get_editor_value` | `{ uid }` | 同上 → `runDomAction({ action: "value", uid })` | Tier 2（可由 `page.query` snapshot 获取 value） |
| `scroll_to_element` | `{ uid }` | 复用 hover path | Tier 2 (`page.scroll`) |

### 旧仓 Tab-level Actions

| 旧工具 | 参数 | 执行路径 | vNext 对应 |
|--------|------|---------|-----------|
| `press_key` | `{ key }` | `executeStep({ action: "press", key })` | `page.press_key` (**新增**) |
| `scroll_page` | `{ deltaY? }` | `executeStep({ action: "scroll" })` | Tier 2 (`page.scroll`) |
| `navigate_tab` | `{ url }` | `executeStep({ action: "navigate", url })` | `tabs.navigate` (**新增**) |

### 旧仓 Snapshot/Query

| 旧工具 | 参数 | 执行路径 | vNext 对应 |
|--------|------|---------|-----------|
| `search_elements` | `{ options? }` | Content script message → DOM snapshot collector | `page.query` |
| `get_page_metadata` | 无 | CDP `runtime.evaluate` | `page.query` 的 metadata 附带项 |

### 旧仓 Tab Management

| 旧工具 | 参数 | 执行路径 | vNext 对应 |
|--------|------|---------|-----------|
| `get_current_tab` | 无 | `chrome.tabs.query` | `tabs.get_active` |
| `get_all_tabs` | 无 | `chrome.tabs.query` | `tabs.list`（Tier 2） |
| `create_new_tab` | `{ url, active? }` | `chrome.tabs.create` / stealth tab | Tier 2 (`tabs.create`) |
| `close_tab` | `{ tabId }` | `chrome.tabs.remove` | Tier 2 (`tabs.close`) |
| `get_tab_info` | `{ tabId }` | `chrome.tabs.get` | `tabs.get_active` 已包含 metadata |

### 旧仓 Screenshot

| 旧工具 | 参数 | 执行路径 | vNext 对应 |
|--------|------|---------|-----------|
| `capture_screenshot` | `{ format?, quality? }` | CDP `Page.captureScreenshot` | `page.screenshot` (**新增**) |
| `capture_tab_screenshot` | 同上 | 同上 | 同上 |
| `capture_screenshot_with_highlight` | `{ selector, ... }` | highlight → CDP capture → cleanup | Tier 2 composite |

## Cutover 前最小 `page.*` / `tabs.*` 集合

### `page.*` — 页面交互原语

| Capability ID | 状态 | 参数 | Risk | Side Effects | 执行路径 |
|--------------|------|------|------|-------------|---------|
| `page.query` | **已声明** | `{ selector: string }` | low | reads | content script injection → DOM snapshot |
| `page.click` | **已声明** | `{ uid: string }` | medium | writes | `chrome.scripting.executeScript` → DomLocator click |
| `page.fill` | **已声明** | `{ uid: string, value: string }` | medium | writes | `chrome.scripting.executeScript` → DomLocator fill |
| `page.press_key` | **待新增** | `{ key: string }` | medium | writes | `chrome.scripting.executeScript` → tab-level key dispatch |
| `page.screenshot` | **待新增** | `{ format?: string, quality?: number }` | low | reads | `chrome.tabs.captureVisibleTab` 或 CDP `Page.captureScreenshot` |

### `tabs.*` — Tab 管理原语

| Capability ID | 状态 | 参数 | Risk | Side Effects | 执行路径 |
|--------------|------|------|------|-------------|---------|
| `tabs.get_active` | **已声明** | `{}` | low | reads | `chrome.tabs.query({ active: true, currentWindow: true })` |
| `tabs.navigate` | **待新增** | `{ url: string }` | medium | writes | `chrome.tabs.update(tabId, { url })` |

### 不纳入 Cutover 前（本 issue 不处理）

| 能力 | 原因 | 对应 Tier |
|------|------|----------|
| `page.scroll` | 多数场景可由 scrollIntoView 替代 | Tier 2 |
| `page.hover` | 非核心交互 | Tier 2 |
| `page.select_option` | 频率低于 click/fill | Tier 2 |
| `tabs.list` | active-tab-only 规则下优先级低 | Tier 2 |
| `tabs.create` / `tabs.close` | 同上 | Tier 2 |
| 截图/下载 | ISSUE-040 范围 | — |
| 人工接管 | ISSUE-041 范围 | — |
| background mode | ISSUE-039 范围 | — |

## 详细 Descriptor 设计

### `page.press_key`（新增）

```typescript
{
  id: "page.press_key",
  version: 1,
  description: "Press a keyboard key on the active page",
  inputSchema: {
    type: "object",
    properties: {
      key: { type: "string", description: "Key to press (e.g. 'Enter', 'Tab', 'Escape', 'a')" }
    },
    required: ["key"]
  },
  outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
  risk: "medium",
  sideEffects: "writes",
  permissions: ["page.press_key"],
  supportsVerify: true,
  supportsStreaming: false,
  exportable: false,
  executionBinding: { family: "page", operation: "press_key" }
}
```

**设计决策：**
- 不暴露 `tabId` 参数。active-tab-only 原则，始终操作当前活跃 tab
- 不暴露 `uid` 参数。旧仓的 press_key 也是 tab-level action，不绑定特定元素
- `key` 使用 [Web KeyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values) 标准值
- `supportsVerify: true` — 按键后可能触发页面变化，需要验证

### `page.screenshot`（新增）

```typescript
{
  id: "page.screenshot",
  version: 1,
  description: "Capture a screenshot of the active page",
  inputSchema: {
    type: "object",
    properties: {
      format: { type: "string", enum: ["png", "jpeg"], default: "png" },
      quality: { type: "number", minimum: 0, maximum: 100 }
    }
  },
  outputSchema: {
    type: "object",
    properties: {
      dataUrl: { type: "string" },
      format: { type: "string" },
      width: { type: "number" },
      height: { type: "number" }
    },
    required: ["dataUrl", "format"]
  },
  risk: "low",
  sideEffects: "reads",
  permissions: ["page.screenshot"],
  supportsVerify: false,
  supportsStreaming: false,
  exportable: false,
  executionBinding: { family: "page", operation: "screenshot" }
}
```

**设计决策：**
- 输出 `dataUrl`（base64 data URI），不写 VFS。调用方决定是否持久化
- `quality` 仅在 `format: "jpeg"` 时生效
- 不暴露 `selector` 参数（元素级截图是 Tier 2 composite）
- 不暴露 `tabId`。active-tab-only

### `tabs.navigate`（新增）

```typescript
{
  id: "tabs.navigate",
  version: 1,
  description: "Navigate the active tab to a URL",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Target URL to navigate to" }
    },
    required: ["url"]
  },
  outputSchema: {
    type: "object",
    properties: {
      tabId: { type: "number" },
      url: { type: "string" },
      title: { type: "string" }
    },
    required: ["tabId", "url"]
  },
  risk: "medium",
  sideEffects: "writes",
  permissions: ["tabs.navigate"],
  supportsVerify: true,
  supportsStreaming: false,
  exportable: false,
  executionBinding: { family: "tabs", operation: "navigate" }
}
```

**设计决策：**
- 不暴露 `tabId`。active-tab-only 原则。navigate 始终操作当前活跃 tab
- `supportsVerify: true` — 导航后可验证是否到达目标页
- 实现层使用 `chrome.tabs.update(tabId, { url })`，不新开 tab
- URL 校验在 provider 层做（http/https only），不在 descriptor 层硬编码

## 已有 Descriptor 确认

### `page.query`（无变更）

当前声明：
```typescript
{ selector: string } → 查询结果
```

**映射到旧仓 `search_elements`（DOM snapshot）：**
- 旧仓返回完整 DOM tree snapshot（`SerializedDomSnapshot`），包含 UID、role、name、value 等
- vNext 应沿用 UID 标注模式：snapshot 打 `data-brain-uid` → 返回给 LLM → LLM 用 UID 调用 click/fill
- `selector` 参数语义：CSS 选择器（限定 snapshot 范围）或空（全页面 snapshot）

### `page.click`（无变更）

当前声明：
```typescript
{ uid: string } → 点击结果
```

**映射到旧仓 `click`：**
- `uid` = `data-brain-uid` 属性值
- 执行层：`queryByUid(uid)` → 递归搜索 document + ShadowDOM + same-origin iframe → `mousedown → mouseup → click` 事件序列
- 不暴露 `count`（双击）、`highlight`、`scroll` 选项——这些是调试/辅助功能，不进 public path

### `page.fill`（无变更）

当前声明：
```typescript
{ uid: string, value: string } → 填写结果
```

**映射到旧仓 `fill_element_by_uid`：**
- 三路径：contentEditable → `textContent`；input/textarea → 清空 + 设 `.value`
- 触发事件序列：`focus → input → change → blur`
- React 兼容：执行层需要 `syncReactValueTracker` 处理 controlled input

### `tabs.get_active`（无变更）

当前声明：
```typescript
{} → ActiveTabMetadata
```

**映射到旧仓 `get_current_tab`：**
- `chrome.tabs.query({ active: true, currentWindow: true })`
- 返回 `{ tabId, url, title, active }`

## 与 Site Runtime Invoke Pipe 的关系

ISSUE-045 已锁定：

> cutover 前不要求 `SiteSkillRuntime` 立即桥接到 `CapabilityRegistry` / `FamilyProviderRegistry`

因此，page/tabs 的最小 production path 是 **双轨并行**：

1. **Capability Path（descriptor → provider → execute）**
   - `page.query/click/fill/press_key/screenshot` + `tabs.get_active/navigate` 通过 `CapabilityDescriptor` 声明
   - 真实 provider 绑定在后续批次补——cutover 前先声明 descriptor、确认参数 shape
   - AI Surface 看到的是统一的 capability namespace

2. **Site Runtime Path（skill → match → install → invoke → verify）**
   - `SiteSkillRuntime` 继续独立运行
   - 站点级 skill（如"在 GitHub 上执行 PR review"）通过 site-runtime pipe 走
   - 不需要也不应该把每个 site skill action 都注册为 public capability

**两条路径的分工：**
- **page/tabs capability** = 浏览器级原语，不绑站点（打开任何页面都能 query/click/fill）
- **site skill action** = 站点级行为，绑定 URL pattern（只在匹配站点生效）

## 实现路径

### Phase 1: Descriptor 补全（本 issue 范围外，ISSUE-057 覆盖）

1. 在 `packages/contracts/src/index.ts` 无需改动（descriptor 类型已通用）
2. 在 `packages/core/src/index.ts` 的 `BUILTIN_CATALOG.page` 中新增 `page.press_key` 和 `page.screenshot`
3. 在 `packages/core/src/index.ts` 的 `BUILTIN_CATALOG.tabs` 中新增 `tabs.navigate`
4. 补测试确认 descriptor validity 和 tool projection

### Phase 2: MV3 Shell 执行层（后续批次）

1. `apps/mv3-shell/src/page-hook.js` — 扩展为真实 DOM action executor
   - 接收 `{ action: "click"|"fill"|"press_key"|"query", ... }` 消息
   - query：实现 DOM snapshot collector（UID 标注 + tree 序列化）
   - click/fill：实现 DomLocator（`queryByUid` + event dispatch）
   - press_key：实现 tab-level key dispatch（`KeyboardEvent` 构造 + dispatch）
2. `apps/mv3-shell/src/background.js` — 扩展 tab 管理
   - navigate：`chrome.tabs.update(tabId, { url })`
   - screenshot：`chrome.tabs.captureVisibleTab` 或 CDP
   - get_active：`chrome.tabs.query({ active: true, currentWindow: true })`

### Phase 3: Capability Bridge（后续批次，非 cutover blocker）

- 注册 `page` / `tabs` FamilyProvider
- 从 `CapabilityRegistry.dispatch()` 路由到 MV3 shell 执行层
- 统一 trace / audit / permission check

## Follow-up Issues 确认

已有的 follow-up 完全覆盖本 review 的结论：

- **ISSUE-057**：Tier 1 page automation descriptors and runtime path — 新增 `page.press_key` / `page.screenshot` descriptor + MV3 page-hook 执行层
- **ISSUE-058**：tabs.navigate active-tab automation path — 新增 `tabs.navigate` descriptor + MV3 background navigate 执行层
- **ISSUE-040**：screenshot/download surfaces — 与 `page.screenshot` descriptor 有交叉，但 ISSUE-040 侧重"surface 边界审查"而非实现

无需新建额外 issue。
