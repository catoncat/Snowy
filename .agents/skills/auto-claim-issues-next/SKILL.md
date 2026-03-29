---
name: auto-claim-issues-next
description: 为 browser-brain-loop-next 自动认领 backlog issue / slice。用于并行开发时挑选可开工 slice，遵守 depends_on 和 write_scope 冲突规则。
---

# Auto Claim Issues Next

用于本仓库的 backlog 派工。

## 重要前提

- 这个 skill 只应该由 coordinator 在 canonical workspace 中运行
- 不要让 forked worker 自己运行 claim
- 否则多个 workspace 会各自看到“本地还是 open”，产生重复认领

## 何时使用

- 自动认领下一个可做 slice
- 给某个 AI 分配当前可并行的任务
- 判断哪些 issue 被依赖或 write_scope 冲突阻塞

## 规则

1. 先读 `docs/start-here.md`
2. 再读 `docs/locked-decisions-2026-03-29.md`
3. 再读 `docs/backlog/README.md`
4. 再读 `docs/next-development-slices-2026-03-29.md`
5. 默认只认领 `status: open`
6. 默认要求：
   - `depends_on` 全部完成
   - 不与任何 `in-progress` issue 的 `write_scope` 冲突
7. 认领后必须回报：
   - issue id / title
   - parallel_group
   - depends_on
   - write_scope
   - check_cmd
8. 除非用户明确要求，不要一次认领多个 issue

## 用法

```bash
bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts --assignee=agent
bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts --dry-run --assignee=agent
bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts --issue=ISSUE-003 --assignee=agent
bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts --group=browser-vfs --assignee=agent
bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts --json --assignee=agent
```
