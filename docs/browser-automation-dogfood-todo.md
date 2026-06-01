# Browser Automation Dogfood To Do

本文件把 2026-05-31 的 browser automation 讨论整理成可执行 To Do。第一性原则见 `docs/browser-automation-first-principles.md`；本文件只负责把原则转成下一步行动。

## Current Goal

把 vNext browser lane 从旧仓式复杂自动化收敛为 Browser Harness 式少数原语：

- 工具只提供动作和证据。
- 当前 Codex Agent 或显式调用的另一个 Agent 体负责判断。
- 不用普通代码打分、排序、隐式 verify 或做防御性兼容。
- 只保留 dogfood 后证明简单、好用、可调试的路径。

## Done

- [x] 找到并更新 `/Users/envvar/work/repos/_research/browser-harness`。
- [x] 修复本机 `browser-harness` 入口，重新 `uv tool install -e . --force`。
- [x] 验证 `browser-harness --version`、`browser-harness --doctor`、`page_info()` 可用。
- [x] 梳理旧仓两条来源：
  - 旧仓已提交主线主要是 AIPex alignment。
  - 真正值得学习的 dogfood 路径是 Browser Harness 的少数动作。
- [x] 固化 `docs/browser-automation-first-principles.md`，并在 `AGENTS.md` / locked decisions / source-of-truth 中设为硬边界。
- [x] 跑通第一组 5 个 controlled Browser Harness dogfood 场景，报告见 `docs/browser-automation-dogfood-report-2026-05-31.md`。
- [x] 跑通一次真实 X bookmarks 场景的产品路径 dogfood：MV3 sidepanel/chat/kernel 发起 tool-call，external-page debug bridge claim 用户已登录 Chrome tab 执行动作，latest artifact 在 `.ml-cache/dogfood/existing-chrome-mv3-2026-05-31T14-07-29-084Z/`。
- [x] 跑通一次真实 MDN 搜索表单产品路径 dogfood：MV3 sidepanel/chat/kernel 通过 `page.info -> page.fill -> page.press_key -> page.info -> page.click -> page.info -> page.screenshot` 完成搜索并生成最终回答，latest artifact 在 `.ml-cache/dogfood/real-browser-network-2026-05-31T14-29-34-742Z/`。

## Now: 5 Minimal Dogfood Scenarios

这些场景用于找出最简单可用路径。每个场景只要求证据和 Agent 自评，不允许写代码评分器。

### 1. Static Page Sanity

- 动作：打开一个简单页面，跑 `page_info` + `screenshot`。
- Agent 判断：当前页是否可观察，截图是否足够支撑下一步动作。
- Done when：能用一句话解释页面状态，并指出下一步最小动作。

### 2. Coordinate Click

- 动作：通过截图判断按钮位置，使用 `click_xy` 点击，再重新截图。
- Agent 判断：按钮是否发生可见状态变化。
- Done when：不依赖 DOM selector / UID / locator ranking，也能确认点击是否推进。

### 3. Keyboard Text Input

- 动作：点击输入框，使用 `type_text` / `press_key` 输入并提交。
- Agent 判断：输入内容或页面反馈是否符合预期。
- Done when：能说明是输入、提交、焦点还是页面逻辑出了问题。

### 4. Scroll And Observe

- 动作：截图后滚动，再截图或 `page_info`。
- Agent 判断：是否进入新内容区域，是否需要继续滚动或换路径。
- Done when：不需要 DOM snapshot 也能判断滚动是否有效。

### 5. JS/CDP Escape Hatch

- 动作：仅当截图/坐标不足时，用 `js` 或 `cdp` 读少量状态。
- Agent 判断：这次 escape hatch 是否真的减少复杂度，而不是重新发明 locator。
- Done when：明确保留该 helper 的理由，或把它降级/删除。

## Implementation To Do

### P0: Make Evidence Visible

- [x] 每个 browser action 在 observability debug event 中输出统一 evidence envelope：action、input、tab/url/title、elapsed、result、error。
- [x] 对可视动作明确记录 before/after screenshot 暂未由当前 runtime path 捕获的原因；后续接入截图引用时仍必须保持 debug-only。
- [ ] UI 中把 action evidence 展开给当前 Agent/用户看，不要只显示成功/失败。
- [x] evidence envelope、raw events、trace、截图 data URL 不进入普通 Chat LLM context；normal chat tool event 也只保留瘦身后的 tool result。

### P1: Align Public Surface With Browser Harness

- [ ] 新增或重命名为 Agent 友好的原语：`page.info`、`page.screenshot`、`page.click_xy`、`page.type_text`、`page.press_key`、`page.scroll`、`page.js`、`page.cdp`、`tabs.*`、`page.wait`。
  - 2026-05-31：`page.info` 已补成最小可见页面摘要，用于 URL/title/viewport/visible text/interactive element boxes；它不排序、不评分、不判断成功。
- [ ] 将 `page.query` 定位为简单 DOM 读取辅助，不作为默认主线。
- [ ] 评估并降级 UID-only `page.click` / `page.fill` 的默认暴露；不为旧 UID 语义写兼容层。
- [ ] `page.cdp` 默认 debug-gated；它是 escape hatch，不是让普通流程复杂化的入口。

### P2: Dogfood Report Loop

- [ ] 为每次 dogfood 记录一个简短报告：目标、动作序列、证据、Agent 自评、下一步。
- [ ] 真实站点 dogfood 必须收集：任务页截图、产品 UI 截图、chat transcript、observability timeline/raw events、网络请求/响应/失败。
- [ ] 手动或外部 browser 操作只能作为 diagnostic control：用于确认真实网站当前状态、可行路径和预期证据；不能算产品通过。产品通过必须来自 MV3 sidepanel/chat/kernel/tool-call 路径自己的 transcript、UI 截图、network 和 observability artifacts。
- [x] 用同一报告格式跑通 X bookmarks: 搜索 `agent`，对第一条执行 like；如果登录态或站点策略阻断，记录真实阻断证据和 exact failing request，而不是改成本地假站。
  - 2026-05-31 结果：产品路径确认第一条已是 `Liked`，因此没有重复点击避免 unlike；证据含任务页 before/after、sidepanel、chat bootstrap、observability timeline/raw tail、产品网络事件。
  - 暴露缺口：`page.query` 原始结果一度把整页大 DOM 塞进 LLM tool message；已改为 LLM 只收 compact result，完整 query JSON 只进 artifact，latest run 的 query tool results 约 4-5KB。
- [ ] 发散至少 3 个非 X 真实场景：表单输入、长页面滚动、需要网络请求分析或 JS/CDP escape hatch 的页面。
  - GitHub search dogfood 通过：`.ml-cache/dogfood/real-browser-network-2026-05-31T14-10-25-938Z/`，154 requests / 153 responses / 0 failures。
  - Google Maps dogfood 通过：`.ml-cache/dogfood/real-browser-network-2026-05-31T14-11-28-538Z/`，291 requests / 280 responses / 0 failures。
  - MDN search dogfood 初轮暴露观察缺口：`.ml-cache/dogfood/real-browser-network-2026-05-31T14-12-04-524Z/`，`page.query` 找不到可见搜索框，`page.screenshot` 的 raw image 被 debug-only 剥离后 LLM 只能看到 `{format:"png"}`，因此补 `page.info` 而不是加 locator scoring。
  - MDN search dogfood 二轮暴露隐藏 runtime 判断缺口：`.ml-cache/dogfood/real-browser-network-2026-05-31T14-23-28-806Z/` 在成功 `page.info` + `page.fill` 后被 `progress_uncertain` 提前停住；处理方式是把 no-progress detection 降为只读诊断信号，不再由代码终止 run。
  - MDN search dogfood 三轮暴露 nested kernel phase 缺口：`.ml-cache/dogfood/real-browser-network-2026-05-31T14-26-30-734Z/` 已完成搜索但 compaction 时发现内部 page action 无条件暂停外层 chat loop；处理方式是仅当 page action 自己启动/恢复 run 时才 settle，不暂停已在 running 的外层 loop。
  - MDN search dogfood latest 通过：`.ml-cache/dogfood/real-browser-network-2026-05-31T14-29-34-742Z/`，81 requests / 81 responses / 0 failures，sidepanel 输出最终回答，task screenshot 显示 `WebSocket` 搜索结果页。
- [ ] 每轮 dogfood 后只做一个判断：保留、简化、删除、或继续试。

当前真实站点 runner：

```bash
bun run dogfood:real-browser -- --url=https://x.com/i/bookmarks --prompt="搜索我的推特收藏的书签，搜索 agent，然后给第一条点一个like"
```

runner 默认从 `~/.codex/config.toml` 读取 `model_providers.rs` 的 `base_url` / `experimental_bearer_token` / 当前 `model`，只把 provider、model、baseUrl、api 写进报告，不记录 token。runner 还会为 dogfood artifact 生成一个临时 debug extension 副本，给该副本加 `host_permissions: ["<all_urls>"]`，用于截图、page hook 和真实站点观测；正常 `apps/mv3-shell/manifest.json` 仍保持 active-tab-only。需要复现产品原始权限阻断时，加 `--no-debug-host-permissions`。

需要复用登录态时显式传入 dogfood 专用 profile：

```bash
bun run dogfood:real-browser -- --profile-name=x-bookmarks --prepare-login --url=https://x.com/i/bookmarks
```

这会打开一个固定 profile 的真实 Chromium 窗口并加载当前 MV3 build；用户登录完成后，用同一个 profile 运行真实任务：

```bash
bun run dogfood:real-browser -- --profile-name=x-bookmarks --url=https://x.com/i/bookmarks --prompt="搜索我的推特收藏的书签，搜索 agent，然后给第一条点一个like"
```

真实生产 dogfood 优先使用这个固定 profile，因为它能同时控制 unpacked extension、sidepanel、网络事件采集和报告落盘。用户正在使用的 Chrome 窗口默认只作为人工对照；只有站点登录策略让固定 profile 不可用时，才使用下面的 existing-Chrome debug bridge。

当站点限制导致固定 profile 无法登录时，使用 existing-Chrome debug bridge claim 用户已打开的真实 tab：

```js
const mod = await import("/Users/envvar/work/repos/snowy/browser-brain-loop-next/scripts/dogfood-existing-chrome-tab.js");
await mod.runExistingChromeDogfood({
  tabUrlMatch: "https://x.com/i/bookmarks",
  prompt:
    "搜索我的推特收藏的书签，搜索 agent，然后确认第一条结果已经 liked；如果还没有 liked 才点 like。执行前后都要用页面证据确认，不要重复取消 like。",
});
```

这个 runner 必须在 Codex browser-client 可访问的运行环境里执行，因为普通 `bun/node` 不能 claim 用户已有 Chrome tab。它不读取 cookies/localStorage/profile secrets，只把产品发出的 `tabs.*` / `page.*` 请求映射到用户 tab，并把完整证据写入 `.ml-cache/dogfood/...`；返回给普通 Chat LLM context 的 `page.query` 结果必须保持 compact。

本地 fixture 只允许作为 release smoke / 管线 smoke，不作为生产式 dogfood 主证据。

### P3: Remove Old-Path Pressure

- [ ] 审查现有 docs/test 是否把 `page.query`、UID、verify pipe 写成主线。
- [ ] 删除或改写会鼓励评分器、智能 locator、hidden fallback 的描述。
- [ ] 新增 capability 前必须先跑一个 dogfood report，证明少数原语组合不够。

## Definition Of Done

本目标完成时，应满足：

1. 后续 Agent 能从本文件直接知道下一步先试哪 5 个场景。
2. 代码和文档都不把旧仓复杂路径当成默认方向。
3. 至少一个真实 dogfood 报告证明：当前 Agent 基于证据判断，而不是代码评分。
4. 每个新增 browser action 都能解释为什么它比“少数原语组合”更简单。
