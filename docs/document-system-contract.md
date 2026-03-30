# Document System Contract

## Doc Class

- `workflow-control`

## 目标

把“哪些文档是真相源、哪些只是参考、什么时候必须更新文档”收口成一份明确合同。

这份文档不定义产品行为。

它定义的是：

1. 文档系统怎么分层
2. Agent 完成任务时要补哪些文档
3. 什么时候视为文档已经过期

任务级阅读入口已经迁到：

- `docs/agent-task-index.md`

本文件继续保留，但它的职责只剩：

1. 文档分层
2. Doc Freshness Gate
3. Definition Of Done

## 1. 四类文档

### A. Locked Docs

用途：

- 定义架构铁律
- 定义不能被单个 slice 偷偷改掉的边界

当前代表：

- `AGENTS.md`
- `docs/locked-decisions-2026-03-29.md`

### B. Workflow / Control Docs

用途：

- 帮 Agent 建立上下文
- 组织 backlog / planning / cutover / AI surface
- 让多 Agent 并行时仍知道“现在该做什么”

当前代表：

- `docs/source-of-truth-map.md`
- `docs/module-tracking-ledger.json`
- `docs/agent-bootstrap-context-pack.md`
- `docs/multi-agent-workflow.md`
- `docs/ai-surface-index.md`
- `docs/legacy-to-vnext-migration-matrix.md`
- `docs/migration-parity-dashboard.md`
- `docs/cutover-readiness-criteria.md`
- `docs/backlog/*.md`

### C. Behavior Truth

用途：

- 定义当前仓已经落地的行为真相

当前代表：

- `packages/*/src/**`
- `packages/*/test/**`
- `apps/**/src/**`
- `apps/**/test/**`

### D. Reference Docs

用途：

- 提供上游背景和外部参考
- 帮 Agent 快速找到旧仓和研究仓材料

当前代表：

- `docs/legacy-reference-map.md`
- 旧仓设计文档
- `_research/*`

## 2. 新 Agent 的阅读路径

不要再以本文件维护任务阅读顺序。

统一入口：

1. `docs/agent-task-index.md`

如果你的任务触及 public surface / workflow / migration / docs gate，再回来看本文件。

## 3. Doc Freshness Gate

以下任一情况出现，都必须做文档同步检查：

1. 修改 `packages/contracts` 或 `packages/core`
2. 修改 `apps/mv3-shell`
3. 修改任何 public capability namespace
4. 修改 Skill runtime / AI surface / Host control plane
5. 关闭一个影响迁移判断的 review issue

### 最小同步规则

至少检查：

1. `docs/ai-surface-index.md`
2. `docs/agent-bootstrap-context-pack.md`
3. `docs/module-tracking-ledger.json`
4. `docs/legacy-to-vnext-migration-matrix.md`
5. `docs/migration-parity-dashboard.md`
6. `docs/cutover-readiness-criteria.md`

### 何时可以不改文档

只有当本次改动同时满足：

1. 不改 public surface
2. 不改 workflow
3. 不改 cutover 判断
4. 不改 bootstrap pack 对仓库状态的描述

才可以在 issue 总结里写明“已检查，无需同步文档”。

## 4. Definition Of Done

任何 issue 完成前，必须同时满足：

1. 代码或文档目标已完成
2. 跑过该 issue 的 `check_cmd`
3. `## 工作总结` 已写清：
   - 改了什么
   - 跑了什么检查
   - 残留风险是什么
4. `## 相关 commits` 已写 commit hash
5. 已执行 Doc Freshness Gate
6. 若发现后续缺口，已新增 follow-up issue，而不是口头遗留

## 5. Issue Taxonomy

推荐把 backlog issue 分成 5 类：

- `slice`
- `review`
- `follow-up`
- `decision`
- `doc-debt`

当前脚本不要求立刻强校验这 5 类。

但新建 issue 时，Agent 应按这个心智分类。

## 6. Impact Note

如果 issue 触及下列热点：

- `packages/contracts/src/index.ts`
- `packages/core/src/index.ts`
- `apps/mv3-shell/**`

则 issue 正文里应补一个 `## Impact Note`，回答：

1. 影响哪些 northbound surface
2. 影响聊天 Agent / Skill / UI / MCP 中的哪几类消费者
3. 是否需要同步控制面文档

## 7. 反模式

- 把每份文档都当成同级真相源
- 只改代码，不改控制面文档
- 只改文档，不说它属于哪类文档
- issue 标记 done，但没有检查 public surface 是否漂移
- planning 只排任务，不做 drift review
