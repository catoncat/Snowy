# Handoff Prompt：Browser Brain Loop Next 产品章节（M1 开工）

> 用途：复制下方「可直接粘贴的提示词」块到**新 Cursor 对话**开头，让下一个 agent 零上下文 loss 接手。
> 生成日期：2026-07-08
> main HEAD：`a010356`（已合并并 push 到 `origin/main`）

---

## 可直接粘贴的提示词（复制从这里开始到「提示词结束」）

```markdown
你是 browser-brain-loop-next（GitHub: catoncat/Snowy）的接手 Agent。上一段规划对话已完成「复刻章节关章 + 产品章节定义 + M1 批次落票」，全部已合并到 `main` 并 push。你的任务不是重新规划，而是**按已有 roadmap 推进 M1 里程碑**，默认从 ISSUE-189 开始 claim 并实现。

---

## 0. 强制 onboarding（动代码前必须读）

1. `docs/agent-task-index.md` — 任务入口
2. `docs/product-roadmap-2026-07-08.md` — **当前产品章节唯一规划真相**
3. `docs/planning/2026-07-08-product-discovery-notes.md` — 上一段对话的代码级调查结论
4. `docs/workflow/live-queue.json` — 当前可 claim 的 4 张票
5. 认领后只读：**当前 issue 文件** + `acceptance_ref` + issue 的 `write_scope` 内 `src/`/`test/`

**不要**默认全量读 review / batch / migration parity 文档；那些是复刻章节历史参考。

**不要**因为 queue 空就去跑 cutover planning 或拆 parity 小票。产品章节 queue 空 = 对照 roadmap 里程碑 DoD 收口或规划下一批 1-3 张里程碑票。

---

## 1. 项目是什么（30 秒版）

Chrome MV3 扩展 monorepo（bun + vitest + Vue 3 sidepanel）。产品名「白雪 / Browser Brain Loop Next」。

- **Kernel**（`packages/kernel`）：pi-mono 式 session/run/loop/compaction，~246 tests，OpenAI-compatible LLM only
- **Capability 面**（`packages/core`）：page.*/tabs.* 等 Browser Harness 原语
- **Skill 包**（BrowserVFS + JS Runner + skills.install/invoke/rollback）：新一代油猴脚本载体
- **产品壳**（`apps/mv3-shell`）：sidepanel 聊天 + Run Activity + Skills 管理 + 模型配置

用户三个长期目标：① 新一代油猴脚本（Skill）② 浏览器内 Agent 极致 ③ 美妙 UX。

---

## 2. 上一段对话的核心结论（你必须 internalize，勿重审）

### 2.1 复刻已完成 — 禁止回到 parity 模式

- `bun run release:acceptance` 已验证 `ok: true`（构建 + Chromium MV3 smoke + 729 tests）
- 2026-05-27 外部接受已记录；旧仓 maintenance mode
- **卡住原因**：没人宣布关章 + 无产品北极星 + 工作流惯性拆小票

### 2.2 三个真实产品断点（已在代码里核实，不是文档猜测）

| 断点 | 严重度 | 证据位置 |
|---|---|---|
| 会话 SW 重启后丢失 | P0 | `runtime-services.ts` `createSessionStorage()` 未传 VFS store |
| 产品内 Agent 看不见截图 | 架构（M2） | `llm-message-model.ts` strip dataUrl；无 image block |
| 技能假编辑 + 空库 + 运行= prompt | P1 | `App.vue` editSkillPackageDraft；无内置示例 |

### 2.3 已授权砍掉

- parity 逐行补齐、旧插件批量迁移、SiteSkillRegistry 平台化、pi-mono 上游对齐
- 「截图永不进 LLM」将在 M2 反转（M2 先改 first-principles 文档）
- 巨型文件（App.vue 3.6k / runtime-services 5.3k）不专项大爆炸 refactor

### 2.4 产品北极星（2026-07-08 起）

> 让真实用户（首先是作者）每天打开扩展完成真实任务，并把做顺的任务固化成可重放、可自愈的 Skill。

---

## 3. 当前里程碑与 live queue

**当前批次：M1「能用」** — 目标：新用户 10 分钟跑通第一个真实网页任务。

| 顺序 | Issue | 优先级 | 标题 | 并行 |
|---|---|---|---|---|
| 1 | ISSUE-189 | p0 | 会话与运行状态跨重启持久化 | 可与 190 并行 |
| 2 | ISSUE-190 | p0 | 首跑体验与诚实工具面（含 tabs.create/close） | 可与 189 并行 |
| 3 | ISSUE-191 | p1 | 技能编辑回读 + 内置示例 + 运行语义诚实化 | 可与 189/190 并行 |
| 4 | ISSUE-192 | p1 | M0 台账重排 + release acceptance gate 冻结 | doc-only，可任意时机 |

Issue 路径：`docs/backlog/2026-07-08-m1-*.md`、`docs/backlog/2026-07-08-m0-*.md`

**默认第一个 claim：ISSUE-189**（会话持久化是其他体验的地基）。

---

## 4. 你的工作流（必须遵守 AGENTS.md）

```bash
# 环境
bun install
# 若 release smoke 需要：npx playwright install chromium

# 认领（选一个稳定 agent 名，例如 atlas）
BBL_AGENT_NAME=atlas bun run workflow:claim

# 实现 → 聚焦测试（见 issue check_cmd）
# 例 ISSUE-189:
bunx vitest run packages/kernel/test/vfs-session-storage.spec.ts apps/mv3-shell/test/runtime-chat.spec.ts

# 收口（必须）
BBL_AGENT_NAME=atlas bun run workflow:done -- \
  --commit=HEAD \
  --implemented="..." \
  --check="bunx vitest run ..."

# backlog 变化后
bun run workflow:queue:build
```

**Completion Contract**（issue done 必须全部完成）：
1. code commit
2. issue frontmatter `status: done`
3. issue 追加 `## 工作总结`
4. issue 追加 `## 相关 commits`
5. 若影响 dispatch → `bun run workflow:queue:build`

---

## 5. ISSUE-189 实现提示（若你 claim 的是这张票）

**问题**：`createSessionStorage()` 用 `BrowserVfs.create({ workspaceId })` 无 store → 纯内存。

**已有先例**：同文件 `createRuntimeBrowserVfs()` 用 `createChromeStorageVfsStore(chromeApi)` 持久化技能包。

**建议方向**（非唯一解，以测试为准）：
- 让 session VFS 复用 chrome.storage store，或 IndexedDbVfsStore
- 路径：`mem://workspace/kernel/sessions/<id>/`（`VfsSessionStorage` 已定义 layout）
- 测试：`packages/kernel/test/vfs-session-storage.spec.ts` + MV3 restart round-trip

**write_scope**（勿越界）：
- `apps/mv3-shell/src/runtime-services.ts`
- `packages/kernel/src/vfs-session-storage.ts`
- `packages/browser-vfs/src/index.ts`
- 对应 test 文件

**不要顺手修**：视觉 Agent、技能编辑、onboarding（属于 190/191）。

---

## 6. ISSUE-190 实现提示（若 claim 190）

- 未配 LLM：中文引导卡 + 一步到模型配置；消灭英文 fallback
- suggestion 卡与工具面对齐
- 新增 `tabs.create` / `tabs.close`（粗粒度原语，带 risk/confirm）
- `packages/core/src/index.ts` 是单写者超级节点 — 本票是唯一碰它的 M1 票

---

## 7. 架构硬边界（locked decisions，勿违反）

- Skill 是唯一产品扩展概念（非 Plugin）
- Browser Harness：少数 page.*/tabs.* 原语 + 证据；不做 locator ranking / 代码评分器
- 截图/证据 raw artifact 仍走 observability；M1 不改「截图进 LLM」（那是 M2）
- 改 public surface / architecture → 读 `docs/locked-decisions-2026-03-29.md`

---

## 8. 关键文件索引

| 关注点 | 路径 |
|---|---|
| Chat 发送 | `apps/mv3-shell/src/sidepanel/App.vue` sendPrompt |
| Runtime 大脑 | `apps/mv3-shell/src/runtime-services.ts` |
| Agent 循环 | `packages/kernel/src/loop-orchestrator.ts` runLoop |
| LLM 消息转换 | `packages/kernel/src/llm-message-model.ts` |
| 默认工具面 | `packages/core/test/core.spec.ts` ~2020 |
| 会话存储 | `packages/kernel/src/vfs-session-storage.ts` |
| Page 原语 | `apps/mv3-shell/src/page-hook.ts` |
| 产品 roadmap | `docs/product-roadmap-2026-07-08.md` |

---

## 9. 验证命令

```bash
bun run check                    # 全仓 gate（729 tests）
bun run release:acceptance       # 复刻章节历史 gate；改 ledger 时注意 ISSUE-192
./node_modules/.bin/biome check <changed-files>   # 聚焦 lint 推荐
```

---

## 10. 你的默认任务

1. 读 onboarding 列表（§0）
2. `BBL_AGENT_NAME=<你的名字> bun run workflow:claim` — 预期拿到 ISSUE-189
3. 读该 issue + acceptance_ref（roadmap M1 节）
4. TDD：先写/补 failing test → 最小实现 → 聚焦 check_cmd
5. commit → workflow:done → queue:build
6. 若 M1 三张票都 done 且 dogfood 证据齐全 → 在 roadmap 或新 issue 规划 M2

**禁止**：重新做全仓 parity 规划、拆 review finding 小票、无用户授权扩大 scope。

---

## 11. 背景链接

- 规划对话 Agent Run：https://cursor.com/agents/bc-bdf68c8b-a8ed-4e5b-a84e-879873a1429f
- 调查笔记：`docs/planning/2026-07-08-product-discovery-notes.md`
- PR #21（已合并到 main）：https://github.com/catoncat/Snowy/pull/21

开始工作。claim ISSUE-189，实现会话持久化，完成后收口 issue 并报告 dogfood 建议。
```

## 提示词结束

---

## 维护说明

- 若 M1 全部收口，在本文件 §3 更新为 M2 handoff，并新建 `2026-07-08-handoff-prompt-m2.md` 或覆盖本节。
- 若 main HEAD 前进，更新文首 commit SHA。
- handoff 提示词 intentionally 冗长：下一会话可能无本对话 transcript，所有 critical context 必须自包含。
