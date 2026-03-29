# Source Of Truth Map

本文件回答两个问题：

1. 这次重构到底以哪些文档为主依赖
2. 当多个文档/代码/计划看起来冲突时，以谁为准

## 1. 一句话结论

- `docs/backlog/*.md` 是当前任务真相源
- `docs/locked-decisions-2026-03-29.md` 是架构边界真相源
- `packages/*/src/index.ts` + `packages/*/test/*.spec.ts` 是已落地行为真相源
- 旧仓设计文档是上游来源，不是新仓实现期的覆盖源

## 2. 文档优先级

按优先级从高到低看：

1. `AGENTS.md`
   - 仓库级工作规则
   - onboarding、north star、repo index
2. `docs/locked-decisions-2026-03-29.md`
   - 已拍板约束
   - 实现不能偷偷偏离
3. 当前正在处理的 `docs/backlog/<issue>.md`
   - 当前 slice 的 `Goal` / `Acceptance` / `write_scope` / `depends_on`
   - 任务状态唯一以这里为准
4. `packages/*/src/index.ts` + `packages/*/test/*.spec.ts`
   - 当前仓已经实现出来的行为口径
   - 若实现与旧设计冲突，先记 backlog/review，再改实现，不要口头覆盖
5. `docs/v0-slice.md`
   - 当前 v0 已完成范围
   - 用来判断“这是不是已经做过”
6. `project_plan.md`
   - phase 级推进蓝图
   - 用来指导下一批 issue 拆分
7. `docs/legacy-reference-map.md`
   - 旧仓 / 研究仓的参考地图
   - 只负责告诉你去哪里看，不直接决定新仓实现
8. 旧仓 `docs/skill-runtime-site-capability-redesign-2026-03-29.md`
   - 顶层设计来源
   - 仅作上游设计依据，不覆盖新仓 locked decisions

## 3. 冲突时怎么判

### 场景 A：backlog 和旧设计冲突

- 以 `backlog issue + locked decisions` 为准
- 旧设计只能作为“为什么最初这么想”的解释

### 场景 B：代码/测试和文档冲突

- 如果是已完成 slice：
  - 先以测试和实现为当前行为真相
  - 再新开 review/backlog 修正文档或实现
- 如果是正在做的 slice：
  - 先回到当前 issue 的 acceptance
  - 不要在一个 slice 里顺手改 architecture contract

### 场景 C：`next-development-slices` 和 backlog 状态冲突

- 以 `docs/backlog/*.md` 为准
- `docs/next-development-slices-2026-03-29.md` 目前主要是第一批 batch 快照，不再是唯一排期源

## 4. 进入项目的最短阅读路径

### 新 agent 第一次进入仓库

1. `AGENTS.md`
2. `docs/source-of-truth-map.md`
3. `docs/start-here.md`
4. `docs/locked-decisions-2026-03-29.md`
5. `docs/v0-slice.md`
6. `docs/legacy-reference-map.md`
7. 你要做的那个 `docs/backlog/<issue>.md`

### 只想知道“现在该做什么”

1. `docs/backlog/*.md`
2. 找 `status: open` 或你已 claim 的 `status: in-progress`
3. 再看对应 lane 的代码入口

### 只想知道“这套架构到底想成为什么”

1. `docs/start-here.md`
2. `docs/locked-decisions-2026-03-29.md`
3. `project_plan.md`
4. 旧仓 redesign doc

## 5. 包级真相入口

| 关注点 | 先看哪里 |
|---|---|
| canonical descriptor / contract | `packages/contracts/src/index.ts` |
| capability routing / ctx / invoke | `packages/core/src/index.ts` |
| BrowserVFS | `packages/browser-vfs/src/index.ts` |
| JS Runner | `packages/js-runner/src/index.ts` |
| Site Runtime | `packages/site-runtime/src/index.ts` |
| Skill SDK | `packages/skill-sdk/src/index.ts` |
| MV3 shell | `apps/mv3-shell/` |

测试入口对应看各包 `test/*.spec.ts`。

## 6. 当前推荐的“主依赖文档”集合

如果只保留最核心的 6 份，优先看这 6 个：

1. `AGENTS.md`
2. `docs/source-of-truth-map.md`
3. `docs/locked-decisions-2026-03-29.md`
4. `docs/backlog/*.md`
5. `docs/v0-slice.md`
6. `project_plan.md`

## 7. 现在该怎么继续规划

- 第一批功能 slice 基本完成后，下一批应主要从 `docs/backlog` 里的 review issues 继续拆
- `docs/next-development-slices-2026-03-29.md` 可以保留为 batch 1 历史记录
- 下一批建议新建单独批次文档，而不是继续往旧 batch 文件里叠
