# Source Of Truth Map

本文件回答 3 个问题：

1. 现在这仓库到底以什么为主线
2. 我现在该看哪类文档来判断下一步
3. 多份文档互相打架时，到底谁说了算

如果你想知道“当前任务该先读什么”，先看：

- `docs/agent-task-index.md`

本文件负责裁决真相源，不负责要求每个任务都全量读完。

## 1. 核心结论

当前仓库的真实状态是：

- `v0` 已完成的是 `substrate foundation`
- 当前主线不是继续横向补 substrate
- 当前主线是补回 `browser-side kernel`

因此要这样理解真相源：

- `AGENTS.md` + `docs/locked-decisions-2026-03-29.md`
  - 定义不能改口的仓库边界
- `docs/module-tracking-ledger.json`
  - 定义 planning 必须持续跟踪的模块、阶段和默认顺序
- `docs/workflow/live-queue.json`
  - 定义当前可直接 dispatch 的 issue 队列
- `~/.codex/workflow-leases/browser-brain-loop-next.json`
  - 定义当前 session 级 live ticket 锁
- `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
  - 定义“为什么 repo 主线已切回 browser-side kernel”
- `docs/reviews/2026-03-30-plugin-mainline-correction-control.md`
  - 定义“这轮插件主线纠偏 findings 由哪些 backlog gate 承载”
- `docs/kernel-skeleton-design.md`
  - 定义 `packages/kernel` 的当前主线骨架与切片
- `docs/backlog/*.md`
  - 定义 issue metadata、acceptance、completion record 与 queue build 输入
- `packages/*/src/` + `packages/*/test/*.spec.ts`
  - 定义已经真正落地的行为

补充判断：

- `docs/reviews/2026-03-29-comprehensive-review-summary.md` 及其维度 review 文档
  - 是 gap inventory / follow-up 来源
  - 不是当前 roadmap 主线真相源
- 旧仓文档与研究仓
  - 是参考来源
  - 不覆盖新仓已锁定的主线判断

## 2. 按问题类型找真相

| 你要回答的问题 | 先看哪里 |
|---|---|
| 这仓库现在到底想成为什么 | `AGENTS.md` → `docs/start-here.md` → `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md` |
| 哪些原则不能变 | `AGENTS.md` → `docs/locked-decisions-2026-03-29.md` |
| workflow 必须跟踪哪些模块 | `docs/module-tracking-ledger.json` |
| 当前主线为什么是 kernel | `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md` |
| 2026-03-30 那轮插件纠偏流由哪些 issue 承载 | `docs/reviews/2026-03-30-plugin-mainline-correction-control.md` |
| `packages/kernel` 该怎么做 | `docs/kernel-skeleton-design.md` |
| 我现在该 claim 什么 | `docs/backlog/README.md` → `docs/workflow/live-queue.json` → `BBL_AGENT_NAME=<name> bun run workflow:claim:preview` |
| 当前 live dispatch 是什么 | `docs/workflow/live-queue.json` + `~/.codex/workflow-leases/browser-brain-loop-next.json` |
| 历史 planning snapshot 在哪 | `docs/next-development-slices-*.md` |
| 某个能力是否已经真正落地 | 对应 `packages/*/src/` + `packages/*/test/*.spec.ts` |
| v0 已经做到哪 | `docs/v0-slice.md` |
| 与旧仓的迁移差距还有哪些 | `docs/legacy-to-vnext-migration-matrix.md` → `docs/migration-parity-dashboard.md` → `docs/cutover-readiness-criteria.md` |
| 旧仓或研究仓去哪里查 | `docs/legacy-reference-map.md` |
| 还有哪些 review follow-up 可做 | `docs/reviews/*.md`，但必须落成新的 backlog issue 才进入派工真相源 |

## 3. 冲突时怎么裁决

### 场景 A：主线判断冲突

如果出现：

- `comprehensive review` 说继续补 review follow-ups
- recovery report 说先补 browser-side kernel

以这条为准：

1. `AGENTS.md`
2. `docs/locked-decisions-2026-03-29.md`
3. `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
4. `docs/kernel-skeleton-design.md`

也就是说：

- `recovery report + kernel skeleton` 优先级高于 `comprehensive review`
- `comprehensive review` 只能提供后续 gap，不负责重排 repo 主线

### 场景 B：派工顺序冲突

如果出现：

- batch 文档写的是一个顺序
- live queue / lease 显示的是另一个顺序

以这条为准：

1. `docs/workflow/live-queue.json`
2. `~/.codex/workflow-leases/browser-brain-loop-next.json`
3. live `docs/backlog/*.md`
4. batch / planning 文档

也就是说：

- planning 文档是快照
- backlog frontmatter 是 queue build 输入，不再直接等于 live queue
- 真正的 dispatch lock 由 lease 文件持有，不由 `in-progress` frontmatter 隐式充当

### 场景 C：设计文档和代码/测试冲突

如果出现：

- 设计文档说某能力已支持
- 但 `src/` + `test/` 没有落地

则：

- “当前行为真相”以代码和测试为准
- 设计文档只能说明目标态，不代表已经落地

### 场景 D：设计文档写了“已交付”，但 backlog 仍是 open

按下面理解：

- 对“是否已经 landed”：
  - 看 committed code + test
- 对“是否还在 claim queue / ownership queue”：
  - 看 live backlog frontmatter

也就是说：

- 没有 `status: done` 的 backlog issue，不因为某份设计文档写了“已交付”就自动视为收口
- 设计文档里的交付状态只能作为提示，不能替代派工真相源

### 场景 E：旧仓设计和新仓当前文档冲突

默认以新仓为准：

1. `AGENTS.md`
2. `docs/locked-decisions-2026-03-29.md`
3. `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
4. `docs/kernel-skeleton-design.md`

旧仓只回答：

- 旧系统原本如何工作
- 为什么需要这个能力

旧仓不直接决定：

- 新仓当前主线
- 新仓当前派工顺序
- 新仓 public surface 如何命名

## 4. 新 Agent 第一次进入仓库的阅读顺序

先读：

1. `docs/agent-task-index.md`

再按任务类型补读，不要默认全量读：

2. claim / workflow：`docs/workflow/live-queue.json`
3. implementation：当前 issue + `acceptance_ref`
4. planning：`docs/module-tracking-ledger.json` + `docs/backlog/README.md`
5. architecture：`docs/locked-decisions-2026-03-29.md` + recovery report + kernel skeleton

## 5. 这套架构到底想成为什么

如果你只想快速建立这件事的顶层心智，按这个顺序：

1. `docs/start-here.md`
2. `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
3. `docs/kernel-skeleton-design.md`
4. `docs/module-tracking-ledger.json`
5. `docs/locked-decisions-2026-03-29.md`
6. `docs/ai-native-capability-surface-design.md`
7. `docs/ai-surface-index.md`

一句话版本：

> 目标不是做一个 substrate 工具箱，而是做一个“以浏览器侧 kernel 为中枢、以 AI Surface 为统一产品面、以 Skill 为唯一扩展单位、Browser/Host 为执行基座”的 agent system。

## 6. 包级真相入口

| 关注点 | 先看哪里 |
|---|---|
| kernel mainline | `docs/kernel-skeleton-design.md` → `packages/kernel/src/index.ts` → `packages/kernel/test/*.spec.ts` |
| canonical descriptor / contract | `packages/contracts/src/index.ts` |
| capability routing / ctx / invoke | `packages/core/src/index.ts` |
| BrowserVFS | `packages/browser-vfs/src/index.ts` |
| JS Runner | `packages/js-runner/src/index.ts` |
| Site Runtime | `packages/site-runtime/src/index.ts` |
| Skill SDK | `packages/skill-sdk/src/index.ts` |
| MV3 shell | `apps/mv3-shell/` |

测试入口默认看各包 `test/*.spec.ts`。

## 7. Review 文档的正确用法

`docs/reviews/` 下面的文档有两类，不要混用：

### 类别 A：主线裁决 / correction control 文档

- `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
- `docs/reviews/2026-03-30-plugin-mainline-correction-control.md`

它们虽然放在 `reviews/` 目录下，但都不是普通 review。

它们分别是：

- `2026-03-29-vnext-architecture-recovery-report.md`
  - repo 当前重新定性的正式文档
  - kernel 主线回归的依据
  - backlog / workflow / planning 应该对齐的上游判断
- `2026-03-30-plugin-mainline-correction-control.md`
  - 2026-03-30 那轮“插件主线纠偏”的执行控制文档
  - 负责把当时的 review findings 映射到 correction gates 与 backlog
  - 现在主要作为历史 correction stream 参考，不是当前 dispatch 真相源

### 类别 B：gap inventory / follow-up 来源

- `docs/reviews/2026-03-29-comprehensive-review-summary.md`
- `docs/reviews/2026-03-29-architecture-quality-review.md`
- `docs/reviews/2026-03-29-code-engineering-quality-review.md`
- `docs/reviews/2026-03-29-docs-dx-review.md`

这些文档的用途是：

- 找缺口
- 产出 follow-up issue
- 辅助第二批、第三批 backlog 规划

这些文档不负责：

- 决定 repo 当前主线
- 覆盖 recovery report 的重定性结论
- 把 claim 顺序从 kernel 再拉回 review-first

## 8. 现在该怎么继续规划

默认规划顺序是：

1. 先看 `docs/module-tracking-ledger.json` 里的 module stage 和 module order
2. 再看 live backlog 是否已经覆盖这些非 deferred 模块
3. backlog 变化后先重建 `docs/workflow/live-queue.json`
4. 若还有 mainline module 的 live queue entry，先按 module order 推进
5. mainline 收口后，再看 secondary modules
6. deferred modules 只在前两层没有 live queue entry 时再进入
7. 当 live queue 为空且没有 active lease 时，再进入 next-batch planning

当前 dispatch 与规划要这样看：

1. 当前可做什么：看 `docs/workflow/live-queue.json`
2. 当前谁持有锁：看 `~/.codex/workflow-leases/browser-brain-loop-next.json`
3. 为什么排序成这样：看 `docs/module-tracking-ledger.json`
4. 历史 planning 背景：再回看 `docs/next-development-slices-*.md`

## 9. 文档为什么会过期

会。最常见的 4 种过期方式：

1. 主线已经重定性，但入口文档还按旧顺序带人
2. backlog queue 已变化，但 batch 文档还是旧快照
3. 代码/测试已变化，但迁移治理文档没同步
4. 某份 review 文档被错误提升成主线裁决文档

所以默认同步规则是：

1. 改主线判断时，更新：
   - `AGENTS.md`
   - `docs/start-here.md`
   - `docs/source-of-truth-map.md`
   - `docs/agent-bootstrap-context-pack.md`
2. 改 queue 时，更新：
   - `docs/backlog/*.md`
   - 对应 batch 文档
3. 改 landed behavior 时，更新：
   - `packages/*/src/`
   - `packages/*/test/*.spec.ts`
   - 必要时同步 `docs/v0-slice.md` / migration docs

如果这些没有同步，就把旧文档当参考，不要当 live truth。
