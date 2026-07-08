# 产品续航规划：从复刻章节到产品章节

> date: 2026-07-08
> status: active planning truth
> scope: 复刻章节收口之后，本仓作为产品（白雪 / Browser Brain Loop Next）的主线规划
> supersedes: 以 migration parity / cutover evidence 为默认派工来源的规划方式

## 一句话结论

复刻章节已经完成并有可复现证据；项目卡住不是因为复刻没做完，而是因为没有人宣布它做完，也没有为"产品章节"定义新的北极星。本文件负责这两件事：正式关闭复刻章节，并把接下来的主线定义为四个产品里程碑（M1 能用 → M2 能看见 → M3 新一代油猴脚本 → M4 极致探索），同时砍掉一批已经确认错误或过时的决策。

## 0. 本次规划验证过的事实（2026-07-08）

规划不引用陈旧文档，以下事实在本次规划环境中重新验证：

- `bun run release:acceptance` → `ok: true`：文档 gate、扩展构建、真实 Chromium MV3 smoke、`bun run check`（typecheck + lint + 729 tests）全部通过。
- `bun run release:cutover:status` 唯一 blocker 是执行环境缺 Playwright Chromium（安装后消除），不是产品缺口。
- live queue 为空、无 active lease；外部验收决策已于 2026-05-27 记录（PR #2 merge，旧仓 `catoncat/browsir` 已切 maintenance mode）。
- 产品面真实状态（代码级核对，非文档转述）：
  - sidepanel 是功能面完整的开发者预览：聊天 + 流式输出 + Run Activity 时间线 + 会话 CRUD + 模型路由配置 + Skills 管理 + 调试面板。
  - 会话不跨 Service Worker 重启持久化：`apps/mv3-shell/src/runtime-services.ts` 的 `createSessionStorage()` 调 `BrowserVfs.create({ workspaceId })` 时未传 `store`，`VfsSessionStorage` 实际落在纯内存 VFS 上；技能包路径反而有 `createChromeStorageVfsStore`。
  - 产品内 Chat Agent 看不见截图：`page.screenshot` 的 `dataUrl` 在 `packages/kernel/src/llm-message-model.ts` 的 debug-only 剥离层被移除，kernel 消息模型只有 `text` / `toolCall` block，没有 image block；`click_xy` 因此对产品内 Agent 接近盲操作。
  - LLM 适配只有一个 OpenAI-compatible provider（Responses / Chat Completions 双模式，含 SSE 流式与重试），无 Anthropic / Gemini 原生 adapter，无多模态。
  - 技能编辑是假编辑：`App.vue` 的 `editSkillPackageDraft` 不回读 VFS 里已安装的 `SKILL.md` / `handler.js`，保存即覆盖重装。
  - 技能"运行"是 prompt 技巧：`/skill:id` 只把技能文本拼进 context，`skills.invoke` 不在默认 chat 工具面，handler 不保证执行。
  - 空状态 suggestion 卡承诺"关掉重复标签页"，但工具面没有 `tabs.create` / `tabs.close`。
  - 无 onboarding / API key 首跑引导；LLM 未配置时返回英文 fallback 文案。
  - 内置示例技能为零，新装扩展的技能库是空的。

## 1. North Star Check

### 1.1 产品定性

本产品是一个浏览器原生的 Agent 工作台，三个支柱正好对应最初的三个目标：

1. 一个真正能操作浏览器的对话 Agent（sidepanel 聊天 + 少数强原语 + 完整证据）。
2. Skill = 新一代油猴脚本：由 Agent 从成功会话生成、站点感知、可版本化、可回滚、可自愈、可分享的自动化单元。
3. 美妙的用户体验：开箱即用、诚实的能力面、看得懂的运行过程。

### 1.2 与 2026 生态的对照

2026 年"边栏浏览器 Agent"已经是拥挤赛道：Gemini in Chrome / Claude in Chrome 是原生玩家，开源侧（chrome-buddy、BrowserKing、chrome-agent、Hermes-in-chrome 等）普遍具备多 provider BYOK + 截图视觉 + 坐标/DOM 双模操作 + 流式聊天。由此得出两个判断：

- "又一个边栏 Chat + 浏览器操作"不构成差异化；视觉（截图进模型）在业界是默认配置，本仓目前反而缺失。
- 本仓真正的差异化资产是别人没有的两层：
  - Skill 层：Agent 生成的可执行技能包 + 生命周期/版本/回滚/事件订阅/审计（ISSUE-172~185 已证明整条链路）。
  - 可靠性底盘：kernel 的会话树/压缩/干预/重试（约 246 个测试锁定），加 observability/audit 证据面。

### 1.3 北极星判断

复刻章节的北极星（"替代旧产品的能力链"）已达成；产品章节的北极星此前从未被定义，这就是"停留在复刻阶段很久"的结构性原因。从本文件起，产品北极星是：

> 让一个真实用户（首先是作者本人）每天打开这个扩展完成真实任务，并且能把做顺的任务固化成可重放、可自愈的 Skill。

## 2. Batch Retrospective：为什么会卡住

- 2026-05-27 复刻证据完成并被外部接受之后，5/28–6/02 的提交仍是 UX 迁移、dogfood 修补和证据刷新——复刻惯性没有被显式打断。
- 卡住机制有三条：
  1. 完成定义错位：目标一直是"替代旧产品"，而 parity 是渐近线，永远可以再补一行；"用户会爱用的新产品"从未成为验收标准。
  2. 工作流为并行迁移小票优化（backlog 180+ 文件、queue/lease/ledger 全套），真正的产品级断点（会话不持久、Agent 失明、技能假编辑）因为不在 parity 框架里而被归类为 deferred breadth，从未升为主线。
  3. 第一性原则文档把"截图/证据不进 LLM context"写成硬边界。这条规则写作时的场景是"外部 Codex Agent 驾驶 harness、证据落 artifact 由它自己看"，但被产品内 Chat Agent 原样继承，导致产品 Agent 天生失明——browser automation 永远达不到"想要的效果"，于是不断回头修补 page.info/observability，形成循环。
- 结论：不是执行力问题，是章节切换没有发生。本文件即章节切换动作。

## 3. Rot / Freshness Check：参考与文档腐坏清单

| 对象 | 状态 | 处置 |
|---|---|---|
| pi-mono 参考（kernel 编排来源） | 上游久未跟进，但 kernel 已被自己的测试网锁死，行为真相在本仓 | 视为自有代码；按产品需要演进（image block、真实 token 计量），不追上游对齐 |
| AIPex / 旧仓自动化参考 | 已被 first-principles 正确废弃为反面参考 | 维持 |
| browser-harness 参考 | 形态（少数原语 + 证据）仍成立；但"模型只看文本摘要"的假设已过时，2026 年视觉是默认 | 保留原语形态，修订视觉条款（见 4.B） |
| `docs/browser-automation-first-principles.md` | "证据不进普通 Chat LLM context"与产品内 Agent 需求冲突 | 按该文档自己的修订条款（先改文档再改设计）在 M2 第一步修订 |
| `docs/migration-parity-dashboard.md` 等 parity 文档 | skill authoring 标 green，但编辑器不能回读包内容；多处状态与代码不符 | 全部转为复刻章节历史参考，不再驱动派工 |
| `docs/module-tracking-ledger.json` | 模块分期反映迁移框架，不反映产品框架 | M0 执行时重排为产品模块（保留 Level 2 冻结证据的可校验性） |
| sidepanel suggestion 卡 | 承诺不存在的工具（关标签页） | M1 修正（补 `tabs.create/close` 或改文案） |
| "会话已持久化"的普遍印象 | `VfsSessionStorage` 存在但产品路径没接持久 store | M1 修复，这是产品 bug 不是 deferred breadth |

## 4. 砍掉清单（已获授权）

### A. 直接停止投入

- 旧插件生态批量迁移、parity dashboard 逐行补齐：永久 Not Now；复刻章节以代表性能力链证明收口，不做全量搬迁。
- 外部商店提交流程的继续打磨：保留 `release:package:mv3` 一条命令即可；提交时机是"产品好用之后"的人类决策。
- 证据刷新型小票（刷新 acceptance 文档、重录 evidence）：release evidence 只在真的推进发版时刷新。
- SiteSkillRegistry 作为"站点包平台"的产品化：保留 `invokeSingleActionSiteSkill` 内部 adapter 形态；站点包平台不做。
- 追 pi-mono / AIPex 上游对齐类工作。

### B. 决策反转（正式改口）

1. "截图与证据永不进普通 Chat LLM context" → 改为"预算化的视觉上下文是产品内 Agent 的一等输入"。原始完整 artifact（全量 DOM、raw events、原始截图文件）仍然只走 debug/observability；进 context 的是经过缩放与保留策略（最近 N 张、旧图淘汰为引用）的图片 block。这是 M2 的地基，必须先修订 first-principles 文档本身。
2. "复刻完成 = 主线完成" → 复刻章节关闭；`AGENTS.md` / source-of-truth / task-index 的主线指向本 roadmap。
3. "技能运行 = prompt 注入" → `skills.invoke` 成为真实工具面成员（确认门控），技能从 prompt 技巧变为确定性执行。

### C. 降级 / 冻结（代码保留，不作主线）

- `page.query`：维持 debug-only。
- kernel child-run API：冻结，等多 Agent 里程碑（M4）再启用。
- provider registry 的 `vision` capability 标签：M2 落地前不对外宣称。
- 单文件巨物（`App.vue` ~3.6k 行、`runtime-services.ts` ~5.3k 行、`core/index.ts` ~3.6k 行）与 `@ts-nocheck`：不做专项重写票，随 M1-M3 顺路拆分收敛，防止大爆炸重构。

### D. 流程减负

- backlog / queue / lease 机制保留（多 Agent 并行仍需要），但：
  - planning truth 增加本 roadmap；批次从"parity 表格行"改为"1-3 张用户可感知的里程碑票"。
  - 每个里程碑收口必须附一次真实 dogfood 记录（目标、动作、证据、自评），而不是 parity 表格状态翻绿。

## 5. Recommended Next Milestones

### M0 关章（本次规划完成大半）

- [x] 宣布复刻章节完成（依据：0 节验证事实 + 2026-05-27 外部接受记录）。
- [x] 主线文档改口：`AGENTS.md`、`docs/agent-task-index.md`、`docs/source-of-truth-map.md` 指向本 roadmap。
- [x] M1 批次落 backlog 并重建 live queue。
- [ ] 台账与 gate 收尾（ISSUE-192）：module ledger 重排为产品模块框架；`scripts/release-acceptance.ts` 的 ledger 检查固定到 Level 2 冻结模块集，使后续新增产品模块不破坏历史证据 gate。

### M1 能用：可日用的助手（本批次，3 张里程碑票）

判断标准（整体 DoD）：一个新用户 10 分钟内从 load unpacked 走到完成第一个真实网页任务；作者本人可以每天用它做至少一件事。

1. ISSUE-189 会话与运行状态跨重启持久化（p0）
   - `createSessionStorage()` 接真实持久 store（复用/扩展 `createChromeStorageVfsStore` 或 `IndexedDbVfsStore`），SW 重启后会话历史与最近运行可回读。
2. ISSUE-190 首跑体验与诚实工具面（p0）
   - 首跑向导：未配置 LLM 时聊天区出现引导卡而不是英文错误；模型配置入口一步可达；文案中文一致。
   - suggestion 卡与真实工具面对齐；以明确产品理由把 `tabs.create` / `tabs.close` 提升进粗粒度 tabs 原语（这是 cutover packet 允许的"具名提升 deferred breadth"路径）。
3. ISSUE-191 技能编辑真实回读 + 内置示例技能 + 运行语义诚实化（p1）
   - 编辑器回读已安装包的 `SKILL.md` / `handler.js`；预置 2-3 个内置示例技能；"运行"按钮要么走真实 invocation，要么明确标注为 prompt 模式。

### M2 能看见：视觉化 Agent（下一批次，落票前先修订 first-principles）

1. 修订 `docs/browser-automation-first-principles.md` 视觉条款（决策反转 B1 的文档动作）。
2. kernel 多模态：`llm-message-model` 增加 image content block；OpenAI-compatible provider 发送 `input_image` / `image_url`；per-model vision 能力探测与文本降级。
3. 截图上下文预算：缩放（例如最长边 1024-1280）、最近 N 张保留、旧图淘汰为 artifact 引用；原始文件仍走 debug bundle。
4. 原语补全：`page.wait`；评估 `page.js` 作为显式 escape hatch；`click_xy` 自此有视觉依据。
5. 收口标准：X bookmarks 只读场景与 MDN 搜索场景在产品 sidepanel 内由视觉驱动完成，dogfood 报告落盘（复用 `bun run dogfood:real-browser` 与 existing-Chrome debug bridge）。

### M3 新一代油猴脚本：Skill 成为产品灵魂（M2 之后）

1. "固化为技能"：Agent 把当前成功会话生成 skill 包（SKILL.md + handler.js + site metadata + verifier），走既有 `skills.install` setupPlan 路径。
2. `skills.invoke` 进默认工具面（确认门控 + 权限展示），技能可被 Agent 与用户确定性重放。
3. 站点感知浮现：active-tab 匹配到的技能出现在 composer 快捷区（site metadata 已在 `skills.summary` 里）。
4. 自愈循环：verifier 失败 → Agent 基于证据提修复 → 新版本 → 已有的 snapshot/rollback 兜底。
5. 轻量分享：技能包导出/导入（文件级），不做商店。
6. 收口标准：在一个真实站点"教"会 Agent 一个任务一次，之后一键重放成功；站点改版导致失败时，能走一轮自愈或回滚。

### M4 极致探索：Agent 在扩展环境的上限（持续轨道，dogfood 门控）

- 多 provider 原生 adapter（Anthropic Messages / Gemini）与 computer-use 风格 loop 评估。
- 后台/多标签长任务、`chrome.alarms` 定时技能、跨标签工作流。
- CDP escape hatch（`chrome.debugger`）：只有 dogfood 证明"少数原语组合不够"才加。
- 多 Agent（child-run 解冻）：主对话 Agent 调用第二意见 Agent。
- 每一项都走"最小 dogfood → 保留 / 简化 / 删除 / 继续试"纪律，不预设保留。

## 6. Not Now

- 站点包平台化（bb-sites 式 per-site 官方包生态）
- 商店上架与分发运营（直到 M2/M3 产品自证）
- 企业/团队/多用户特性
- stealth / anti-detection 模式
- bulk debug export、observability 导出 breadth
- 多远程 Execution Host 舰队管理 UX
- MCP 投影面扩展
- 全量 UI 视觉重设计（随里程碑顺路优化）

## 7. 执行方式与真相源变化

- 本文件加入 planning truth：规划批次由 M 里程碑推导，不再由 parity 表推导。
- dispatch 机制不变：backlog frontmatter → `bun run workflow:queue:build` → live queue → lease。
- 里程碑票的验收都指向本文件对应小节 + 聚焦测试命令；收口必须包含真实 dogfood 记录。
- `bun run release:acceptance` 保留为复刻章节历史 gate（冻结语义）；产品章节的质量线是 `bun run check` + 各里程碑 DoD。
- 当 queue 为空且无 active lease 时：先对照本 roadmap 检查当前里程碑是否真正收口（含 dogfood 证据），再规划下一批 1-3 张里程碑票；不要回退到 parity 拆票模式。
