---
name: next-batch-planner
description: 当当前 backlog claim 队列为空，或需要把 review 结果转成下一批 backlog / planning 文档时使用。适用于“下一批做什么”“所有 issue 做完后怎么办”“把 review finding 落成 issue 和 batch”。
---

# Next Batch Planner

用于 browser-brain-loop-next 的 batch 边界规划。

## 何时使用

- `bun run workflow:claim:preview` 返回没有可认领 issue
- 当前 batch 的 issue 已全部收口，需要规划下一批
- 需要把 review finding 快速落成 backlog issue
- 需要根据 open backlog 自动生成新的 planning 文档

## 先读

1. `AGENTS.md`
2. `docs/source-of-truth-map.md`
3. `docs/locked-decisions-2026-03-29.md`
4. `docs/backlog/README.md`
5. `docs/multi-agent-workflow.md`
6. `project_plan.md`

## 标准流程

1. 先运行 `bun run workflow:claim:preview`
2. 若还有 `open` issue，不做 batch planning，回到 claim
3. 若没有 `open`，先确认没有 `in-progress`
4. 对照：
   - `docs/locked-decisions-2026-03-29.md`
   - `project_plan.md`
   - 当前代码与测试
5. 把发现的新 gap 写成 review backlog issue
6. 根据当前 `open` issue 生成新的 planning 文档

## 命令

```bash
bun run workflow:plan:preview
bun run workflow:plan
bun run workflow:plan:json

bun run workflow:new-review-issue -- \
  --title="Review: ctx permission and trace contract drift" \
  --priority=p0 \
  --group=contracts-core \
  --epic=EPIC-contracts-core \
  --acceptance-ref=project_plan.md \
  --scope=packages/contracts/src/index.ts \
  --scope=packages/core/src/index.ts \
  --tag=review \
  --tag=core \
  --finding="ctx.skills.invoke bypasses capability permission gate" \
  --accept="skills.invoke permission is enforced" \
  --accept="nested skill invoke writes trace entries"
```

## 输出要求

- 新开的 backlog issue 必须包含：
  - `Goal`
  - `Review Finding`
  - `Acceptance`
- 新 planning 文档必须来自当前 `status: open` issue，而不是口头列任务
- 若没有新 issue，就不要生成空 planning 文档
