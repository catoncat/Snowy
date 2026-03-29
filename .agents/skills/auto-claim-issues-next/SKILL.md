---
name: auto-claim-issues-next
description: 为 browser-brain-loop-next 自动认领 backlog issue / slice。用于并行开发时挑选可开工 slice，遵守 depends_on 和 write_scope 冲突规则。
---

# Auto Claim Issues Next

用于本仓库的 backlog 派工。

## 重要前提

- 所有 Agent 都可以用它判断“当前该接哪个 issue”
- 但真正的 claim 只应在 canonical workspace 中执行
- forked workspace 可以做 preview / 判断，不应把本地 frontmatter 改动当成全局锁
- 如果当前动作更像“claim / planning / backlog 整理”，可以临时叠加 `.agents/prompts/coordinator.md`

## 何时使用

- 自动认领下一个可做 slice
- 判断当前有哪些 issue 可做
- 判断哪些 issue 被依赖或 write_scope 冲突阻塞

## 规则

1. 先读 `docs/start-here.md`
2. 再读 `docs/source-of-truth-map.md`
3. 再读 `docs/agent-bootstrap-context-pack.md`
4. 再读 `docs/locked-decisions-2026-03-29.md`
5. 再读 `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
6. 再读 `docs/kernel-skeleton-design.md`
7. 再读 `docs/backlog/README.md`
8. 再读当前 batch / planning 文档
7. 默认只看 `status: open`
6. 默认要求：
   - `depends_on` 全部完成
   - 不与任何 `in-progress` issue 的 `write_scope` 冲突
7. 若执行真正 claim，必须确保当前在 canonical workspace
8. 真正 claim 时，必须用 Agent 自己选定的名字写入 `assignee`，不能写通用 `agent`
9. 认领后必须回报：
   - issue id / title
   - parallel_group
   - depends_on
   - write_scope
   - check_cmd
10. 除非用户明确要求，不要一次认领多个 issue
11. 如果同时存在多个 claimable issue，默认优先当前主线 batch 中的 `kernel p0`

## 没有可认领 issue 时

如果 claim 结果是“当前没有可认领的 open issue”：

1. 先确认是不是还有 `in-progress` issue
2. 若没有，进入 batch planning，而不是停住：
   - 对照 `docs/locked-decisions-2026-03-29.md`
   - 对照 `project_plan.md`
   - 对照当前实现 / 测试
3. 把 drift / gap 写成新的 backlog issue
4. 新建新的 planning 文档
5. 再回来 claim

## 用法

```bash
BBL_AGENT_NAME=<agent-name> bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts
BBL_AGENT_NAME=<agent-name> bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts --dry-run
BBL_AGENT_NAME=<agent-name> bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts --issue=ISSUE-003
BBL_AGENT_NAME=<agent-name> bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts --group=browser-vfs
BBL_AGENT_NAME=<agent-name> bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts --json

bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts --name=<agent-name>
bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts --dry-run --name=<agent-name>
bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts --issue=ISSUE-003 --name=<agent-name>
bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts --group=browser-vfs --name=<agent-name>
bun .agents/skills/auto-claim-issues-next/scripts/claim-issue.ts --json --name=<agent-name>
```
