# Agent Workflow

## Goal

让任何一个进入仓库的 Agent 都能：

- 快速建立足够上下文
- 不靠扫全 backlog 就锁定当前任务
- 在并行开发下不抢同一片写域
- 在 queue 为空时自动切到 planning

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
  - 决定当前该继续 issue、取号、还是进入 planning
- `auto-claim-issues-next`
  - 通过 live queue + lease 取号
- `next-batch-planner`
  - 当 queue 为空时做下一批规划

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

### Hook Rule

- repo-local `UserPromptSubmit` hook 只在显式触发 `$agent-workflow-next` 或 `$auto-claim-issues-next` 时取号
- hook 在模型首 token 前完成 ticket preflight
- hook 不会为普通对话、普通 review、`next-batch-planner` 预先取号
- 若要只验证不写 lease，可临时设置 `BBL_WORKFLOW_TICKET_DRY_RUN=1`

### Helper Rule

- Skills 决定当前动作
- queue builder 只负责构建 dispatchable entry 集合
- ticket machine 只负责 session 级 lease
- planner 只在 queue 空且无 active lease 时进入

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
4. 若 queue 为空，是否只是 queue 过期未重建
5. 若 queue 为空且无 active lease，进入 next-batch planning

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

#### State D: queue 为空，但刚发生 backlog 变化

- 先重建 queue
- 再重新判断

#### State E: queue 为空，且没有 active lease

- 进入 next-batch planning
- 对照 locked decisions / recovery report / kernel skeleton / 当前实现和测试
- 创建新的 backlog issue
- 再重建 queue

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
10. 若完成状态影响 dispatch，重建 live queue

## Planning Loop

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
- backlog 已变化却不重建 queue
- queue 为空就直接停工，不进入 planning
- 把 batch snapshot 当成 live dispatch queue
