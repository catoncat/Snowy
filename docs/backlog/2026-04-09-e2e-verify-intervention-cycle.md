---
id: ISSUE-098
title: "End-to-end test: verify → intervention → resolution cycle"
status: done
priority: p1
source: "next-batch planning 2026-04-09"
created: 2026-04-09
assignee: codex-019d700e
completed_at: 2026-04-09T02:37:53Z
tags:
  - intervention
  - verify
  - integration-test
  - e2e
module_id: intervention-handoff
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-intervention
parallel_group: site-runtime
depends_on: []
write_scope:
  - apps/mv3-shell/test/runtime-chat.spec.ts
  - packages/kernel/test/loop-orchestrator.spec.ts
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: "bunx vitest run apps/mv3-shell/test/runtime-chat.spec.ts packages/kernel/test/loop-orchestrator.spec.ts"
---

## Goal

Add integration tests that exercise the full verify → intervention request → side panel notification → resolution → loop continuation cycle. This validates Soft Gate 3 and ensures the intervention handoff chain works end-to-end.

## Scope

1. Test in loop-orchestrator: LLM tool call → site step with verifier → intervention requested → resolution applied → loop continues
2. Test in mv3-shell: intervention.list / intervention.resolve message routing with kernel integration
3. Test intervention timeout and cancellation paths
4. Test intervention persistence across session rehydration

## Acceptance

- At least one test exercises: tool call → verify failure → intervention request → resolution → next loop turn
- Intervention timeout produces a terminal loop status
- Intervention resolution allows the loop to continue
- Tests pass in both kernel and mv3-shell test suites

## 工作总结

### 实现了什么

- 在 `packages/kernel/test/loop-orchestrator.spec.ts` 补齐 verify failed → intervention request / resolve → loop continuation 的端到端测试。
- 在 `apps/mv3-shell/test/runtime-chat.spec.ts` 补齐 intervention.list / resolve、cancel / timeout、以及 runtime service restart 后 rehydrate 的桥接测试。
- 用稳定的 runtime/chat 测试夹具覆盖 active-tab 解析与 page hook verify 路径，锁住 Soft Gate 3 所需的 intervention handoff 主链。

### 实际跑了什么检查

- `bunx vitest run apps/mv3-shell/test/runtime-chat.spec.ts packages/kernel/test/loop-orchestrator.spec.ts`
- `./node_modules/.bin/biome check apps/mv3-shell/test/runtime-chat.spec.ts packages/kernel/test/loop-orchestrator.spec.ts`

### 残留风险

- 无。原 `workflow:done` 对非 `cli:<agent>` session lease 的兼容问题已由后续 workflow 修复收口，不再影响当前 issue。

## 相关 commits

- `0eae3200c7fc` `fix(test): fix intervention bridge tests from codex review`
