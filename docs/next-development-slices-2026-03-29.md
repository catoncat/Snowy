# Browser Brain Loop Next 并行 Slices（2026-03-29）

本文件负责定义当前可并行的下一批工作单元。

## 规则

- 每个 slice 必须对应一个 `docs/backlog/*.md` 文件
- `write_scope` 重叠不并行
- 超级节点单写者
- 优先“新模块 + 小接线”

## 当前泳道

### Lane A: `contracts-core`

单写者：

- `packages/contracts/src/index.ts`
- `packages/core/src/index.ts`

串行 slices：

1. `ISSUE-001` descriptor catalog / schema / projection hardening
2. `ISSUE-002` executable skill invocation service

### Lane B: `browser-vfs`

主文件：

- `packages/browser-vfs/src/index.ts`

可独立并行：

1. `ISSUE-003` version retention / rollback helpers
2. `ISSUE-004` persistent metadata / package discovery helpers

### Lane C: `js-runner`

主文件：

- `packages/js-runner/src/index.ts`

串行 slices：

1. `ISSUE-005` RPC protocol / cancel / host health
2. `ISSUE-006` MV3 offscreen runner bridge

### Lane D: `site-runtime`

主文件：

- `packages/site-runtime/src/index.ts`

串行 slices：

1. `ISSUE-007` injection plan / installer split
2. `ISSUE-008` site skill fixture invoke path

### Lane E: `sdk-docs`

主文件：

- `packages/skill-sdk/src/index.ts`
- `docs/`

可并行：

1. `ISSUE-009` typed skill facade
2. `ISSUE-010` authoring docs / package templates

## 推荐并行批次

### Batch 1

- `ISSUE-001`
- `ISSUE-003`
- `ISSUE-005`
- `ISSUE-007`
- `ISSUE-009`

### Batch 2

- `ISSUE-002` after `ISSUE-001`
- `ISSUE-004` after `ISSUE-003`
- `ISSUE-006` after `ISSUE-005`
- `ISSUE-008` after `ISSUE-006` and `ISSUE-007`
- `ISSUE-010` after `ISSUE-009`

