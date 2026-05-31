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
- [ ] 将 `page.query` 定位为简单 DOM 读取辅助，不作为默认主线。
- [ ] 评估并降级 UID-only `page.click` / `page.fill` 的默认暴露；不为旧 UID 语义写兼容层。
- [ ] `page.cdp` 默认 debug-gated；它是 escape hatch，不是让普通流程复杂化的入口。

### P2: Dogfood Report Loop

- [ ] 为每次 dogfood 记录一个简短报告：目标、动作序列、证据、Agent 自评、下一步。
- [ ] 用同一报告格式跑通 X bookmarks: 搜索 `agent`，对第一条执行 like。
- [ ] 发散至少 3 个非 X 场景：表单输入、长页面滚动、需要 JS/CDP escape hatch 的页面。
- [ ] 每轮 dogfood 后只做一个判断：保留、简化、删除、或继续试。

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
