# Issue Backlog

本目录是新仓的唯一派工入口。

## 规则

- backlog issue 是最小工作单元
- 主计划文档只定义方向，不直接派工
- 每个可并行任务都应有独立 backlog 文件
- 默认只允许一个 Agent 持有一个 `in-progress` slice

## Frontmatter

```yaml
---
id: ISSUE-<序号>
title: 简明标题
status: open | in-progress | done
priority: p0 | p1 | p2
source: 需求来源
created: YYYY-MM-DD
assignee: agent | human | unassigned
claimed_at: ISO datetime
tags: [tag1, tag2]
kind: slice
epic: EPIC-<标识>
parallel_group: contracts-core | browser-vfs | js-runner | site-runtime | mv3-shell | sdk-docs
depends_on: [ISSUE-xxx]
write_scope:
  - packages/...
acceptance_ref: docs/<doc>.md
check_cmd: bun run test -- <target> | bun run check
---
```

## 并行约束

1. `write_scope` 重叠的 issue 不并行分配。
2. 以下为单写者超级节点：
   - `packages/contracts/src/index.ts`
   - `packages/core/src/index.ts`
   - `apps/mv3-shell/manifest.json`
   - `package.json`
   - `vitest.config.ts`
3. 拆任务优先按包边界，不按“同一功能不同段落”拆。
4. 需要接线的大文件改动，优先留给 integrator 或对应 lane owner。

## Agent 心智

- 所有 Agent 默认能力相同
- Agent 先判断当前状态，再决定自己现在是在：
  - claim / planning
  - implementation
  - integration
- 建议先触发 `agent-workflow-next`，再按状态进入 `auto-claim-issues-next` 或 `next-batch-planner`
- `.agents/prompts/*.md` 是可选 stance overlay，不是固定角色绑定

## 工作流

1. 所有 agent 先读 `docs/start-here.md` 和 `docs/locked-decisions-2026-03-29.md`
2. Agent 判断当前是继续已有 issue、claim 新 issue、还是规划下一批
3. 需要真正 claim 时，只在 canonical workspace 执行
4. 进入某个 issue 后，只在该 issue 的 `write_scope` 内推进
5. 完成后先提交 code commit
6. 再在 canonical workspace 把 issue 改为 `done`，并追加工作记录与 commit 记录

## 当当前 batch 做完时

如果 `bun run workflow:claim:preview` 返回“当前没有可认领的 open issue”，按下面处理：

1. 先确认是否还存在 `status: in-progress`
2. 若没有，再把当前实现对照：
   - `docs/locked-decisions-2026-03-29.md`
   - `project_plan.md`
   - 已落地测试和代码
3. 把新发现的问题写成新的 `docs/backlog/*.md`
4. 新建新的 batch/planning 文档，不继续覆盖旧批次快照
5. 再回到 claim 流程

## Canonical Workspace Rule

- `docs/backlog/*.md` 是派工真相源
- 但它只在 canonical workspace 中可靠
- forked worker 即使本地把 issue 改成 `in-progress`，也不会自动阻止其他 worker 再 claim
- 所以 claim 和最终状态回写都必须在 canonical workspace 完成

## Claim 命令

```bash
bun run workflow:claim:preview
bun run workflow:claim
bun run workflow:claim:json
bun run workflow:plan:preview
bun run workflow:plan
bun run workflow:plan:json
bun run workflow:new-review-issue -- --title=... --group=... --epic=... --acceptance-ref=... --scope=... --accept=...
```

`preview` 的用途：

- 有可做 issue：说明当前能直接派工
- 没有可做 issue：说明当前 Agent 应切到下一批规划，不是直接停住

## Completion Record

- `done` issue 不能只改 frontmatter；必须同时追加 `## 工作总结` 和 `## 相关 commits`
- `## 工作总结` 至少写：
  - 实现了什么
  - 实际跑了什么检查
  - 还有什么残留风险或外部 blocker
- `## 相关 commits` 必须写对应 code commit 的 hash 和 message；不要保留 `未提交`
- 如果仓库级 `bun run check` 被 write scope 外的并行改动阻塞，可以在 issue 中注明 blocker，但仍要把本 slice 已通过的聚焦检查写清楚

## Review Follow-ups

- 评审若发现“父 issue 已完成，但仍有后续架构缺口”，应新开 `Review:` 子 issue，而不是重写父 issue 的 Goal
- 父 issue 保持 `done` 时，必须追加 `## Sub Issues` 记录对应 follow-up，保留父子关系
- 子 issue 负责记录剩余缺口；父 issue 的 `## 工作总结` 只回写已完成范围

## 当前未完成项

当前没有可直接认领的 open issue。

如果 `bun run workflow:claim:preview` 返回 blocked：

1. 先确认是否还有 `status: in-progress`
2. 若没有，进入下一批规划
3. 对照 `docs/locked-decisions-2026-03-29.md`、`project_plan.md`、代码和测试补新的 review / planning issue

## 推荐领取顺序

当前没有推荐领取顺序。

下一步建议：

1. `bun run workflow:plan:preview`
2. 若需要，补新的 `Review:` issue
3. 再回到 claim 流程
