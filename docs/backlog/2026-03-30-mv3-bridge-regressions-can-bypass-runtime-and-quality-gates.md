---
id: ISSUE-065
title: "Review: mv3-shell bridge regressions can bypass runtime and quality gates"
status: done
priority: p0
source: "plugin-mainline correction review 2026-03-30"
created: 2026-03-30
assignee: codex-019d3caf
tags:
  - review
  - follow-up
  - mv3-shell
  - execution-host-bridge
  - test-quality
  - plugin-mainline-correction
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-mv3-shell
parallel_group: mv3-shell
depends_on: []
write_scope:
  - apps/mv3-shell/src/background.js
  - apps/mv3-shell/test/manifest.spec.ts
  - packages/core/test/core.spec.ts
  - package.json
  - tsconfig.json
acceptance_ref: docs/reviews/2026-03-30-plugin-mainline-correction-control.md
check_cmd: "bun run test -- apps/mv3-shell/test/manifest.spec.ts packages/core/test/core.spec.ts && bun run typecheck"
---

## Goal

先恢复 `mv3-shell` bridge 的可信 runtime baseline，并补上能稳定拦住同类 regressions 的质量门禁。

## Review Finding

- `apps/mv3-shell/src/background.js` 当前存在未定义符号引用，bridge 构造阶段即可 runtime crash。
- 根 `typecheck` 只覆盖 `*.ts`，没有覆盖 `apps/mv3-shell` 的关键 JS bridge 文件，因此“typecheck 通过”不能代表 MV3 主链可启动。
- 现有测试还出现 control-plane / exportability 断言互相冲突的情况，说明红线本身已经失真。

## Acceptance

- `createBackgroundRunnerBridge()` 启动路径不再引用未定义局部，`apps/mv3-shell/test/manifest.spec.ts` 恢复为可信红线。
- 关键 MV3 bridge 源文件进入自动化门禁，至少能在提交前拦住未定义符号或等价级别的静态回归。
- `packages/core/test/core.spec.ts` 中与当前 locked decisions / cutover docs 冲突的断言被收口，绿色测试重新代表正确口径。
- 本 issue 完成后，`bun run test -- apps/mv3-shell/test/manifest.spec.ts packages/core/test/core.spec.ts` 与 `bun run typecheck` 必须同时通过。

## Impact Note

1. 影响 northbound surface：
   - 不改 public capability 行为；只修复 `mv3-shell` bridge 的负向分支稳定性和门禁可信度。
2. 影响消费者：
   - 聊天 Agent / Skill / 未来 UI 都受益于更可信的 MV3 bridge baseline，但不需要改调用面。
3. 文档同步：
   - 已检查；本次不改 public surface、cutover 判断和 bootstrap pack 描述，无需同步控制面文档。

## 工作总结

- 把 `tabs.navigate` 的坏输入分支改回统一 `invalidPageAutomation()`，去掉未定义局部引用，避免 bridge 在负向路径上直接抛 `ReferenceError`。
- 在 `apps/mv3-shell/test/manifest.spec.ts` 增加两条 `mv3 gate:` 红线测试，明确锁住 `tabs.navigate` 和 `page.screenshot` 的坏输入分支不会把 bridge 打崩。
- 在 `packages/core/test/core.spec.ts` 显式锁住 `tabs.navigate`、`page.press_key` 的 `exportable: false`，让测试口径与当前 locked decisions / cutover 文档保持一致。
- 把根 `typecheck` 扩成 `tsc --noEmit && bun run typecheck:mv3-bridge`，让 MV3 bridge 关键回归在提交前进入自动化门禁。
- 已执行检查：
  - `bun run test -- apps/mv3-shell/test/manifest.spec.ts packages/core/test/core.spec.ts`
  - `bun run typecheck`
- 残留风险：
  - 根 `typecheck` 仍不是全面 `checkJs`；当前采用的是更窄的 MV3 bridge regression gate，而不是全量 JS 静态类型收口。

## 相关 commits

- `187743b` `harden mv3 bridge baseline gates`
