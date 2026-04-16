# Agent Workflow

## Goal

让任何一个进入仓库的 Agent 都能：

- 快速建立足够上下文
- 不靠扫全 backlog 就锁定当前任务
- 在并行开发下不抢同一片写域
- 在 queue 为空时自动切到 planning commit，在 queue 被 lease 占满时允许 planning preview

当前 repo phase：

- substrate foundation 已完成
- browser-side kernel reconstruction 是当前主线
- workflow 的目标不是平均派工，而是把 dispatch 稳定拉回 kernel-aware mainline

## Truth Layers

- architecture truth
  - `AGENTS.md`
  - `docs/locked-decisions-2026-03-29.md`
  - `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
  - `docs/kernel-skeleton-design.md`
- planning truth
  - `docs/module-tracking-ledger.json`
  - `docs/backlog/*.md`
- dispatch truth
  - `docs/workflow/live-queue.json`
- live lock truth
  - `~/.codex/workflow-leases/browser-brain-loop-next.json`
- behavior truth
  - `packages/*/src/` + `packages/*/test/*.spec.ts`

## Base Context

默认先读：

1. `docs/agent-task-index.md`

如果当前 turn 没有 hook 注入的 ticket，再补读：

2. `docs/workflow/live-queue.json`

如果当前是 planning / queue rebuild，再补读：

3. `docs/source-of-truth-map.md`
4. `docs/module-tracking-ledger.json`
5. `docs/backlog/README.md`
6. 本文件

如果当前任务已明确，再补读：

- 当前 issue 文件
- `acceptance_ref`
- 对应 lane 的 `src/` + `test/`

## Workflow Skills

- `agent-workflow-next`
  - 决定当前该继续 issue、取号、进入 planning preview，还是进入 planning commit
- `auto-claim-issues-next`
  - 通过 live queue + lease 取号
- `next-batch-planner`
  - 当 queue 为空时做下一批规划；当 queue 被 lease 占满时做只读 preview

## Optional Stance Overlays

- `.agents/prompts/coordinator.md`
  - claim / queue rebuild / planning 时可叠加
- `.agents/prompts/worker.md`
  - 明确 issue 实现时可叠加
- `.agents/prompts/integrator.md`
  - 仓库级收口 / 接线 / 门禁时可叠加

## Canonical Rules

### Canonical Workspace Rule

- queue build、真正 claim、最终状态回写只在 canonical workspace 可靠
- forked workspace 可以 preview，但本地 frontmatter 变化不构成全局锁

### Dispatch Rule

- queue build 从 backlog + module ledger 生成 `docs/workflow/live-queue.json`
- claim path 自身不再直接扫描 backlog
- live 锁只写入 `~/.codex/workflow-leases/browser-brain-loop-next.json`
- `status: in-progress` 不再充当 dispatch lock

### Parallel Hygiene Rule

- 默认假设别的 Agent 正在并行开发，不要把陌生改动直接视为错误或自动回滚。
- worker 默认只对自己 slice / `write_scope` 内的 lint、test、check 结果负责。
- 若 repo 级 `check_cmd` 被其他活跃 slice 挡住，要在 issue 中记录 blocker，并同时写清自己已通过的聚焦检查。
- 拆 slice 与 claim 时优先避免共享写域；能拆开的共享文件不要让多个 Agent 同时改。
- 若必须进入共享代码区，只做最小改动、小步提交，并显式意识到可能存在并行编辑。

### Hook Rule

- repo-local `UserPromptSubmit` hook 只在显式触发 `$agent-workflow-next` 或 `$auto-claim-issues-next` 时取号
- hook 在模型首 token 前完成 ticket preflight
- hook 不会为普通对话、普通 review、`next-batch-planner` 预先取号
- 若要只验证不写 lease，可临时设置 `BBL_WORKFLOW_TICKET_DRY_RUN=1`

### Helper Rule

- Skills 决定当前动作
- queue builder 只负责构建 dispatchable entry 集合
- ticket machine 只负责 session 级 lease
- planning commit 只在 queue 空且无 active lease 时进入；planning preview 可在 active lease 存在时只读执行

## Unified Operating Loop

### Step 0: Refresh Queue When Needed

如果 backlog 刚变化过，先执行：

```bash
bun run workflow:queue:build
```

触发条件至少包括：

- 新增 issue
- issue 改成 `done`
- `depends_on` 变化
- `write_scope` 变化

### Step 1: Detect Current State

按顺序判断：

1. 用户是否明确指定了某个 issue / 方向
2. 当前 session 是否已有 hook 注入的 ticket / 已有 lease
3. live queue 是否还有可取 entry
4. live queue 是否存在，但全部 entry 都已被 lease
5. 若 queue 为空，是否只是 queue 过期未重建
6. 若 queue 为空且无 active lease，进入 next-batch planning commit

### Step 2: Choose Action

#### State A: 用户明确指定 issue / slice

- 直接进入该 issue
- 读 issue 文件和 `acceptance_ref`
- 按实现 loop 推进

#### State B: 当前 session 已持有 live ticket

- 直接把该 ticket 当作当前 live task
- 不重复 claim
- 不切新任务

#### State C: live queue 有可用 entry

- 使用 `auto-claim-issues-next`
- 在 canonical workspace 中执行真正 claim
- 再进入实现 loop

#### State D: live queue 仍有 entry，但都已被 lease

- 不要误判成 queue 为空
- 不要因为没有 claim slot 就自动重建 queue
- 默认进入 planning preview，或者明确回报等待当前 lease 释放

#### State E: queue 为空，但刚发生 backlog 变化

- 先重建 queue
- 再重新判断

#### State F: queue 为空，且没有 active lease

- 进入 next-batch planning commit
- 对照 locked decisions / recovery report / kernel skeleton / 当前实现和测试
- 创建新的 backlog issue
- 再重建 queue

## Implementation Loop

当 Agent 已进入某个明确 issue 后：

1. 读 issue 文件
2. 读 `acceptance_ref`
3. 必要时叠加 `worker` stance
4. 按 TDD 推进
5. 先跑自己 `write_scope` 内的聚焦 lint / test
6. 再视情况补跑该 issue 的 `check_cmd`
   - 若被其他活跃 slice 挡住，记录 blocker，不顺手修 unrelated 文件
7. 若触及 public/core surface，执行 Doc Freshness Gate
8. 按 Definition Of Done 检查是否缺 follow-up issue
9. 小步提交、单一目的提交
10. 用 `workflow:done` 收尾：
   - 校验当前 lease
   - 回写 `status: done`
   - 追加 `## 工作总结`
   - 追加 `## 相关 commits`
   - 释放 lease
   - 重建 live queue

命令：

```bash
BBL_AGENT_NAME=<agent-name> bun run workflow:done -- --commit=HEAD --implemented="..." --check="bun run test -- <target>"
```

## Planning Preview Loop

当 queue 仍有 entry 但全部已被 lease，或用户明确要求提前做 planning 时：

1. 临时叠加 `coordinator` stance
2. 使用 `next-batch-planner`
3. 运行 `bun run workflow:plan:preview`
4. 输出 coverage / drift / recommended next issues
5. 默认不回写 backlog / queue / planning doc

## Planning Commit Loop

当 queue 为空且无 active lease 后：

1. 临时叠加 `coordinator` stance
2. 使用 `next-batch-planner`
3. 先做一轮 module coverage review
4. 再做一轮 drift review
5. 每个发现都落成 backlog issue
6. 生成新的 planning 文档
7. 重建 live queue

## Recommended Commands

```bash
bun run workflow:queue:build
bun run workflow:queue:preview
bun run workflow:queue:json

BBL_AGENT_NAME=<agent-name> bun run workflow:claim:preview
BBL_AGENT_NAME=<agent-name> bun run workflow:claim
BBL_AGENT_NAME=<agent-name> bun run workflow:claim:json

bun run workflow:plan:preview
bun run workflow:plan
bun run workflow:plan:json
```

## Anti-Patterns

- 让 hook 直接扫描 backlog、module ledger、review 文档再决定下一步
- 把 `in-progress` frontmatter 当成真正的分布式锁
- 因为 repo 级 lint 失败就顺手修其他 Agent 正在做的文件
- 在共享文件看到陌生 diff 就直接 revert
- backlog 已变化却不重建 queue
- 把 “all live queue entries are already leased” 误判成 queue 为空
- queue 为空就直接停工，不进入 planning
- 把 batch snapshot 当成 live dispatch queue
