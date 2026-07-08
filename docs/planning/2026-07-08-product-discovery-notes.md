# 2026-07-08 产品规划对话：调查笔记与决策记录

> date: 2026-07-08
> status: planning archive（历史调查记录，不替代 live dispatch）
> related: `docs/product-roadmap-2026-07-08.md`
> agent_run: https://cursor.com/agents/bc-bdf68c8b-a8ed-4e5b-a84e-879873a1429f
> merged_to_main: `a010356`（2026-07-08）

本文件固化 2026-07-08 规划对话中的**代码级调查结论**与**决策过程**，供后续 agent / 人类复盘。执行真相仍以 roadmap + live queue + issue 为准。

---

## 1. 用户原始诉求（对话起点）

用户感到项目长期停留在「复刻旧版」阶段，希望继续推进但方向不清。三个长期目标：

1. **新一代油猴脚本**：Skill 作为可版本化、可分享、Agent 可参与的站点自动化单元。
2. **浏览器插件环境下的 Agent 极致**：在 MV3 约束下探索 Agent 能走多远。
3. **美妙的用户体验**：不是开发者预览，而是日常可用的产品。

用户明确表示：**可以接受砍掉错误决策和功能点**；参考来源（pi-mono、browser-harness、AIPex 等）可能已过时。

---

## 2. 规划方法（本次对话实际做了什么）

1. 按 `docs/agent-task-index.md` onboarding：读 task index → source-of-truth → cutover packet → module ledger。
2. **不盲信文档**：用 `src/` + `test/` + 命令输出交叉验证。
3. 运行 `bun run release:acceptance`（初跑因缺 Playwright Chromium 失败；`npx playwright install chromium` 后 `ok: true`）。
4. 并行代码盘点：
   - **MV3 产品面**：`apps/mv3-shell/src/sidepanel/`、`runtime-services.ts`、`background.ts`
   - **Kernel**：`packages/kernel/src/` 全模块 + 测试覆盖
   - **浏览器 lane**：`page-hook.ts`、`site-runtime`、`core` capability catalog
5. 对照 2026 年浏览器 Agent 生态（Gemini in Chrome、chrome-buddy、BrowserKing 等）。
6. 产出 roadmap、M0/M1 backlog、主线文档改口、live queue 重建。
7. 合并到 `main`：`c5e5aa2..a010356`（fast-forward）。

---

## 3. 复刻章节状态（关键结论）

### 3.1 已完成且有证据

| 证据 | 结论 |
|---|---|
| `bun run release:acceptance` → `ok: true` | 文档 gate + 扩展构建 + 真实 Chromium MV3 smoke + 729 tests |
| `docs/release-cutover-decision-packet-2026-05-27.md` | 2026-05-27 外部接受；旧仓 browsir PR #3 → maintenance mode |
| `docs/module-tracking-ledger.json` | 非 deferred 模块均为 `shipped` |
| ISSUE-172 ~ ISSUE-185 | 旧产品替代闭环：install → persist → enable → invoke → audit |

**结论：复刻章节已完成；继续拆 parity 小票是错误方向。**

### 3.2 为何用户仍感觉「卡在复刻」

1. 完成定义是「替代旧产品」渐近线，不是「用户爱用的新产品」。
2. 5/28–6/02 提交仍是 UX 迁移、dogfood 修补、证据刷新——复刻惯性。
3. 三个真实产品断点被标为 deferred，从未升为主线（见第 4 节）。

---

## 4. 代码级产品断点（调查核心发现）

### 4.1 会话不持久（P0 bug）

**位置**：`apps/mv3-shell/src/runtime-services.ts`

```typescript
// createSessionStorage() — 产品路径
const vfs = await BrowserVfs.create({ workspaceId }); // 未传 store → 纯内存
return new VfsSessionStorage(vfs);

// createRuntimeBrowserVfs() — 技能包路径（对比）
const store = createChromeStorageVfsStore(chromeApi); // 有持久化
return BrowserVfs.create({ workspaceId, store });
```

**影响**：Service Worker 重启 / 扩展重载后，用户对话历史丢失。`VfsSessionStorage` 实现与测试是扎实的，只是 MV3 产品路径未接线。

**对应票**：ISSUE-189

---

### 4.2 产品内 Agent 看不见截图（架构级断点）

**链路**：

1. `page.screenshot` → `chrome.tabs.captureVisibleTab` → 返回 `{ dataUrl }`
2. `packages/kernel/src/llm-message-model.ts` — `LLM_CONTEXT_DEBUG_ONLY_KEYS` 含 `screenshot` / `dataUrl`
3. `stepResultToToolMessagePayload` 剥离这些字段
4. kernel 消息模型只有 `text` + `toolCall` block，**无 image block**
5. `loop-orchestrator.ts` — `buildBrowserActionEvidence` 标注 `contextPolicy: "observability_only_not_llm_context"`

**影响**：`click_xy` 对产品内 Chat Agent 接近盲操作；与 2026 年竞品（视觉默认开启）严重脱节。

**决策**：M2 反转「截图永不进 LLM context」；M2 第一步先修订 `docs/browser-automation-first-principles.md`。

**不在 M1 范围**（改动面大，需 first-principles 文档先行）。

---

### 4.3 首跑体验断裂（P0 UX）

| 现象 | 位置 / 原因 |
|---|---|
| 未配 LLM 时英文错误 | `runtime-services.ts` ~5163：`"No LLM provider is configured..."` |
| 模型配置入口深 | 顶栏齿轮 → 调试面板；模型在「更多 → 模型路由」 |
| 空状态过度承诺 | `App.vue` suggestionCategories：「关掉重复标签页」 |
| 工具面缺 tabs 原语 | catalog 仅有 `tabs.list/get_active/navigate`，无 `create/close` |

**对应票**：ISSUE-190（含以产品理由提升 `tabs.create/close`）

---

### 4.4 技能系统半成品（P1，M3 地基）

| 现象 | 位置 |
|---|---|
| 编辑不回读已有包 | `App.vue` `editSkillPackageDraft` — 重置占位模板 |
| handler.js 不可见 | 编辑器只有 SKILL 正文 textarea |
| 「运行」= prompt 技巧 | 管理页发 `/skill:id` 文本；`skills.invoke` 不在默认 chat 工具面 |
| 新装技能库为空 | `packageSkillManifests` 初始空 Map |

**已有扎实资产**（不要重写）：`skills.install` setupPlan、自动 snapshot、rollback、`skills.summary` 版本面（ISSUE-178~180）。

**对应票**：ISSUE-191

---

## 5. MV3 产品面盘点摘要

### 5.1 Sidepanel 功能矩阵

| 面板 | 完整度 | 备注 |
|---|---|---|
| Chat + 流式 + Run Activity | ✅ 完整 | `state.ts` reducer、`run-activity-pane.ts` |
| 会话历史 CRUD | ✅ 完整 | `session-history-pane.ts` |
| 模型路由配置 | ✅ UI 完整 | 无 onboarding；API key 不回显 |
| Skills 管理 | ⚠️ 管理完整、编辑假 | 见 4.4 |
| 运行调试 | ✅ 完整 | 偏开发者 |

### 5.2 Chat 驱动链路

```
App.vue sendPrompt()
  → runtime.chat.send
  → background.ts route
  → runtime-services.ts sendChatPrompt()
  → runLoop() (packages/kernel)
  → registry.projectTools({ audience: "chat", defaultExposedOnly: true })
  → dispatchCapabilityCall → page.* / tabs.*
  → emitRuntimeChatEvent → sidepanel applyChatEvent()
```

### 5.3 默认 LLM 工具面（11 个）

**page.\***：`info`, `click_xy`, `type_text`, `press_key`, `scroll`, `screenshot`

**tabs.\***：`list`, `get_active`, `navigate`

**诊断**：`runtime.capture_diagnostics`, `debug.bundle`

**刻意不暴露**：`page.query`（debug-only）、`skills.invoke`、`memfs.*`、`host.*`

来源：`packages/core/test/core.spec.ts` + `loop-orchestrator.ts` 投影逻辑。

### 5.4 技术债（不专项重写，顺路收敛）

- `App.vue` ~3644 行 god component
- `runtime-services.ts` ~5300 行
- `packages/core/src/index.ts` ~3642 行
- `background.ts` / `runtime-services.ts` 顶行 `@ts-nocheck`

---

## 6. Kernel 成熟度摘要

| 模块 | 状态 | 测试 |
|---|---|---|
| session-store / compaction / runLoop | 扎实 | loop-orchestrator.spec.ts 37 cases |
| OpenAI-compatible provider | 可用 | Responses + Chat Completions + SSE |
| 多模态 | ❌ 缺失 | 无 image content block |
| Provider 生态 | 仅 openai_compatible | 无 Anthropic/Gemini adapter |
| Token 计量 | 启发式字符估算 | 非 tiktoken |
| Child-run API | 骨架 | runLoop 未使用 |
| 会话持久化（产品路径） | ❌ 未接线 | VfsSessionStorage 测试有，产品无 store |

**pi-mono 参考**：视为历史来源；kernel 行为以本仓测试为准，不追上游对齐。

---

## 7. 浏览器自动化 lane 摘要

| 原语 | 实现 | 备注 |
|---|---|---|
| page.info/click_xy/type_text/press_key/scroll | page-hook MAIN world | active tab only |
| page.screenshot | captureVisibleTab | 不进 LLM |
| page.query | 有，defaultExposed: false | debug readback |
| page.js / page.cdp / page.wait | ❌ 未实现 | M4 dogfood 门控 |
| tabs.list/get_active/navigate | chrome.tabs API | — |
| site.fetch_with_session | page-hook fetch | credentials: include |

**site-runtime 用法**：产品路径用 `invokeSingleActionSiteSkill` 临时 registry，不是完整 SiteSkillRegistry 平台。

**CDP**：全仓无 `chrome.debugger`。

---

## 8. 2026 生态对照（规划输入）

竞品普遍具备：多 provider BYOK、Vision 模式、截图+坐标操作、流式 sidepanel。

本仓差异化（应强化，不应丢）：

1. **Skill 包生态**：lifecycle + version + rollback + event subscription + audit（Level 2 已证明）。
2. **Kernel 可靠性**：session tree、compaction、intervention、retry（246 tests）。

本仓缺口（M2 必须补）：视觉上下文、首跑体验、会话持久。

---

## 9. 已写入仓库的交付物（main @ a010356）

| 文件 | 作用 |
|---|---|
| `docs/product-roadmap-2026-07-08.md` | 产品章节北极星、砍掉清单、M0-M4 |
| `docs/backlog/2026-07-08-m1-*.md` | ISSUE-189/190/191 |
| `docs/backlog/2026-07-08-m0-*.md` | ISSUE-192 |
| `docs/workflow/live-queue.json` | 4 张可 claim 票 |
| `AGENTS.md` 等 | 主线改口 → roadmap |
| `docs/planning/2026-07-08-handoff-prompt.md` | 下一会话 handoff 提示词 |

**Commits**：

- `f5496ec` docs(plan): 定义产品章节续航规划
- `1eeca34` chore(backlog): 落地 M0/M1 里程碑票并重建 queue
- `a010356` docs(mainline): 主线指向产品 roadmap 并关闭复刻章节

**PR**：https://github.com/catoncat/Snowy/pull/21（内容已在 main，PR 可关闭）

---

## 10. 对话 transcript 导出说明

完整对话（含 `thinking` 推理字段、工具调用）不在 git 中，可通过：

- Cursor Agent 运行页：https://cursor.com/agents/bc-bdf68c8b-a8ed-4e5b-a84e-879873a1429f
- Cloud 环境曾导出至临时路径 `transcript.json`（~637KB），不随仓库持久化

**日常 handoff 优先读本目录 + roadmap + live queue**，不必依赖 transcript。

---

## 11. 明确不做（用户已授权，见 roadmap §6）

- 旧插件生态批量迁移、parity 逐行补齐
- 商店提交流程继续打磨（保留 `release:package:mv3` 即可）
- SiteSkillRegistry 平台化
- pi-mono / AIPex 上游对齐
- 巨型文件专项重写（App.vue / runtime-services 大爆炸 refactor）

---

## 12. 下一批执行顺序（建议）

1. **ISSUE-189**（p0）— 会话持久化；M1 地基，其他票受益
2. **ISSUE-190**（p0）— 首跑 + tabs.create/close；可与 189 并行（write_scope 不重叠）
3. **ISSUE-191**（p1）— 技能编辑 + 示例技能
4. **ISSUE-192**（p1）— 台账重排 + acceptance gate 冻结；可在 M1 末或并行

M1 整体 DoD：新用户 10 分钟跑通第一个真实网页任务；作者本人能每天用它做一件事。

M1 收口后 → 规划 M2（视觉 Agent + first-principles 修订）。
