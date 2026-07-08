# Agent Task Index

本文件是主入口。

目标只有两个：

1. 让 Agent 先锁定当前任务
2. 让 Agent 按需读取，而不是每次全量读文档

## Minimal Bootstrap

进入仓库后默认只做两步：

1. 读本文件
2. 按当前任务类型走对应 read path

不要默认全量读：

- 所有 review 文档
- 所有 batch 文档
- 所有 migration 文档
- 所有 workflow 文档

## Read Paths

### A. 我要知道现在该做哪个 issue

如果当前 turn 已有 hook 注入的 ticket：

- 直接进入当前 issue
- 不重读 live queue
- 不重跑 claim

如果没有 hook ticket，再读：

1. `docs/workflow/live-queue.json`
2. `docs/backlog/README.md`，仅当你需要理解 queue / lease 规则时

暂时不要读：

- `docs/module-tracking-ledger.json`
- `docs/multi-agent-workflow.md`
- `docs/reviews/*.md`
- 历史 batch 文档

### B. 我已经拿到 issue，要开始实现

只读：

1. 当前 issue 文件
2. issue 的 `acceptance_ref`
3. 对应 lane 的 `src/` + `test/`

按需再读：

- `docs/locked-decisions-2026-03-29.md`
  - 仅当改 public surface / architecture contract
- `docs/ai-surface-index.md`
  - 仅当改 AI surface / control plane
- `docs/document-system-contract.md`
  - 仅当需要过 Doc Freshness Gate

### C. 我已经做完代码，要收口 / close issue

读：

1. 当前 issue 文件
2. `docs/backlog/README.md`

按需再读：

- `docs/document-system-contract.md`
  - 仅当你要确认 DoD / Doc Freshness Gate

完成前必须补：

- code commit
- issue `status: done`
- `## 工作总结`
- `## 相关 commits`
- 若 backlog metadata 变化影响 dispatch，执行 `bun run workflow:queue:build`

### D. Queue 为空，或要做下一批规划

产品章节（2026-07-08 起）的规划入口是 roadmap，不再是 cutover gate：

- 先读 `docs/product-roadmap-2026-07-08.md`
- 对照当前里程碑（M1 → M2 → M3 → M4）判断：是里程碑没收口（缺验收或缺 dogfood 证据），还是真的该规划下一批
- 下一批默认是 1-3 张用户可感知的里程碑票，不是 parity / review inventory 拆票

读：

1. `docs/product-roadmap-2026-07-08.md`
2. `docs/planning/2026-07-08-handoff-prompt.md`（新 agent 接手时）
3. `docs/planning/2026-07-08-product-discovery-notes.md`（需复盘调查过程时）
4. `docs/source-of-truth-map.md`
5. `docs/module-tracking-ledger.json`
6. `docs/backlog/README.md`
7. `docs/multi-agent-workflow.md`（仅当需要理解并行协作规则）

按需再读：

- `docs/ai-surface-index.md`
- `project_plan.md`
- 当前相关包代码和测试

### E. 我要改 architecture / public surface

读：

1. `docs/start-here.md`
2. `docs/locked-decisions-2026-03-29.md`
3. `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
4. `docs/kernel-skeleton-design.md`
5. 对应 lane 的代码和测试

按需再读：

- `docs/ai-native-capability-surface-design.md`
- `docs/ai-surface-index.md`
- `docs/document-system-contract.md`

### F. 我要判断迁移 / cutover / parity

读：

1. `docs/legacy-to-vnext-migration-matrix.md`
2. `docs/migration-parity-dashboard.md`
3. `docs/cutover-readiness-criteria.md`
4. `docs/legacy-reference-map.md`

## Skip Rules

以下文档不是默认首读：

- `docs/reviews/2026-03-29-comprehensive-review-summary.md`
- `docs/reviews/2026-03-29-architecture-quality-review.md`
- `docs/reviews/2026-03-29-code-engineering-quality-review.md`
- `docs/reviews/2026-03-29-docs-dx-review.md`
- `docs/next-development-slices-*.md`

它们的用途是：

- gap inventory
- 历史 planning snapshot

不是：

- claim path 真相源
- 当前任务的默认入口

## Workflow Shortcuts

- 取号 / claim：
  - `bun run workflow:claim:preview`
  - `bun run workflow:claim`
- backlog 刚变化后重建 queue：
  - `bun run workflow:queue:build`
- queue 空了进入 planning commit；queue 被 lease 占满时可先做 planning preview：
  - `bun run workflow:plan:preview`
  - `bun run workflow:plan`
- queue 空时先对照 roadmap 判断里程碑收口状态：
  - `docs/product-roadmap-2026-07-08.md`

## One-Line Rule

先锁任务，再补上下文；实现看 issue 和代码，收口看 Completion Record；queue 空时先对照 `docs/product-roadmap-2026-07-08.md` 判断当前里程碑是否收口，不要默认继续拆小 issue。
