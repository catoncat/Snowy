---
name: next-batch-planner
description: 当当前 backlog claim 队列为空、当前 live queue 全部 entry 都已被 lease、或需要在已有 issue 进行中提前做预规划 / coverage review / drift review 时使用。适用于“下一批做什么”“现在先做 planning preview”“所有 issue 做完后怎么办”“把 review finding 落成 issue 和 batch”。
---

# Next Batch Planner

用于 browser-brain-loop-next 的 batch 边界规划。

## 核心口径

- 这个 skill 负责指导 Agent 做 review、reflection 和 planning 判断
- planning 是 agent 原生工作形态，不是脚本自动产物
- helper 命令只负责：
  - backlog issue 落盘
  - 编号
  - planning 文档骨架
- helper 命令不负责决定“下一批做什么”
- helper 命令不负责替代对主线、腐坏、阶段目标的判断
- 参考文档默认都可能腐坏；文档只提供候选真相，不能绕过对当前代码、测试和最近 landed 事实的验证
- 如果当前动作更像“planning / backlog 整理”，可以临时叠加 `.agents/prompts/coordinator.md`

## 何时使用

- `bun run workflow:claim:preview` 返回没有可认领 issue
- `bun run workflow:claim:preview` / workflow ticket preflight 提示 `all live queue entries are already leased`
- 当前 batch 的 issue 已全部收口，需要规划下一批
- 当前已有 issue 在进行中，但你想先做 read-only planning preview / coverage review
- 需要总结上一批到底推进了什么、哪些判断失效了、哪些文档开始腐坏
- 需要把 review finding 快速落成 backlog issue
- 需要根据 open backlog 自动生成新的 planning 文档

## 先读

1. `docs/agent-task-index.md`
2. `docs/source-of-truth-map.md`
3. `docs/module-tracking-ledger.json`
4. `docs/backlog/README.md`
5. `docs/multi-agent-workflow.md`
6. `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
7. `docs/kernel-skeleton-design.md`

按需再读：

8. `docs/locked-decisions-2026-03-29.md`
9. `docs/ai-surface-index.md`
10. `docs/document-system-contract.md`
11. `project_plan.md`

## 两种模式

### Mode A: Planning Preview

- 只读
- 可在有 `in-progress` issue 或 active lease 时执行
- 用于提前看 coverage / drift / 下一批候选，不默认回写 backlog / queue / planning doc
- 优先使用：

```bash
bun run workflow:plan:preview
```

### Mode B: Planning Commit

- 会落 planning 文档，或继续衔接 backlog / queue rebuild
- 默认只在 queue 为空且没有 active lease 时执行
- 若用户明确要求，也可在协调后执行，但要显式说明这是 mutating planning
- commit 完成后默认继续 queue rebuild -> claim loop，不把 planning 结果当等待批准的终点

## 标准流程

1. 先运行 `bun run workflow:claim:preview`
2. 先判断当前是 preview 还是 commit：
   - 若 queue 被 lease 占满，或只是想提前做 planning，进入 preview
   - 若 queue 为空且无 active lease，进入 commit
3. 若是 commit，先确认没有 `in-progress` 且没有 active lease
4. 先做 `North Star Check`：
   - 当前 repo 主线是否仍是 browser-side kernel 后续的一等能力面
   - 当前 open issue / review finding 是否真的在推进这一主线，而不是在主线上无限切碎
5. 再做 `Batch Retrospective`：
   - 上一批真正推进了哪些 module / gate / cutover 能力
   - 哪些假设已经被代码或测试推翻
   - 哪些 done issue 只是局部 seam 收口，并未改变阶段判断
6. 再对照：
   - `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
   - `docs/kernel-skeleton-design.md`
   - 当前代码与测试
7. 做 `Rot / Freshness Check`：
   - 哪些参考文档与当前代码/测试/完成 issue 不一致
   - 哪些 batch / ledger / backlog 口径已经失真
   - 哪些 follow-up 正在把问题越拆越碎
8. 先做一轮 module coverage review：
   - 哪些非 deferred module 还没有 live issue
   - 哪些 issue 缺少 module mapping
   - module stage 和 issue frontmatter 是否一致
9. 再做一轮 drift review：
   - kernel mainline drift
   - architecture drift
   - AI surface drift
   - doc freshness drift
10. 再由 Agent 判断哪些 finding 真值得进入下一批：
   - 能推进 module 从 `partial` 向 `shipped` 逼近
   - 能解除真实阻塞或 cutover/gate 阻塞
   - 能修复真相源腐坏
   - 不能只因为“还有个 gap”就默认开票
11. preview 模式：先输出 recommendation set，不落盘
12. commit 模式：再把这些判断落成 backlog issue，并根据当前 `status: open` issue 生成 planning 文档
13. commit 完成后，重建 live queue；若 queue 已恢复可认领 entry，默认继续回到 claim loop

## 命令

```bash
bun run workflow:plan:preview
bun run workflow:plan
bun run workflow:plan:json

bun run workflow:new-review-issue -- \
  --module=ai-surface-control-plane \
  --title="Review: ctx permission and trace contract drift" \
  --priority=p0 \
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

- preview 输出应明确标记是否 `provisional`
- preview 结果应带：
  - `North Star Check`
  - `Batch Retrospective`
  - `Rot / Freshness Review`
  - `Coverage Review`
  - `Drift Review`
  - `Recommended Next Milestone`
  - `Recommended Next Issues`
  - `Not Now`
- preview 不要默认把 helper 命令输出误当成 backlog 变更
- preview 应显式指出：本轮判断里哪些结论来自文档，哪些结论已经被代码 / 测试 / 已完成 issue 验证
- 新开的 backlog issue 必须包含：
  - `Goal`
  - `Review Finding`
  - `Acceptance`
- 新 issue 必须带 `module_id` / `module_stage` / `tracking_kind`
- 新 issue 应先判断属于：
  - `slice`
  - `review`
  - `follow-up`
  - `decision`
  - `doc-debt`
- planning commit 生成的新 planning 文档必须来自当前 `status: open` issue，而不是口头列任务
- 若没有新 issue，就不要生成空 planning 文档
- 不要把 helper 命令本身误当成 review / planning 的主体
- 不要把引用过的文档自动视为仍然新鲜；若发现文档与行为真相冲突，先记录腐坏，再决定是否修文档或开 truth-repair issue
- 不要把“每个 partial module 都要有一张票”当成 planning 目标；planning 的目标是给出更好的阶段性推荐
- planning commit 不是暂停点；生成 queue 后默认继续进入下一轮 claim / implement
