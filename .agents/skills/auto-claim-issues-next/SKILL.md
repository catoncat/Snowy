---
name: auto-claim-issues-next
description: 为 browser-brain-loop-next 自动认领 backlog issue / slice。用于并行开发时挑选可开工 slice，遵守 depends_on 和 write_scope 冲突规则。
---

# Auto Claim Issues Next

用于本仓库的轻量取号 / claim。

## 重要前提

- claim path 的真相源不再是“扫整个 backlog”
- claim path 只看：
  - `docs/workflow/live-queue.json`
  - `~/.codex/workflow-leases/browser-brain-loop-next.json`
- backlog + module ledger 是 queue build 输入，不是 hook / claim 的首读集

## 何时使用

- 自动认领下一个可做 slice
- 判断当前 session 是否已有 live ticket
- 判断指定 issue 是否仍在 live queue 中

## 先读

1. `docs/agent-task-index.md`
2. `docs/workflow/live-queue.json`

如果 queue 刚变化来源不明，再补读：

3. `docs/backlog/README.md`
4. `docs/multi-agent-workflow.md`
5. `docs/module-tracking-ledger.json`
6. 当前 issue 文件

## 规则

1. 真正 claim 只应在 canonical workspace 中执行。
2. forked workspace 可以 preview，不应把本地 frontmatter 改动当成全局锁。
3. 真正 claim 时，lease owner 必须使用 Agent 自己选定的名字，不能写通用 `agent`。
4. 若后续需要把 owner 同步回 issue frontmatter，也使用同一个稳定名字。
5. 取号时默认优先复用当前 session 已有 lease。
6. 不同 session 不能拿到同一个 live queue entry。
7. `status: in-progress` 不再充当 dispatch lock。
8. 如果 backlog 刚发生变化，先重建 queue，不要直接 claim 旧 queue。
9. 除非用户明确要求，不要一次认领多个 issue。

## Queue Build 触发点

以下情况先执行：

```bash
bun run workflow:queue:build
```

触发点：

1. 新增 issue
2. issue 改成 `done`
3. `depends_on` 变化
4. `write_scope` 变化
5. 当前 queue 明显过期

## 没有可认领 issue 时

如果 claim 结果是空：

1. 先确认是不是 queue 没重建
2. 若 backlog 刚变化，先重建 queue
3. 若 queue 仍为空，再看是否还有 active lease
4. 若没有，则进入 `next-batch-planner`

## 用法

```bash
bun run workflow:queue:build
bun run workflow:queue:preview
bun run workflow:queue:json

BBL_AGENT_NAME=<agent-name> bun run workflow:claim:preview
BBL_AGENT_NAME=<agent-name> bun run workflow:claim
BBL_AGENT_NAME=<agent-name> bun run workflow:claim:json

bun run workflow:claim:preview -- --name=<agent-name>
bun run workflow:claim -- --name=<agent-name>
bun run workflow:claim:json -- --name=<agent-name>
```

## 取号后必须回报

- issue id / title
- module_id / module_stage / tracking_kind
- parallel_group
- depends_on
- write_scope
- check_cmd
