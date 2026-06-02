# Start Here

## 这仓库为什么存在

这个仓库不是旧仓的普通 feature 分支，而是一次架构重构的主线实验场。

核心目标不是“替一个沙盒库”，而是：

> 去掉 `LIFO/browser_bash` 之后，仍然让 Browser Brain Loop 拥有可执行、可扩展、可分享、可自举的网站能力、产品能力与运行时能力。

## 当前阶段

先不要误判当前仓库状态。

当前已经完成的是：

- capability / AI surface / host / site / vfs / runner 的底座重构

当前还没有完成的是：

- browser-side kernel 主层
- session / run queue / compaction 主链
- 完整 diagnostics / intervention / browser automation 主线
- kernel prompt / context / retry / failure-policy 收口
- product UI / Skill Studio 收口

所以现在的主线不是“继续把 substrate 做得更满”，而是：

> 把 browser-side brain 补回来。

## 你必须先知道的 5 件事

1. 用户概念只保留 `Skill`
2. 产品必须有统一 `AI Surface`
3. invokable actions 继续通过 public `Capability API`
4. 浏览器是控制中枢，Host 是一等执行面
5. 旧仓是参考对象，不是兼容对象

## 新仓要替换什么

- 替换掉旧仓里以 `LIFO/browser_bash` 为中心的运行时心智
- 替换掉 `Plugin`/`Skill`/`Site Adapter` 多概念叠加
- 替换掉 tool plan builder 的大量硬编码

## 新仓要保留什么

- 浏览器侧大脑
- `mem://` 文件抽象
- CDP / DOM / 页面登录态复用
- Host 执行面（本地 / 远程）
- Skill 作为安装和分享单位

## 不要做什么

- 不要把 `Plugin` 重新扶正成主概念
- 不要把 `ToolContract` 再变回真相源
- 不要把 shell 命令重新塞回 VFS/skill discovery
- 不要把所有产品能力直接摊平成工具列表
- 不要因为旧仓有现成实现，就原样搬回新仓

## 当前已实现到哪里

已完成 v0 slice：

- canonical descriptor / tool projection
- family provider registry
- skill runtime context
- BrowserVFS v0
- JS Runner host v0
- Site Runtime v0
- MV3 shell v0

详情见 `docs/v0-slice.md`

注意：

- `v0` = substrate foundation
- `v0` 不等于 kernel parity
- 当前 architecture mainline 见：
  - `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
  - `docs/kernel-skeleton-design.md`
  - `docs/module-tracking-ledger.json`
  - `docs/workflow/live-queue.json`

## 如果你是来跑 workflow / claim

不要一上来扫完整个 backlog。

先按这个顺序：

1. `docs/agent-task-index.md`
2. `docs/workflow/live-queue.json`
3. 当前 issue 文件

工作流判断要分两层看：

- planning / coverage truth：`docs/module-tracking-ledger.json` + `docs/backlog/*.md`
- dispatch / locking truth：`docs/workflow/live-queue.json` + `~/.codex/workflow-leases/browser-brain-loop-next.json`

如果 backlog 刚发生变化，例如：

- 新增 issue
- 某 issue 改成 `done`
- `depends_on` 变化
- `write_scope` 变化

先执行：

```bash
bun run workflow:queue:build
```

再去 claim。

## 进入代码前的强制阅读顺序

不要再维护一个“所有任务都要走的全量顺序”。

统一入口改为：

1. `docs/agent-task-index.md`
2. 按当前任务类型补读

典型场景：

- claim / workflow：`docs/workflow/live-queue.json`
- implement claimed issue：当前 issue + `acceptance_ref` + 对应代码测试
- finish / close issue：当前 issue + `docs/backlog/README.md`
- planning：`docs/source-of-truth-map.md` + `docs/module-tracking-ledger.json` + `docs/backlog/README.md`
- architecture：`docs/locked-decisions-2026-03-29.md` + recovery report + kernel skeleton

完成 issue 不只代表代码写完。

至少还要补：

1. code commit
2. issue `status: done`
3. issue `## 工作总结`
4. issue `## 相关 commits`
5. 若 backlog metadata 变化影响 dispatch，则 `bun run workflow:queue:build`

## 如果你要判断“旧仓是不是已经迁完”

不要只看 backlog。

这 3 份文档共同构成迁移控制面，不是普通参考资料。

至少同时看：

1. `docs/legacy-to-vnext-migration-matrix.md`
2. `docs/migration-parity-dashboard.md`
3. `docs/cutover-readiness-criteria.md`

## 如果你要改架构层

先看新仓当前纠偏结论：

- `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
- `docs/kernel-skeleton-design.md`

再看旧仓：

- `/Users/envvar/work/repos/snowy/browser-brain-loop/docs/skill-runtime-site-capability-redesign-2026-03-29.md`
- `/Users/envvar/work/repos/snowy/browser-brain-loop/docs/kernel-architecture.md`

再看研究仓：

- `~/work/repos/_research/pi-mono/`
- `~/work/repos/_research/AIPex/`
- `~/work/repos/_research/opencli/`
- `~/work/repos/_research/bb-browser/`
- `~/work/repos/_research/bb-browser/bb-sites/`

最后回来看：

- `docs/ai-native-capability-surface-design.md`

## 如果你只处理某个 lane

- `contracts-core`: 先读 `packages/contracts/src/index.ts`、`packages/core/src/index.ts`
- `kernel`: 先读 `docs/kernel-skeleton-design.md`、`packages/kernel/src/`
- `browser-vfs`: 先读 `packages/browser-vfs/src/index.ts`
- `js-runner`: 先读 `packages/js-runner/src/index.ts`
- `site-runtime`: 先读 `packages/site-runtime/src/index.ts`
- `mv3-shell`: 先读 `apps/mv3-shell/manifest.json` 和 `src/`
- `sdk-docs`: 先读 `packages/skill-sdk/src/index.ts` 和 `docs/`
