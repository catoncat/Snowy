# Issue Backlog

本目录是新仓的唯一派工入口。

## 规则

- backlog issue 是最小工作单元
- 主计划文档只定义方向，不直接派工
- 每个可并行任务都应有独立 backlog 文件
- 默认只允许一个 worker 持有一个 `in-progress` slice

## Frontmatter

```yaml
---
id: ISSUE-<序号>
title: 简明标题
status: open | in-progress | done
priority: p0 | p1 | p2
source: 需求来源
created: YYYY-MM-DD
assignee: agent | human | unassigned
claimed_at: ISO datetime
tags: [tag1, tag2]
kind: slice
epic: EPIC-<标识>
parallel_group: contracts-core | browser-vfs | js-runner | site-runtime | mv3-shell | sdk-docs
depends_on: [ISSUE-xxx]
write_scope:
  - packages/...
acceptance_ref: docs/<doc>.md
check_cmd: bun run test -- <target> | bun run check
---
```

## 并行约束

1. `write_scope` 重叠的 issue 不并行分配。
2. 以下为单写者超级节点：
   - `packages/contracts/src/index.ts`
   - `packages/core/src/index.ts`
   - `apps/mv3-shell/manifest.json`
   - `package.json`
   - `vitest.config.ts`
3. 拆任务优先按包边界，不按“同一功能不同段落”拆。
4. 需要接线的大文件改动，优先留给 integrator 或对应 lane owner。

## 角色分工

- `coordinator`
  - 维护 backlog、切片、优先级、依赖、冲突
  - 在 canonical workspace 执行 claim 和状态回写
- `worker`
  - 只处理 coordinator 已分配的 slice，并在自身 `write_scope` 内完成实现
- `integrator`
  - 合并 slice、跑仓库级门禁、修复集成冲突

## 工作流

1. 所有 agent 先读 `docs/start-here.md` 和 `docs/locked-decisions-2026-03-29.md`
2. coordinator 在 canonical workspace 更新 `docs/next-development-slices-2026-03-29.md`
3. coordinator 在 canonical workspace 执行 claim
4. worker 根据已分配的 issue 实现，不自行 claim
5. worker 完成后把结果回传给 coordinator/integrator
6. coordinator 或 integrator 在 canonical workspace 把 issue 改为 `done` 并追加工作记录

## Canonical Workspace Rule

- `docs/backlog/*.md` 是派工真相源
- 但它只在 canonical workspace 中可靠
- forked worker 即使本地把 issue 改成 `in-progress`，也不会自动阻止其他 worker 再 claim
- 所以 claim 和最终状态回写都必须在 canonical workspace 完成

## Claim 命令

```bash
bun run workflow:claim:preview
bun run workflow:claim
bun run workflow:claim:json
```

## 当前未完成项

1. `ISSUE-001` Descriptor catalog hardening
2. `ISSUE-003` BrowserVFS version retention and rollback helpers
3. `ISSUE-006` MV3 offscreen runner bridge
4. `ISSUE-007` Site runtime injection plan and installer split
5. `ISSUE-009` Skill SDK typed facade

## 推荐领取顺序

1. `ISSUE-001`
2. `ISSUE-003`
3. `ISSUE-007`
4. `ISSUE-009`
5. `ISSUE-006`
