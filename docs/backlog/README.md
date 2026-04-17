# Issue Backlog

本目录是新仓的 canonical issue registry。

它负责：

- 记录 issue metadata
- 记录 acceptance / write scope / dependency
- 记录完成状态与工作总结

它不再直接承担：

- live dispatch queue
- session 级锁

任务级阅读入口见：

- `docs/agent-task-index.md`

## 真相源分层

- planning truth
  - `docs/module-tracking-ledger.json`
- queue build input
  - `docs/backlog/*.md`
- dispatch truth
  - `docs/workflow/live-queue.json`
- live lock truth
  - `~/.codex/workflow-leases/browser-brain-loop-next.json`
- batch docs
  - 只是 planning snapshot，不是 live queue

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
module_id: <module-id from docs/module-tracking-ledger.json>
module_stage: mainline | secondary | deferred
tracking_kind: mainline | gap | follow-up | doc-debt
depends_on: [ISSUE-xxx]
write_scope:
  - packages/...
acceptance_ref: docs/<doc>.md
check_cmd: bun run test -- <target> | bun run check
---
```

## 字段语义

- `status: open`
  - 代表该 issue 仍可进入 queue build
- `status: in-progress`
  - 代表 issue 记录层的进行中状态
  - 它不再是 dispatch lock
- `status: done`
  - 代表 issue 已完成
  - 下一次 queue build 应把它排除出 live queue
- `assignee`
  - 是 issue record owner label
  - 不是 session 级锁
- `claimed_at`
  - 是 issue record 的时间戳
  - 不是 live lease 的真相源

## 并行约束

1. `write_scope` 是协调提示，不是 dispatch 锁；只要 `depends_on` 已满足，`write_scope` 重叠的 issue 也可以同时进入 live queue。
2. 以下为单写者超级节点：
   - `packages/contracts/src/index.ts`
   - `packages/core/src/index.ts`
   - `apps/mv3-shell/manifest.json`
   - `package.json`
   - `vitest.config.ts`
3. 命中单写者超级节点时，优先用 `git worktree`、小步提交和 owner 协调降低冲突；只有真实前后依赖才应通过 `depends_on` 串行化。
4. 拆任务优先按包边界，不按“同一功能不同段落”拆。
5. 需要接线的大文件改动，优先留给 integrator 或对应 lane owner，但这属于协作建议，不是 queue builder 的自动排除条件。

## 模块追踪规则

workflow 的 planning 顺序默认看：

1. `module_stage`
2. module ledger 的 `tracking_order`
3. issue `priority`
4. `depends_on`
5. `write_scope`

如果某个非 deferred、且未标成 `shipped` 的模块没有任何 live issue，planner 必须把它报成 coverage gap。

## Queue Build

`docs/workflow/live-queue.json` 必须由 backlog + module ledger 生成，不要手写。

queue build 规则：

1. 只纳入 `status: open` 的 issue。
2. 只纳入 `depends_on` 已满足的 issue。
3. issue 必须带合法 `module_id / module_stage / tracking_kind`。
4. queue 内按 module stage → module order → priority → created → issue id 排序。
5. queue builder 不再因为 `write_scope` 重叠而自动排除 issue；只要 issue 仍是 `open` 且 `depends_on` 已满足，就保留在 live queue 中。

以下场景必须重建 queue：

1. 新增 issue
2. issue 改成 `done`
3. `depends_on` 变化
4. `write_scope` 变化
5. `module_id / module_stage / tracking_kind` 变化

命令：

```bash
bun run workflow:queue:build
bun run workflow:queue:preview
bun run workflow:queue:json
```

## Claim / Ticket

`workflow:claim` 不再直接扫描 backlog。

它只做两件事：

1. 从 `docs/workflow/live-queue.json` 取下一个可用 entry
2. 在 `~/.codex/workflow-leases/browser-brain-loop-next.json` 写 session 级 lease

规则：

1. 同一 session 再次 claim，会优先复用已有 lease。
2. 不同 session 不能拿到同一个 queue entry。
3. `in-progress` frontmatter 不再充当全局锁。
4. 真正 claim 时，lease owner 必须使用 Agent 自己选定并持续复用的名字，不能写通用 `agent`。
5. 若需要把 owner 同步回 issue frontmatter，使用同一个稳定名字。
6. hook 只在显式触发 `$agent-workflow-next` 或 `$auto-claim-issues-next` 时预先取号。
7. 若 `workflow:claim:preview` 返回 `all live queue entries are already leased`，不要误判成 queue 为空；可先做 planning preview。
8. 若 queue 为空，先判断是否需要重建 queue；确认为空后再进入 next-batch planning commit。
8. `write_scope` 重叠本身不是 claim blocker；除非存在真实前后依赖，否则用 `depends_on` 表达顺序约束，并通过 worktree / 小步提交处理并行编辑。
9. worktree 必须复用 canonical repo 的同一份 lease 文件；不要把每个 worktree 视为独立 dispatch 空间。

命令：

```bash
BBL_AGENT_NAME=<agent-name> bun run workflow:claim:preview
BBL_AGENT_NAME=<agent-name> bun run workflow:claim
BBL_AGENT_NAME=<agent-name> bun run workflow:claim:json

bun run workflow:claim:preview -- --name=<agent-name>
bun run workflow:claim -- --name=<agent-name>
bun run workflow:claim:json -- --name=<agent-name>
```

命名规则：

- 每个 Agent 自己选一个稳定名字，例如 `atlas`、`mercury`、`sable`
- 同一轮上下文里持续复用这个名字
- 不要使用 `agent`、`human`、`unassigned`

## Canonical Workspace Rule

- `docs/backlog/*.md` 是 issue record 真相源
- `docs/workflow/live-queue.json` 是 dispatch 真相源
- `~/.codex/workflow-leases/browser-brain-loop-next.json` 是 live lock 真相源
- queue build、真正 claim、最终 `done` 回写都只在 canonical workspace 可靠

## Working Loop

1. 先读 `docs/source-of-truth-map.md`
2. 再读本文件和 `docs/multi-agent-workflow.md`
3. backlog 刚变化过就先 `bun run workflow:queue:build`
4. 再执行 claim / preview
5. 拿到 ticket 后直接进入对应 issue 并持续推进，不额外等待批准
6. 完成后回写 issue
7. 用 `workflow:done` 收尾并重建 queue

## 当 Claim 暂时拿不到 Issue 时

如果 claim 结果是空：

1. 先确认是不是 queue 没重建
2. 若 backlog 刚变化，先执行 `bun run workflow:queue:build`
3. 若 live queue 仍有 entry，但全部已被 lease：
   - 不要误判成 queue 为空
   - 默认先执行 `bun run workflow:plan:preview` 做 read-only planning preview
   - 只有用户明确要求纯等待时，才只回报当前没有 claim slot、等待 lease 释放
4. 若 queue 仍为空，再检查是否还有 active lease
5. 若没有，再进入 `next-batch-planner` 的 planning commit
6. 把新发现的问题落成 backlog issue
7. 再重建 queue，并默认继续回到 claim / implement loop

## Completion Record

- `done` issue 不能只改 frontmatter；必须同时追加 `## 工作总结` 和 `## 相关 commits`
- `## 工作总结` 至少写：
  - 实现了什么
  - 实际跑了什么检查
  - 还有什么残留风险或外部 blocker
- `## 相关 commits` 必须写对应 code commit 的 hash 和 message；不要保留 `未提交`
- 如果仓库级 `bun run check` 被 write scope 外的并行改动阻塞，可以在 issue 中注明 blocker，但仍要把本 slice 已通过的聚焦检查写清楚

默认用 `workflow:done` 完成收尾；它会：

1. 校验当前 agent 持有的 live lease
2. 要求至少一个 `--commit`、`--implemented`、`--check`
3. 回写 issue 为 `done` 并追加 completion sections
4. 释放 lease
5. 重建 `docs/workflow/live-queue.json`

命令：

```bash
BBL_AGENT_NAME=<agent-name> bun run workflow:done -- --commit=HEAD --implemented="..." --check="bun run test -- <target>"
BBL_AGENT_NAME=<agent-name> bun run workflow:done:json -- --commit=HEAD --implemented="..." --check="bun run test -- <target>"
```

## Review Follow-ups

- 评审若发现“父 issue 已完成，但仍有后续架构缺口”，应新开 `Review:` 子 issue，而不是重写父 issue 的 Goal
- 父 issue 保持 `done` 时，必须追加 `## Sub Issues` 记录对应 follow-up，保留父子关系
- 子 issue 负责记录剩余缺口；父 issue 的 `## 工作总结` 只回写已完成范围

## Planner / Review Commands

```bash
bun run workflow:plan:preview
bun run workflow:plan
bun run workflow:plan:json
bun run workflow:new-review-issue -- --module=... --title=... --epic=... --acceptance-ref=... --scope=... --accept=...
```
