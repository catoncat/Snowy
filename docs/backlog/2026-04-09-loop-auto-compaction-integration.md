---
id: ISSUE-103
title: Loop compaction threshold 与 overflow retry 语义对齐
status: done
priority: p0
source: next-batch-planner review 2026-04-09
created: 2026-04-09
assignee: codex-019d70f5
tags: [kernel, compaction, loop]
kind: slice
epic: EPIC-kernel
parallel_group: kernel
module_id: kernel
module_stage: mainline
tracking_kind: mainline
depends_on: []
write_scope:
  - packages/kernel/src/loop-orchestrator.ts
  - packages/kernel/src/kernel-facade.ts
  - packages/kernel/test/loop-orchestrator.spec.ts
  - packages/kernel/test/kernel-facade.spec.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bunx vitest run packages/kernel/test/loop-orchestrator.spec.ts packages/kernel/test/kernel-facade.spec.ts"
completed_at: 2026-04-09T06:42:00.000Z
---

## Goal

把 loop orchestrator 当前已接入的 compaction 路径收敛成正确的 threshold / overflow 语义：阈值触发走 threshold compaction，真实 context overflow 走 overflow compaction + retry，并保持 run state 转换一致。

## Review Finding

`runLoop()` 当前已经会在 turn 间调用 `kernel.shouldCompact()`，并在命中后触发 `kernel.triggerCompaction()`；因此剩余缺口不再是“有没有自动 compaction 集成”，而是“集成后的触发语义是否正确”。当前 turn 后检查把 compaction reason 写死成 `overflow`，同时 overflow error → compaction → retry 的语义仍未单独收口。

## Acceptance

- [x] turn 间阈值检查命中时使用 `threshold` compaction reason，而不是复用 `overflow`
- [x] LLM 返回真实 context overflow / window exceeded 错误时，触发 `overflow` compaction + retry
- [x] compaction 期间与完成后的 run phase / retry 语义保持一致，不引入卡在 `compacting` 的状态漂移
- [x] 测试覆盖：threshold 触发、overflow 触发、compaction 后继续执行与 context rebuild 正确

## 工作总结

### 实现了什么
- 在 `packages/kernel/src/loop-orchestrator.ts` 把 turn 间自动 compaction 的 reason 从固定 `overflow` 改为 `threshold`
- 为 LLM 请求增加 context overflow 识别；命中 `context window exceeded`/`context length exceeded`/`too many tokens` 等真实超窗错误时，走 `overflow` compaction 后继续下一轮请求
- 为连续 overflow 场景补上 compaction retry budget，避免 compaction 无法缩小上下文时陷入无限 `overflow -> compact -> continue` 热循环
- 保持 compaction 完成后的运行态可继续推进，并在 `packages/kernel/test/loop-orchestrator.spec.ts` 增补 threshold/overflow 两条集成测试，验证 compaction summary 会进入下一次请求上下文

### 实际跑了什么检查
- `bunx vitest run packages/kernel/test/loop-orchestrator.spec.ts -t "fails after overflow compaction retry budget is exhausted"`
- `bunx vitest run packages/kernel/test/loop-orchestrator.spec.ts`
- `bunx vitest run packages/kernel/test/loop-orchestrator.spec.ts packages/kernel/test/kernel-facade.spec.ts`
- `./node_modules/.bin/biome check packages/kernel/src/loop-orchestrator.ts packages/kernel/test/loop-orchestrator.spec.ts`

### 残留风险
- `docs/workflow/live-queue.json` 当前受同批未提交 backlog/planning 文件影响；本票已按要求执行聚焦验证，queue 重建需与该批文档一并收口，避免提交引用未入库 issue 的生成结果

## 相关 commits

- `1bc78a618764` fix(kernel): 对齐 loop compaction 触发语义
- `95ac77d2837c` fix(kernel): 限制 overflow compaction 重试
