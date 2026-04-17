# Next Development Slices (2026-04-16)

Auto-generated from the current module ledger and live open backlog issues.

## Snapshot

- open issues: 6
- done issues: 142
- tracked modules: 10
- recommended batch: Batch 12
- provisional: no

## Mainline Modules

### Provider And Profile Routing (`provider-profile-routing`)

- stage: mainline
- status: partial
- default_parallel_group: contracts-core

- ISSUE-150 Review: provider policy taxonomy is still kernel-local
  - tracking_kind: gap
  - priority: p1
  - parallel_group: contracts-core
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/kernel/src/llm-profile-resolver.ts, packages/kernel/src/llm-kernel-adapter.ts, packages/kernel/src/kernel-facade.ts, packages/kernel/test

### Observability And Audit (`observability-audit`)

- stage: mainline
- status: partial
- default_parallel_group: mv3-shell

- ISSUE-151 Review: observability replay still lacks cross-subsystem chronology
  - tracking_kind: gap
  - priority: p1
  - parallel_group: mv3-shell
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/core/src/index.ts, apps/mv3-shell/src/background.ts, packages/core/test, apps/mv3-shell/test

### Intervention And Handoff (`intervention-handoff`)

- stage: mainline
- status: partial
- default_parallel_group: site-runtime

- ISSUE-152 Review: intervention handoff is still not wired into page action failures
  - tracking_kind: gap
  - priority: p1
  - parallel_group: site-runtime
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/core/src/index.ts, packages/site-runtime/src/index.ts, packages/site-runtime/test


## Secondary Modules

### AI Surface Control Plane (`ai-surface-control-plane`)

- stage: secondary
- status: partial
- default_parallel_group: contracts-core

- ISSUE-153 Review: action projection controls are still missing from AI surface
  - tracking_kind: gap
  - priority: p1
  - parallel_group: contracts-core
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/core/src/index.ts, packages/core/test, docs/ai-surface-index.md

### Site Runtime And Browser Automation (`site-runtime-browser-automation`)

- stage: secondary
- status: partial
- default_parallel_group: site-runtime

- ISSUE-154 Review: page.query/click/fill production path is still not closed
  - tracking_kind: gap
  - priority: p1
  - parallel_group: site-runtime
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/site-runtime/src/index.ts, packages/site-runtime/test/site-runtime.spec.ts, apps/mv3-shell/src/background.ts, apps/mv3-shell/src/page-hook.ts, apps/mv3-shell/test/manifest.spec.ts

### Execution Host And Bridge (`execution-host-bridge`)

- stage: secondary
- status: partial
- default_parallel_group: js-runner

- ISSUE-155 Review: execution host control plane still lacks multi-remote host records
  - tracking_kind: gap
  - priority: p1
  - parallel_group: js-runner
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/js-runner/src/index.ts, apps/mv3-shell/src/offscreen.ts, apps/mv3-shell/src/background.ts, apps/mv3-shell/src/runtime-services.ts, apps/mv3-shell/test/manifest.spec.ts
