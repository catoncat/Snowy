---
name: agent-workflow-next
description: 当 Agent 需要判断“现在该继续哪个 issue”“认领下一个”“这一批做完后接下来做什么”“当前应该实现、收口还是规划”时使用。适用于 browser-brain-loop-next 的统一 Agent 工作流。
---

# Agent Workflow Next

用于 browser-brain-loop-next 的统一 Agent operating loop。

## 核心原则

- 不假设固定角色
- 所有 Agent 默认能力相同
- 先判断当前状态，再决定当前动作
- Skills 负责判断与流程
- 脚本只负责 deterministic helper，不负责决定下一步任务

## 先读

1. `AGENTS.md`
2. `docs/source-of-truth-map.md`
3. `docs/start-here.md`
4. `docs/locked-decisions-2026-03-29.md`
5. `docs/v0-slice.md`
6. `docs/legacy-reference-map.md`
7. `docs/backlog/README.md`
8. `docs/multi-agent-workflow.md`

## 状态判断顺序

按这个顺序判断，不要跳：

1. 用户是否明确指定了某个 issue / 方向
2. 当前是否有自己应继续收口的 `in-progress` issue
3. 当前是否存在可 claim 的 `open` issue
4. 若没有 `open`，是否还有 `in-progress`
5. 若 `open / in-progress` 都没有，是否该进入 next-batch planning

## 动作选择

### 状态 A：用户已明确指定 issue

- 直接进入该 issue
- 读取 issue 文件和 `acceptance_ref`
- 必要时叠加 `worker` stance
- 按实现 loop 推进

### 状态 B：有应继续的 `in-progress` issue

- 继续收口当前 issue
- 不切新任务

### 状态 C：有可做的 `open` issue

- 使用 `auto-claim-issues-next`
- 如果当前在 canonical workspace，可执行真正 claim
- 如果不在 canonical workspace，只做 claim 判断并把结论带回
- claim 后进入实现 loop

### 状态 D：没有 `open`，但还有 `in-progress`

- 优先收口 `in-progress`
- 不提前规划下一批

### 状态 E：没有 `open`，也没有 `in-progress`

- 使用 `next-batch-planner`
- 对照 locked decisions / project plan / 当前实现和测试做 review
- 把发现的新 gap 落成 backlog issue
- 生成下一批 planning 文档
- 再回到 claim loop

## Optional Stance Overlays

这些不是固定角色，只是临时姿态：

- `.agents/prompts/coordinator.md`
  - 当当前动作是 claim / planning / backlog 整理时叠加
- `.agents/prompts/worker.md`
  - 当当前动作是实现某个已明确 issue 时叠加
- `.agents/prompts/integrator.md`
  - 当当前动作是仓库级收口 / 接线 / 门禁时叠加

同一个 Agent 可以在一轮工作里切换 stance。

## Canonical Workspace 规则

- `docs/backlog/*.md` 是派工真相源
- 但真正的 claim 和 `done` 回写只在 canonical workspace 可靠
- 非 canonical workspace 不要把本地 frontmatter 变化当成全局锁

## Helper Commands

这些命令可以用，但它们不是 workflow 的脑：

```bash
bun run workflow:claim:preview
bun run workflow:claim
bun run workflow:claim:json

bun run workflow:new-review-issue -- --title=... --group=... --epic=... --acceptance-ref=... --scope=... --accept=...
bun run workflow:plan:preview
bun run workflow:plan
```

## 输出要求

- 若进入 issue 实现：
  - 最终要提交代码
  - 回写 `status: done`
  - 追加 `## 工作总结`
  - 追加 `## 相关 commits`
- 若进入 next-batch planning：
  - 先做 LLM review，再创建 issue
  - 不要只生成 planning 文档而不落 backlog
  - 不要把“下一步建议”只停留在口头
