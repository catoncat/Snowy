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
