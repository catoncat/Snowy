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
assignee: <agent-name> | human | unassigned
claimed_at: ISO datetime
tags: [tag1, tag2]
kind: slice
epic: EPIC-<标识>
parallel_group: contracts-core | browser-vfs | js-runner | site-runtime | mv3-shell | sdk-docs | kernel
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

## 当前主线优先级

当前派工优先级不是平均分配。

默认按下面顺序看：

1. `packages/kernel` 主线
2. operability / diagnostics / error lifecycle
3. browser automation / site-runtime 主线
4. substrate follow-up
5. DX / README / lint / CI / 测试补洞

若 live backlog 中同时存在 kernel `p0` 和 DX `p1/p2`，默认先 claim kernel。

## 工作流

1. 所有 agent 先读 `docs/start-here.md` 和 `docs/locked-decisions-2026-03-29.md`
2. Agent 判断当前是继续已有 issue、claim 新 issue、还是规划下一批
3. 需要真正 claim 时，只在 canonical workspace 执行
4. 真正 claim 时，必须把 `assignee` 写成该 Agent 自己选定并持续复用的名字，不能写通用 `agent`
5. 进入某个 issue 后，只在该 issue 的 `write_scope` 内推进
6. 完成后先提交 code commit
7. 再在 canonical workspace 把 issue 改为 `done`，并追加工作记录与 commit 记录

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
BBL_AGENT_NAME=<agent-name> bun run workflow:claim:preview
BBL_AGENT_NAME=<agent-name> bun run workflow:claim
BBL_AGENT_NAME=<agent-name> bun run workflow:claim:json

bun run workflow:claim:preview -- --name=<agent-name>
bun run workflow:claim -- --name=<agent-name>
bun run workflow:claim:json -- --name=<agent-name>
bun run workflow:plan:preview
bun run workflow:plan
bun run workflow:plan:json
bun run workflow:new-review-issue -- --title=... --group=... --epic=... --acceptance-ref=... --scope=... --accept=...
```

命名规则：

- 每个 Agent 自己选一个稳定名字，例如 `atlas`、`mercury`、`sable`
- 同一轮上下文里持续复用这个名字
- 别的 Agent 看到 backlog 中不同 `assignee`，就知道那是另一位 Agent 的 claim

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

### 已在推进

- 当前没有 `in-progress` issue

### 队列提示

- 当前主线 batch 已切到 `docs/next-development-slices-2026-03-29-batch-7.md`
- `ISSUE-051` / `ISSUE-052` / `ISSUE-053` 是当前 kernel mainline 队列
- batch 6 中的 operability / site-runtime / host follow-up 仍有效，但现在是 kernel 次级队列
- claim 真相仍以 live backlog frontmatter 与 `BBL_AGENT_NAME=<agent-name> bun run workflow:claim:preview` 为准。

### 边界说明

- `ISSUE-026`、`ISSUE-028`、`ISSUE-029`、`ISSUE-030`、`ISSUE-031`、`ISSUE-032`、`ISSUE-034`、`ISSUE-035` 已完成。
- host substrate 仍未收口的主缺口是 `ISSUE-038` 对真实 local adapter 的跟进。
- 但 repo 当前最大的产品级缺口已经从 host substrate 切回 browser-side kernel。

## 推荐领取顺序

建议先按依赖顺序推进：

1. `ISSUE-051` kernel B-1 contracts + session store skeleton
2. `ISSUE-052` kernel B-2 run controller + loop engine skeleton
3. `ISSUE-053` kernel B-3 compaction manager + kernel facade
4. `ISSUE-033` runtime diagnostics public control-plane entry
5. `ISSUE-042` host control-plane audit tail
6. `ISSUE-043` runtime clear-error closure
7. `ISSUE-036` browser automation cutover boundary
8. `ISSUE-038` real local execution host adapter follow-up

最终领取顺序仍以 `BBL_AGENT_NAME=<agent-name> bun run workflow:claim:preview` 为准。

当前批次文档：`docs/next-development-slices-2026-03-29-batch-7.md`
