# Multi-Agent Workflow

## Goal

让多个 AI 在新仓并行开发时：

- 不抢同一片写域
- 不混淆角色
- 不把 backlog、实现、集成揉成一团

## Prompt Stack

### Base Prompt

- 始终加载仓库根 `AGENTS.md`
- 在真正开工前，强制补读：
  - `docs/start-here.md`
  - `docs/locked-decisions-2026-03-29.md`
  - `docs/legacy-reference-map.md`

### Role Overlay

- `coordinator`: `.agents/prompts/coordinator.md`
- `worker`: `.agents/prompts/worker.md`
- `integrator`: `.agents/prompts/integrator.md`

### Task Payload

- 当前 issue 文件
- 对应 `acceptance_ref`
- 必要时附：
  - 旧仓参考路径
  - 研究仓参考路径
- 必要时补一条绝对路径 write scope 白名单

## Skill Stack

### Coordinator

- `auto-claim-issues-next`
- `next-batch-planner`
- 文档读写

### Worker

- 仓库默认 coding 能力

### Integrator

- 仓库默认 coding 能力
- 测试/门禁执行

## Operating Model

1. coordinator 在 canonical workspace 维护切片图和 issue 元数据
2. coordinator 在 canonical workspace 执行 claim
3. worker 只处理 coordinator 已分配的一个 claimed issue
4. integrator 只做集成层与共享门禁

## Workflow Loop

### Phase 0: Sync Context

1. coordinator 先确认 `AGENTS.md`、`docs/source-of-truth-map.md`、`docs/locked-decisions-2026-03-29.md`
2. coordinator 读取 `docs/backlog/*.md`，确认哪些是 `open / in-progress / done`
3. coordinator 只在 canonical workspace 做状态判断

### Phase 1: Dispatch

1. coordinator 运行 `bun run workflow:claim:preview`
2. 若存在可做 slice，再运行 `bun run workflow:claim`
3. coordinator 把以下 payload 发给 worker：
   - `ISSUE-xxx`
   - `write_scope`
   - `acceptance_ref`
   - 必要参考路径

### Phase 2: Execute

1. worker 只改自己的 `write_scope`
2. worker 按 TDD 推进
3. worker 完成后提交 code commit
4. worker 回传：
   - 改动文件
   - 检查结果
   - 风险 / blocker

### Phase 3: Integrate

1. integrator 跑仓库级 `bun run check`
2. 若只是共享接线冲突，由 integrator 解决
3. 若是 slice 本身没达 acceptance，退回 worker
4. canonical workspace 回写 issue 为 `done`

### Phase 4: Batch Boundary

当 `bun run workflow:claim:preview` 返回“当前没有可认领的 open issue”时，不是停工，而是进入下一批规划：

1. coordinator 检查是否还有 `in-progress` issue 未收口
2. 若全部收口，跑一轮 review / drift check：
   - 对照 `docs/locked-decisions-2026-03-29.md`
   - 对照 `project_plan.md`
   - 对照已落地代码和测试
3. 把发现的新 gap 写成新的 `docs/backlog/*.md`
4. 新建下一批 planning 文档，例如 `docs/next-development-slices-YYYY-MM-DD.md`
5. 再回到 Phase 1 开始 claim

推荐直接使用：

- `bun run workflow:new-review-issue -- --title=... --group=... --epic=... --acceptance-ref=... --scope=... --accept=...`
- `bun run workflow:plan:preview`
- `bun run workflow:plan`

## Canonical Claim Rule

- claim 只能在 coordinator 持有的 canonical workspace 中执行
- 不要让 forked worker 自己运行 claim
- 原因：
  - forked workspace 的 issue 文件状态不会自动同步给其他 worker
  - 所以本地把 issue 改成 `in-progress` 不构成全局锁
- 正确流程：
  1. coordinator 运行 `bun run workflow:claim`
  2. coordinator 把 `ISSUE-xxx`、`write_scope`、`acceptance_ref` 发给 worker
  3. worker 不再 claim，只实现
  4. coordinator 或 integrator 在 canonical workspace 回写最终状态

## Empty-Backlog Rule

- `workflow:claim:preview` 没有可 claim issue 时，默认含义是“进入 batch planning”，不是“项目结束”
- 只有在以下 3 项都成立时，才可视为当前阶段真正完成：
  1. 没有 `open` issue
  2. 没有 `in-progress` issue
  3. 已做完一轮 against locked decisions / plan / implementation 的 review
- 若 review 发现 drift，优先新开 review issue，不要口头记住

## Handoff Contract

每个 worker 完成时必须回写：

- 做了什么
- 哪些文件改了
- 跑了什么检查
- 还有什么残留风险

## Completion Contract

- 代码完成后先提交 code commit，再回写 issue；不要让 `done` issue 还停留在 `未提交`
- 回写 issue 时至少要做 4 件事：
  1. 把 `status` 改成 `done`
  2. 追加 `## 工作总结`
  3. 在总结里写清实现结果、实际检查、残留风险
  4. 追加 `## 相关 commits`，写入对应 code commit hash 和 message
- 如果仓库级 `bun run check` 被 write scope 外的并行改动阻塞，issue 里必须明确写出 blocker，并列出已跑的聚焦检查
- coordinator / integrator 不能只改状态，不补总结和 commit 记录

## Anti-Patterns

- 两个 worker 同时改 `packages/core/src/index.ts`
- 用口头派工替代 backlog claim
- forked worker 自己 claim
- integrator 静默接管失败 slice
- 所有 issue 做完后直接停住，不补下一批 backlog
