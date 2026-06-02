# Browser Automation First Principles

本文件记录 browser automation lane 的第一性原则。它的优先级高于旧仓迁移清单、AIPex alignment 文档和任何旧的 Tier 拆分表；后续设计若与本文冲突，先更新本文并得到明确确认。

## Core Claim

当前模型已经足够强，浏览器工具链不应该再试图用代码重建一个“半智能浏览器代理”。代码层的职责是提供少数可靠动作和完整证据；当前对话中的 Codex Agent（或被明确调用的另一个 Agent 体）负责观察、判断、选择下一步。

## Non-Negotiables

1. **少数强原语优先**
   - 默认 surface 只保留能组合出大多数任务的动作：`page_info`、`screenshot`、`click_xy`、`type_text`、`press_key`、`scroll`、`js`、`cdp`、`tabs`、`wait`。
   - 新增 browser action 前，先证明它不能由这些原语清晰组合出来。

2. **Agent 判断，不让代码判分**
   - 不实现 runtime-owned 成功评分器、置信分、智能排序、自动验收分或隐式质量标准。
   - 代码可以记录证据：截图、URL、title、tab、网络请求/响应/失败、CDP 返回、错误、耗时、before/after 状态。
   - 这些证据属于 debug / observability surface；不要把 evidence envelope、raw events、截图 data URL 或 trace 塞进普通 Chat 的 LLM context。
   - 真实页面的完整 DOM/query/screenshot/network 证据只进 artifact；普通 Chat LLM context 只能拿压缩后的观察结果和可执行下一步所需的最小字段。
   - `no_progress` / repeat-signature / ping-pong 这类模式只能作为 debug 诊断信号；不能由 runtime 自动终止 browser task。
   - 是否成功、下一步怎么走，由当前对话里的 Codex Agent 基于证据显式判断；如果需要第二意见，也应调用另一个 Agent 体判断，而不是把判断写成普通业务代码。

3. **不要重建旧仓的智能中间层**
   - 不做复杂 locator planner、UID ranking、semantic stabilizer、automatic fallback tree、hidden recovery engine。
   - `page.query` 只能是简单 DOM 读取辅助，不是浏览器操作主线，也不能演化成旧仓 `search_elements`/UID/search/score 系统。
   - `verify` 只能是显式动作或用户/Agent 可见证据；不要在 runtime 里偷偷替 Agent “判定已完成”。

4. **Browser Harness lane 是北极星**
   - 优先学习 `/Users/envvar/work/repos/_research/browser-harness` 的形态：少量 Python helpers、真实浏览器 CDP、截图优先、坐标点击、原始 JS/CDP 兜底。
   - 旧仓 AIPex alignment 只作为历史参考和反面边界，不能作为 vNext browser lane 的默认设计目标。

5. **Dogfood 从最简单动作开始**
   - 每个 browser lane 改动都要能用真实或近真实场景 dogfood：先截图/读状态，再做一个最小动作，再重新观察。
   - 本地假页面只能作为 extension 管线 smoke；不能替代真实站点、真实登录态、真实网络请求和真实 UI 输出。
   - 手动或外部 browser 操作只能作为 diagnostic control：确认真实网站状态、可行路径和预期证据；不能算产品通过。
   - 需要登录态时优先使用 dogfood 专用固定 browser profile；如果站点限制导致无法重新登录，可以 claim 用户已打开的真实 Chrome tab，但产品侧仍必须走 MV3 sidepanel/chat/kernel/tool-call 路径。
   - claim 用户真实 Chrome tab 只能作为显式 debug bridge：不读取 cookies、localStorage、profile secrets 或密码；它只负责执行产品发出的少数 browser 原语，并把完整证据落 artifact。
   - X/已登录态 dogfood 不能把“临时 Chrome for Testing profile 里的产品 sidepanel”与“用户真实 Chrome 登录态 tab”混合后算作产品通过；该混合模式只能标为 diagnostic/control。产品通过必须来自同一个已登录 Chrome profile 内的产品 MV3 sidepanel/runtime，或明确记录为阻断。
   - 若 dogfood 需要更宽 host 权限，必须通过显式 debug-only extension 副本完成；不要把该权限静默写回正常产品 manifest。
   - 可以发散多个场景，但每个场景都应保持“动作少、证据清楚、当前 Agent 自己判断路径优劣”。
   - dogfood 结论用当前 Agent 的自评和证据说明表达；测试代码只锁接口和回归，不替 Agent 打分。

6. **不保留包袱，不写防御性兼容**
   - 不因为旧仓写过、当前仓已经实现、测试里已经断言、文档里已经列过，就默认保留某个 browser abstraction。
   - 不为旧工具名、旧 UID 语义、旧 verify 行为或历史 fallback 路径写防御性兼容代码。
   - 只认 dogfood 后证明更简单、更可用、更容易被 Agent 判断和调试的路径；从最简单动作试起，留下好用的，删掉或降级不好用的。

## Default Dogfood Loop

1. Observe: `page_info` + `screenshot`，必要时 `js` 读少量状态。
2. Decide: 当前 Codex Agent 说明它看到什么、为什么选这个动作。
3. Act: 调一个最小原语，例如 `click_xy`、`type_text`、`press_key`、`scroll`。
4. Re-observe: 再拿 `page_info` + `screenshot` 或 `js`。
5. Self-evaluate: 当前 Codex Agent 根据证据判断是否推进、失败、卡住或需要换路径。
6. Record: 保存动作、证据、Agent 判断和下一步，不写代码评分器。

## Explicitly Not The Goal

- 不是 Browser Automation Framework 2.0。
- 不是复刻旧仓 AIPex/UID/search/verify/fallback 体系。
- 不是把 Playwright/actionability、DOM ranking 或业务验收规则硬编码进 runtime。
- 不是让测试脚本决定“这个网页任务做得好不好”。
- 不是为了兼容旧仓、旧文档或当前已有实现而保留复杂路径。
