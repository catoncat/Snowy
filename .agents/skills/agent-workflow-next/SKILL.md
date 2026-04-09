---
name: agent-workflow-next
description: 当 Agent 需要判断“现在该继续哪个 issue”“认领下一个”“这一批做完后接下来做什么”“当前应该实现、收口还是规划”时使用。适用于 browser-brain-loop-next 的统一 Agent 工作流。
---

# Agent Workflow Next

用于 browser-brain-loop-next 的统一 Agent operating loop。

## 核心原则

- 不假设固定角色
- 先判断当前状态，再决定当前动作
- workflow skill 负责判断
- queue builder 只负责构建 live queue
- ticket machine 只负责 lease

## 先读

默认只读：

1. `docs/agent-task-index.md`

如果当前 turn 没有 hook 注入的 ticket，再读：

2. `docs/workflow/live-queue.json`

只有在 queue 为空、需要重建 queue、或要进入 planning 时，再补读：

3. `docs/source-of-truth-map.md`
4. `docs/backlog/README.md`
5. `docs/multi-agent-workflow.md`
6. `docs/module-tracking-ledger.json`
7. `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
8. `docs/kernel-skeleton-design.md`

如果当前 issue 已明确，再读：

- 对应 `docs/backlog/<issue>.md`
- `acceptance_ref`
- 对应 lane 的 `src/` + `test/`

## 真相源分工

- planning / coverage
  - `docs/module-tracking-ledger.json`
  - `docs/backlog/*.md`
- dispatch / claim
  - `docs/workflow/live-queue.json`
  - `~/.codex/workflow-leases/browser-brain-loop-next.json`

## 状态判断顺序

按这个顺序判断，不要跳：

1. 用户是否明确指定了某个 issue / 方向
2. 当前 session 是否已有 hook 注入的 ticket / 已有 lease
3. live queue 是否还有可取 entry
4. 若 queue 为空，是否只是 queue 过期未重建
5. 若 queue 为空且无 active lease，是否该进入 next-batch planning

## 动作选择

### 状态 A：用户已明确指定 issue

- 直接进入该 issue
- 读取 issue 文件和 `acceptance_ref`
- 必要时叠加 `worker` stance
- 按实现 loop 推进

### 状态 B：当前 session 已有 live ticket

- 直接把该 ticket 当作当前 live task
- 不重复 claim
- 不切新任务

### 状态 C：live queue 有可做 entry

- 使用 `auto-claim-issues-next`
- 如果当前在 canonical workspace，可执行真正 claim
- 如果不在 canonical workspace，只做 claim 判断并把结论带回
- claim 后进入实现 loop

### 状态 D：queue 为空，但 backlog 刚变化

- 先重建 queue：

```bash
bun run workflow:queue:build
```

- 再重新判断

### 状态 E：queue 为空，且没有 active lease

- 使用 `next-batch-planner`
- 对照 locked decisions / recovery report / kernel skeleton / 当前实现和测试做 review
- 把发现的新 gap 落成 backlog issue
- 生成下一批 planning 文档
- 重建 queue 后再回到 claim loop

## Optional Stance Overlays

- `.agents/prompts/coordinator.md`
  - 当当前动作是 claim / queue rebuild / planning 时叠加
- `.agents/prompts/worker.md`
  - 当当前动作是实现某个已明确 issue 时叠加
- `.agents/prompts/integrator.md`
  - 当当前动作是仓库级收口 / 接线 / 门禁时叠加

## Canonical Workspace 规则

- queue build、真正 claim、`done` 回写只在 canonical workspace 可靠
- `docs/backlog/*.md` 是 issue registry，不再直接等于 live queue
- `in-progress` frontmatter 不再充当 dispatch lock

## 并行开发补充规则

- 默认假设其他 Agent 也在并行改动；看到陌生 diff 先判断是不是并行工作，不要直接回滚。
- 实现 issue 时，先跑自己 `write_scope` 内的聚焦 lint / test；repo 级 `check_cmd` 若被别的活跃 slice 阻塞，要记录 blocker，不顺手修 unrelated 文件。
- 提交要小步、单一目的，减少共享文件冲突。
- 拆 slice / claim / 实现时都优先避开共享写域；若必须进入共享区域，只做最小改动并明确风险。

## Helper Commands

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

## 输出要求

- 若进入 issue 实现：
  - 最终要提交代码
  - 若触及 public/core surface，先执行 Doc Freshness Gate
  - 先给出自己 slice 的聚焦验证结果；repo 级 gate 若被并行改动阻塞，要显式记录
  - 用 Definition Of Done 判断是否需要 follow-up issue
  - 回写 `status: done`
  - 追加 `## 工作总结`
  - 追加 `## 相关 commits`
- 若进入 next-batch planning：
  - issue 先按 `slice / review / follow-up / decision / doc-debt` 分类
  - 不要只生成 planning 文档而不落 backlog
  - 生成完成后重建 live queue
