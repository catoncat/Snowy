# Next Development Slices (2026-03-29 Batch 5)

Batch 5 已在 `ISSUE-035` 收口。

## Batch 5 Outcome

- `ISSUE-035` 已完成：shared runner host core 现在会把 `host.read/write/edit/exec` 路由到显式 host-adapter 分支，不再落到 unknown runner request。
- 默认 offscreen/local host 目前仍没有真实 adapter，但默认 `createHost` 路径已改为返回结构化 `adapter_missing` error，并有测试覆盖。
- 剩余 local adapter 实现已拆到 `ISSUE-038`。
- 后续 open queue 先转到 `docs/next-development-slices-2026-03-29-batch-6.md`。
- 经过 recovery report + kernel skeleton 重新定性后，当前主线已切到 `docs/next-development-slices-2026-03-29-batch-7.md`。
- Batch 7 已收口，当前主线切到 `docs/next-development-slices-2026-03-29-batch-8.md`。
- Batch 8 之后补入插件主线纠偏与 module coverage follow-up，当前主线切到 `docs/next-development-slices-2026-03-29-batch-9.md`。
- 下一次领取请回到 live backlog frontmatter，并运行 `BBL_AGENT_NAME=<agent-name> bun run workflow:claim:preview`。

## Historical Scope

- lane: `js-runner`
- acceptance_ref: `docs/ai-native-capability-surface-design.md`
- write_scope: `packages/js-runner/src/index.ts`, `packages/js-runner/src/runner-host-core.js`, `packages/js-runner/test/js-runner.spec.ts`, `apps/mv3-shell/src/runner-host-core.js`, `apps/mv3-shell/src/offscreen.js`, `apps/mv3-shell/test/manifest.spec.ts`, `docs/`
