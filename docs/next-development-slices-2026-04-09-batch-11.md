# Next Development Slices (2026-04-09)

Auto-generated from the current module ledger and live open backlog issues.

## Snapshot

- open issues: 7
- done issues: 105
- tracked modules: 10
- recommended batch: Batch 11

## Mainline Modules

### Browser-side Kernel (`kernel`)

- stage: mainline
- status: partial
- default_parallel_group: kernel

- ISSUE-113 Review: kernel subagent run semantics are still undefined
  - tracking_kind: gap
  - priority: p1
  - parallel_group: kernel
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/kernel/src/kernel-facade.ts, packages/kernel/src/run-controller.ts, packages/kernel/src/loop-orchestrator.ts, packages/kernel/test

### Provider And Profile Routing (`provider-profile-routing`)

- stage: mainline
- status: partial
- default_parallel_group: contracts-core

- ISSUE-114 Review: provider/profile escalation and per-lane routing remain underdefined
  - tracking_kind: gap
  - priority: p1
  - parallel_group: contracts-core
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/kernel/src/llm-profile-resolver.ts, packages/kernel/src/llm-kernel-adapter.ts, packages/kernel/test

### Observability And Audit (`observability-audit`)

- stage: mainline
- status: partial
- default_parallel_group: mv3-shell

- ISSUE-115 Review: runtime history and debug export boundary is still incomplete
  - tracking_kind: gap
  - priority: p1
  - parallel_group: mv3-shell
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/core/src/index.ts, apps/mv3-shell/src/background.ts, apps/mv3-shell/src/sidepanel/management.ts, apps/mv3-shell/test

### Intervention And Handoff (`intervention-handoff`)

- stage: mainline
- status: partial
- default_parallel_group: site-runtime

- ISSUE-116 Review: intervention control-plane actions are still background-private
  - tracking_kind: gap
  - priority: p1
  - parallel_group: site-runtime
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/core/src/index.ts, apps/mv3-shell/src/background.ts, apps/mv3-shell/src/runtime-services.ts, apps/mv3-shell/test


## Secondary Modules

### AI Surface Control Plane (`ai-surface-control-plane`)

- stage: secondary
- status: partial
- default_parallel_group: contracts-core

- ISSUE-117 Review: sidepanel management still hard-codes an app-local AI surface subset
  - tracking_kind: gap
  - priority: p1
  - parallel_group: contracts-core
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/core/src/index.ts, apps/mv3-shell/src/sidepanel-management-contract.ts, apps/mv3-shell/src/sidepanel/management.ts, apps/mv3-shell/test

### Site Runtime And Browser Automation (`site-runtime-browser-automation`)

- stage: secondary
- status: partial
- default_parallel_group: site-runtime

- ISSUE-118 Review: background automation lane still lacks stabilization and failure-tracking scope
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

- ISSUE-119 Review: execution host control plane still assumes a single local/offscreen host
  - tracking_kind: gap
  - priority: p1
  - parallel_group: js-runner
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/js-runner/src/index.ts, apps/mv3-shell/src/offscreen.ts, apps/mv3-shell/src/background.ts, apps/mv3-shell/src/runtime-services.ts, apps/mv3-shell/test/manifest.spec.ts
