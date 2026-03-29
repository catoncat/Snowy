# Next Development Slices (2026-03-29 Batch 6)

Manual planning snapshot for the queue after `ISSUE-035`.

## Snapshot

- open issues: 9
- in-progress issues: 0
- done issues: 28
- claim preview: ISSUE-033
- batch theme: operability + automation cutover + real local host adapter

## Recommended Batch 6

### Lane: mv3-shell

- ISSUE-033 Review: runtime diagnostics is still bridge-only and not part of the public control plane
  - priority: p1
  - ready_now: yes
  - depends_on: ISSUE-032
  - write_scope: packages/contracts/src/index.ts, packages/contracts/test/contracts.spec.ts, packages/core/src/index.ts, packages/core/test/core.spec.ts, apps/mv3-shell/src/background.js, apps/mv3-shell/test/manifest.spec.ts, docs/
- ISSUE-042 Review: audit tail is still missing for host control plane changes
  - priority: p1
  - ready_now: no
  - depends_on: ISSUE-033
  - write_scope: apps/mv3-shell/src/background.js, apps/mv3-shell/test/manifest.spec.ts, docs/
- ISSUE-043 Review: runtime error lifecycle is still read-only and lacks clear-error closure
  - priority: p1
  - ready_now: no
  - depends_on: ISSUE-042
  - write_scope: packages/contracts/src/index.ts, packages/contracts/test/contracts.spec.ts, packages/core/src/index.ts, packages/core/test/core.spec.ts, apps/mv3-shell/src/background.js, apps/mv3-shell/test/manifest.spec.ts, docs/

### Lane: js-runner

- ISSUE-038 Review: real local execution host adapter is still missing
  - priority: p1
  - ready_now: yes
  - depends_on: ISSUE-035
  - write_scope: packages/js-runner/src/index.ts, packages/js-runner/src/runner-host-core.js, packages/js-runner/test/js-runner.spec.ts, apps/mv3-shell/src/runner-host-core.js, apps/mv3-shell/src/offscreen.js, apps/mv3-shell/src/local-host-adapter.js, apps/mv3-shell/test/manifest.spec.ts, docs/

### Lane: site-runtime

- ISSUE-036 Review: browser automation cutover boundary is still undefined
  - priority: p1
  - ready_now: yes
  - depends_on: (none)
  - write_scope: docs/, packages/contracts/src/index.ts, packages/core/src/index.ts, packages/site-runtime/src/index.ts, packages/site-runtime/test/site-runtime.spec.ts
- ISSUE-037 Review: page and tabs public automation path is still underdefined
  - priority: p1
  - ready_now: no
  - depends_on: ISSUE-036
  - write_scope: docs/, packages/contracts/src/index.ts, packages/core/src/index.ts, packages/site-runtime/src/index.ts, packages/site-runtime/test/site-runtime.spec.ts
- ISSUE-039 Review: background automation mode and failure tracking are still unscoped
  - priority: p1
  - ready_now: no
  - depends_on: ISSUE-036
  - write_scope: docs/, packages/site-runtime/src/index.ts, packages/site-runtime/test/site-runtime.spec.ts, apps/mv3-shell/src/background.js
- ISSUE-040 Review: screenshot and download surfaces are still unscoped
  - priority: p1
  - ready_now: no
  - depends_on: ISSUE-036
  - write_scope: docs/, packages/contracts/src/index.ts, packages/core/src/index.ts, packages/site-runtime/src/index.ts
- ISSUE-041 Review: intervention and human handoff surface is still undecided
  - priority: p1
  - ready_now: no
  - depends_on: ISSUE-036
  - write_scope: docs/, packages/contracts/src/index.ts, packages/core/src/index.ts, packages/site-runtime/src/index.ts

## Sequencing Notes

- `BBL_AGENT_NAME=<agent-name> bun run workflow:claim:preview` currently returns `ISSUE-033`.
- 当前可直接领取的 queue 有 `ISSUE-033`、`ISSUE-036`、`ISSUE-038`；auto-claim 会按优先级、创建时间和 issue id 选择 `ISSUE-033`。
- `ISSUE-042` / `ISSUE-043` 是 operability follow-up，必须等 `ISSUE-033` 收口后再进入 claim queue。
- site-runtime 的 follow-up 先由 `ISSUE-036` 定 cutover boundary，再进入 `ISSUE-037`、`ISSUE-039`、`ISSUE-040`、`ISSUE-041`。
