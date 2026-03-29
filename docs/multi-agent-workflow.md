# Agent Workflow

## Goal

让任何一个进入仓库的 Agent 都能：

- 快速建立足够上下文
- 判断自己现在该继续当前 issue、认领下一个、还是规划下一批
- 在并行开发下不抢同一片写域
- 把 backlog、实现、集成、review 组织成一个统一循环

当前 repo phase：

- substrate foundation 已完成
- browser-side kernel reconstruction 是当前主线
- 所以 workflow 的目标不是平均派工，而是先把 claim 拉回 kernel mainline

这里没有固定角色前提。

- 所有 Agent 默认能力相同
- 差异只来自：
  - 当前上下文
  - 当前工作区状态
  - 当前用户指令
  - 当前 backlog / planning 状态

## Core Principle

不要先问“我是 coordinator / worker / integrator 吗？”

先问：

1. 当前 source of truth 是什么
2. 当前仓库处于什么状态
3. 我现在最该做的动作是什么

## Prompt Stack

### Base Context

所有 Agent 先读：

1. `AGENTS.md`
2. `docs/source-of-truth-map.md`
3. `docs/agent-bootstrap-context-pack.md`
4. `docs/document-system-contract.md`
5. `docs/start-here.md`
6. `docs/locked-decisions-2026-03-29.md`
7. `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
8. `docs/kernel-skeleton-design.md`
9. `docs/ai-surface-index.md`
10. `docs/v0-slice.md`
11. `docs/legacy-reference-map.md`

### Workflow Skills

- `agent-workflow-next`
  - 统一判断当前应该继续 issue、claim、还是进入 next-batch planning
- `auto-claim-issues-next`
  - 当需要判断“现在该接哪个 issue”时使用
- `next-batch-planner`
  - 当需要判断“这一批做完后接下来该做什么”时使用

### Optional Stance Overlays

这些不是固定角色，只是临时工作姿态：

- `.agents/prompts/coordinator.md`
  - 当当前动作是 backlog 派工 / planning / claim 时叠加
- `.agents/prompts/worker.md`
  - 当当前动作是实现某个已明确 issue 时叠加
- `.agents/prompts/integrator.md`
  - 当当前动作是仓库级收口 / 门禁 / 接线时叠加

同一个 Agent 在不同阶段可以切换 stance。

## Canonical Rules

### Canonical Workspace Rule

- `docs/backlog/*.md` 是派工真相源
- 但 claim 和最终状态回写只在 canonical workspace 可靠
- forked workspace 本地把 issue 改成 `in-progress` 不构成全局锁

### Claim Rule

- 任何 Agent 都可以做 claim 判断
- 但只有运行在 canonical workspace 的那个 Agent，才应该真正执行 claim / 状态回写
- 真正 claim 时，`assignee` 必须写该 Agent 自己选定的名字，不能写通用 `agent`
- 同一位 Agent 在当前上下文里应持续复用同一个名字，方便其他 Agent 识别 ownership

### Helper Rule

- Skills 负责：
  - 读哪些文档
  - 怎么判断当前状态
  - 怎么决定下一步动作
  - 什么时候创建新 backlog issue
  - 什么时候生成下一批 planning 文档
- 脚本只负责 deterministic helper：
  - frontmatter 落盘
  - 编号
  - planning 文档骨架
- 脚本不负责决定“接下来做什么”

## Unified Operating Loop

### Step 0: Build Context

1. 读 base context 文档
2. 查看 `docs/backlog/*.md`
3. 查看当前 working tree 和最近提交
4. 必要时查看当前 planning 文档
5. 默认先触发 `agent-workflow-next`

### Step 1: Detect Current State

按顺序判断：

1. 用户是否明确指定了某个 issue / 方向
2. 是否存在自己应该继续收口的 `in-progress` issue
3. 是否存在可 claim 的 `open` issue
4. 若没有 open issue，是否仍有 `in-progress`
5. 若 open / in-progress 都没有，是否该进入 next-batch planning

### Step 2: Choose Action

#### State A: 用户明确指定 issue / slice

- 直接进入该 issue
- 读 issue 文件和 `acceptance_ref`
- 按实现 loop 推进

#### State B: 有自己该继续的 `in-progress` issue

- 继续收口当前 issue
- 不切新任务

#### State C: 有可做的 `open` issue

- 使用 `auto-claim-issues-next`
- 在 canonical workspace 中执行真正 claim
- 再进入实现 loop
- 若同时存在多个 claimable issue：
  - 先看当前主线 batch
  - 默认优先 `kernel p0`
  - 再看 operability / browser automation
  - 最后才是 DX / doc-debt / 测试补洞

#### State D: 没有 open issue，但还有 `in-progress`

- 优先收口这些 `in-progress`
- 不提前规划下一批

#### State E: 没有 open，也没有 in-progress

- 进入 next-batch planning
- 对照：
  - `docs/locked-decisions-2026-03-29.md`
  - `project_plan.md`
  - 当前代码和测试
- 识别 drift / 缺口 / 下一阶段依赖
- 创建新的 backlog issue
- 生成新的 planning 文档
- 然后回到 claim loop

## Implementation Loop

当 Agent 已进入某个明确 issue 后：

1. 读 issue 文件
2. 读 `acceptance_ref`
3. 必要时叠加 `worker` stance
4. 按 TDD 推进
5. 跑该 issue 的 `check_cmd`
6. 若触及 public/core surface，执行 Doc Freshness Gate
7. 按 Definition Of Done 检查是否缺 follow-up issue
8. 提交代码
9. 回写 issue：
   - `status: done`
   - `## 工作总结`
   - `## 相关 commits`

## Integration Loop

当问题主要变成：

- 多 slice 接线
- 仓库级门禁
- 小范围共享配置冲突

可临时叠加 `integrator` stance。

但原则不变：

- 不静默吞掉未完成的 slice
- 不借集成名义扩 scope

## Planning Loop

当当前批次做完后：

1. 临时叠加 `coordinator` stance
2. 使用 `next-batch-planner` skill
3. 先做一轮 drift review：
   - recovery report drift
   - kernel skeleton drift
   - locked decisions drift
   - AI surface drift
   - doc freshness drift
4. 再做一轮 LLM 主导的 review：
   - locked decisions drift
   - plan drift
   - implementation / test gap
5. 每个发现都落成 backlog issue
6. 用 helper 命令生成新的 planning 文档

## Recommended Commands

这些命令是 helper，不是 workflow 的脑：

```bash
BBL_AGENT_NAME=<agent-name> bun run workflow:claim:preview
BBL_AGENT_NAME=<agent-name> bun run workflow:claim
BBL_AGENT_NAME=<agent-name> bun run workflow:claim:json

bun run workflow:claim:preview -- --name=<agent-name>
bun run workflow:claim -- --name=<agent-name>
bun run workflow:claim:json -- --name=<agent-name>

bun run workflow:new-review-issue -- --title=... --group=... --epic=... --acceptance-ref=... --scope=... --accept=...
bun run workflow:plan:preview
bun run workflow:plan
```

## Anti-Patterns

- 把 Agent 固定成永久 coordinator / worker / integrator
- 看到脚本就让脚本替自己判断下一步任务
- forked workspace 自己 claim 然后以为拿到了全局锁
- 所有 issue 做完后直接停住，不进入下一批 planning
- 不经 review 就口头说“下一步做这个那个”
