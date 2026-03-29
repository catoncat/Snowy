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
3. `docs/ai-native-capability-surface-design.md`
   - 产品如何把自己暴露给 AI
   - capability / resource / workflow / host 的当前主轴
4. 当前正在处理的 `docs/backlog/<issue>.md`
   - 当前 slice 的 `Goal` / `Acceptance` / `write_scope` / `depends_on`
   - 任务状态唯一以这里为准
5. `packages/*/src/index.ts` + `packages/*/test/*.spec.ts`
   - 当前仓已经实现出来的行为口径
   - 若实现与旧设计冲突，先记 backlog/review，再改实现，不要口头覆盖
6. `docs/v0-slice.md`
   - 当前 v0 已完成范围
   - 用来判断“这是不是已经做过”
7. `project_plan.md`
   - phase 级推进蓝图
   - 用来指导下一批 issue 拆分
8. `docs/legacy-to-vnext-migration-matrix.md`
   - 旧仓能力面到新仓目标面的覆盖矩阵
9. `docs/migration-parity-dashboard.md`
   - 迁移状态总览
10. `docs/cutover-readiness-criteria.md`
   - 切主线门槛
11. `docs/legacy-reference-map.md`
   - 旧仓 / 研究仓的参考地图
   - 只负责告诉你去哪里看，不直接决定新仓实现
12. 旧仓 `docs/skill-runtime-site-capability-redesign-2026-03-29.md`
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
5. `docs/ai-native-capability-surface-design.md`
6. `docs/v0-slice.md`
7. `docs/legacy-reference-map.md`
8. 你要做的那个 `docs/backlog/<issue>.md`
9. 如涉及旧仓迁移，再读：
   - `docs/legacy-to-vnext-migration-matrix.md`
   - `docs/migration-parity-dashboard.md`
   - `docs/cutover-readiness-criteria.md`

### 只想知道“现在该做什么”

1. `docs/backlog/*.md`
2. 找 `status: open` 或你已 claim 的 `status: in-progress`
3. 再看对应 lane 的代码入口

### 只想知道“这套架构到底想成为什么”

1. `docs/start-here.md`
2. `docs/locked-decisions-2026-03-29.md`
3. `docs/ai-native-capability-surface-design.md`
4. `project_plan.md`
5. 旧仓 redesign doc

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

如果只保留最核心的 9 份，优先看这 9 个：

1. `AGENTS.md`
2. `docs/source-of-truth-map.md`
3. `docs/locked-decisions-2026-03-29.md`
4. `docs/ai-native-capability-surface-design.md`
5. `docs/backlog/*.md`
6. `docs/v0-slice.md`
7. `project_plan.md`
8. `docs/legacy-to-vnext-migration-matrix.md`
9. `docs/migration-parity-dashboard.md`

## 7. 现在该怎么继续规划

- 第一批功能 slice 基本完成后，下一批应主要从 `docs/backlog` 里的 review issues 继续拆
- `docs/next-development-slices-2026-03-29.md` 可以保留为 batch 1 历史记录
- 下一批建议新建单独批次文档，而不是继续往旧 batch 文件里叠

## 8. 文档为什么会过期

会。主要有 3 种过期方式：

1. code/test 已变，但 migration matrix / parity dashboard 没同步
2. backlog issue 已关闭，但 cutover 判断仍沿用旧结论
3. 旧仓又被拿来当“默认真相源”，覆盖了新仓已锁定决策

所以这些文档不是“单独定义行为”，而是迁移治理控制面。

行为真相仍然以：

1. 当前 backlog issue
2. `packages/*/src/index.ts`
3. `packages/*/test/*.spec.ts`

为准。

## 9. 防过期同步规则

以下动作发生时，必须同步更新控制面文档：

1. 某个 `review-gap` / `partial` / `not-started` 的迁移 issue 被关闭
2. 某个 capability family 或 package 的 public contract 发生变化
3. 某个 area 被明确判定为 `intentionally-dropped`
4. 团队要判断“能不能切主线”

最少同步动作：

1. 更新 `docs/legacy-to-vnext-migration-matrix.md`
2. 更新 `docs/migration-parity-dashboard.md`
3. 如 gate 判定变了，再更新 `docs/cutover-readiness-criteria.md`

如果代码已经改了，但这三份文档没更新，默认视为迁移控制面过期。
