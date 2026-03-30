# Screenshot / Download Surface Boundary

本文件回答 `ISSUE-040` 与 `Soft Gate 3`（`docs/cutover-readiness-criteria.md`）的核心问题：

> screenshot / download 相关能力，在 vNext 里到底属于 cutover 前主链、cutover 后补充，还是根本不应进入 browser automation substrate？

## 裁决原则

1. **不要把视觉捕获和文件导出混成同一类能力**
2. **cutover 前只保留闭环所必需的最小视觉原语**
3. **browser automation substrate 只保留浏览器级原语，不吸收产品/工作流特化导出动作**
4. **组合能力不等于基础能力**：`screenshot_with_highlight` 这类复合动作不应反向定义 substrate
5. **active-tab-only 继续成立**：截图主链只面向当前活跃 tab，不恢复旧仓 multi-tab screenshot surface

## 旧仓事实拆解

### Screenshot 相关工具

| 旧工具 | 参数形态 | 执行路径 | 旧仓语义 |
|---|---|---|---|
| `capture_screenshot` | `{ tabId?, format?, quality?, sendToLLM? }` | CDP `Page.captureScreenshot` | 视觉分析 / diagnostics / LLM 辅助观察 |
| `capture_tab_screenshot` | `{ tabId, format?, quality?, sendToLLM? }` | 同上 | multi-tab 变体，不是独立产品概念 |
| `capture_screenshot_with_highlight` | `{ tabId?, selector?, cropToElement?, padding?, sendToLLM? }` | `Runtime.evaluate` 高亮 → `Page.captureScreenshot` → cleanup | visual debugging / evidence capture |

### Download 相关工具

| 旧工具 | 参数形态 | 执行路径 | 旧仓语义 |
|---|---|---|---|
| `download_image` | `{ imageData, filename?, tabId? }` | 页面内 `<a download>` 点击 | 导出已有图片结果，不是核心浏览器动作 |
| `download_chat_images` | `{ messages, folderPrefix?, filenamingStrategy?, displayResults?, tabId? }` | 页面内 `<a download>` 批量点击 | chat/product workflow 专用导出 |

## 关键观察

### Screenshot 不是旧 verifier 的 canonical path

旧仓 verify 主路径仍然是 URL/title/text/selector 等 semantic checks；screenshot 更像：

- visual diagnostics
- evidence capture
- LLM 视觉补充输入

这意味着：

- **vNext 把 `page.screenshot` 升为 Tier 1 是产品边界裁决**
- **但不应误读成“旧仓 verifier 本来就由 screenshot 驱动”**

### Download 不是浏览器自动化 substrate

旧仓 download 工具有三个明显信号：

1. 不走 `chrome.downloads`
2. 不返回 download lifecycle（无 download id / completion tracking）
3. `download_chat_images` 直接耦合 chat message payload

所以 download 更接近：

- workflow/export utility
- product-layer action

而不是：

- `page.*` / `tabs.*` 级别的 substrate capability

## vNext 裁决

### 1) `page.screenshot`

| 结论项 | 裁决 |
|---|---|
| 是否 cutover 前必需 | **是** |
| 层级 | **substrate capability** |
| canonical surface | **`page.screenshot`** |
| 语义 | active-tab-only 最小视觉原语 |
| 作用 | visual diagnostics / evidence / LLM 补充输入；不作为 strict verify canonical path |
| 实现 issue | **ISSUE-057（已完成）** |

**保留原因：**
- Tier 1 闭环需要最小视觉原语
- diagnostics 与人工判断场景需要截图
- `capture_screenshot` / `capture_tab_screenshot` 应折叠进一个统一 surface，而不是保留多个旧名字

### 2) `screenshot_with_highlight`

| 结论项 | 裁决 |
|---|---|
| 是否 cutover 前必需 | **否** |
| 层级 | **cutover 后可补的 diagnostics composite / site-runtime follow-up** |
| public surface | 不单独升格为 Tier 1 capability |
| 依赖 | `page.screenshot` + highlight / locator 能力组合 |

**原因：**
- 本质是组合动作，不是基础原语
- 旧仓里 `cropToElement` / `padding` 等参数与实现存在漂移
- selector-based highlight 路线与 UID-based 主路径不统一

### 3) `download_image`

| 结论项 | 裁决 |
|---|---|
| 是否 cutover 前必需 | **否** |
| 层级 | **cutover 后可补的 product/workflow export ability** |
| 是否进入 `page.*` / `tabs.*` | **否** |
| 当前是否需要 follow-up issue | **否**（延后，等明确产品需求） |

**原因：**
- 语义是“导出已有 artifact”，不是“操控页面完成任务”
- 旧仓执行只是 fire-and-forget anchor download，不是稳定 substrate contract
- 若未来保留，应以 export/artifact 语义设计，而非伪装成 browser automation 原语

### 4) `download_chat_images`

| 结论项 | 裁决 |
|---|---|
| 是否 cutover 前必需 | **否** |
| 是否 cutover 后建议进入主链 | **否，暂不纳入主链** |
| 层级 | **明显属于 product/workflow layer** |
| 当前是否需要 live follow-up issue | **否** |

**原因：**
- 参数 shape 直接耦合 `messages[].parts[].imageData`
- 这是聊天产品层导出动作，不是通用 runtime substrate
- 若未来复活，应在更上层 workflow / export surface 重做，而不是迁旧工具名

## 最终分层结论

| Surface | 分类 | 去向 |
|---|---|---|
| `page.screenshot` | cutover 前必需 | substrate capability |
| `screenshot_with_highlight` | cutover 后可补 | diagnostics composite / site-runtime follow-up |
| `download_image` | cutover 后可补 | product/workflow export layer |
| `download_chat_images` | 暂不纳入主链 | product/workflow only |

## 对 follow-up backlog 的影响

### 已完成的 follow-up

- **ISSUE-057**
   - 已落地 `page.screenshot` descriptor + `chrome.tabs.captureVisibleTab` 最小 runtime path
  - 无需为 screenshot 另建新 issue

### 当前不新增 follow-up 的部分

- `download_image`
- `download_chat_images`
- `screenshot_with_highlight`

原因：这些都不是 cutover blocker；在产品面未重新定义前，继续建实现 issue 只会把旧工具名和旧 payload shape 带回主线。

## 对其他迁移文档的同步要求

本结论要求同步到：

1. `docs/cutover-readiness-criteria.md`
   - Soft Gate 3 标记为边界已裁决
2. `docs/legacy-to-vnext-migration-matrix.md`
   - screenshot/download row 从“纯未开始”更新为“边界已裁决，且 `page.screenshot` 已由 ISSUE-057 落地”
3. `docs/migration-parity-dashboard.md`
   - visual/download/intervention parity 需写清：screenshot boundary 已锁定，download 延后，intervention 已定性但 lifecycle integration 仍未完成
4. `docs/browser-automation-cutover-boundary.md`
   - 与本文件的 screenshot/download 分层保持一致

## 一句话裁决

- **Screenshot 要进 cutover 前主链，但只保留 `page.screenshot` 这一个最小视觉原语。**
- **Download 不进 cutover 前主链，也不应进入 `page.*` substrate；最多在未来作为 product/workflow export ability 重做。**
- **Intervention 已单独裁决为 cutover 前必需，但当前先落在 runtime handoff contract，不新造 screenshot/download 旁边的平行 capability family。**
