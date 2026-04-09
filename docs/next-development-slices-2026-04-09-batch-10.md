# Next Development Slices (2026-04-09)

Auto-generated from the current module ledger and live open backlog issues.

## Snapshot

- open issues: 10
- done issues: 95
- tracked modules: 10
- recommended batch: Batch 10

## Mainline Modules

### Browser-side Kernel (`kernel`)

- stage: mainline
- status: partial
- default_parallel_group: kernel

- ISSUE-103 Loop orchestrator 自动 compaction 集成
  - tracking_kind: mainline
  - priority: p0
  - parallel_group: kernel
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/kernel/src/loop-orchestrator.ts, packages/kernel/src/kernel-facade.ts, packages/kernel/test/loop-orchestrator.spec.ts, packages/kernel/test/kernel-facade.spec.ts

### Provider And Profile Routing (`provider-profile-routing`)

- stage: mainline
- status: in-progress
- default_parallel_group: contracts-core

- ISSUE-111 Provider health 可观测与 capability negotiation
  - tracking_kind: gap
  - priority: p1
  - parallel_group: kernel
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/kernel/src/llm-provider-registry.ts, packages/kernel/src/llm-profile-resolver.ts, packages/kernel/test/llm-provider-registry.spec.ts, packages/kernel/test/llm-profile-resolver.spec.ts

### Observability And Audit (`observability-audit`)

- stage: mainline
- status: partial
- default_parallel_group: mv3-shell

- ISSUE-104 Diagnostics capture payload 结构定义与实现
  - tracking_kind: gap
  - priority: p0
  - parallel_group: kernel
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/kernel/src/kernel-facade.ts, packages/core/src/index.ts, packages/kernel/test/kernel-facade.spec.ts
- ISSUE-105 Audit event store 持久化与 retention 策略
  - tracking_kind: gap
  - priority: p1
  - parallel_group: mv3-shell
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/core/src/index.ts, apps/mv3-shell/src/background.js, packages/core/test/core.spec.ts

### Intervention And Handoff (`intervention-handoff`)

- stage: mainline
- status: partial
- default_parallel_group: site-runtime

- ISSUE-112 Loop 内 policy-driven 自动 intervention 触发
  - tracking_kind: gap
  - priority: p1
  - parallel_group: kernel
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/kernel/src/loop-orchestrator.ts, packages/kernel/src/intervention-controller.ts, packages/kernel/test/loop-orchestrator.spec.ts, packages/kernel/test/intervention-controller.spec.ts


## Secondary Modules

### AI Surface Control Plane (`ai-surface-control-plane`)

- stage: secondary
- status: partial
- default_parallel_group: contracts-core

- ISSUE-106 Config control plane 持久化
  - tracking_kind: gap
  - priority: p1
  - parallel_group: contracts-core
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/core/src/index.ts, apps/mv3-shell/src/background.js, packages/core/test/core.spec.ts
- ISSUE-109 Sidepanel chat 富文本渲染与 tool call 可视化
  - tracking_kind: gap
  - priority: p2
  - parallel_group: mv3-shell
  - ready_now: yes
  - depends_on: (none)
  - write_scope: apps/mv3-shell/src/sidepanel/, apps/mv3-shell/test/

### Site Runtime And Browser Automation (`site-runtime-browser-automation`)

- stage: secondary
- status: partial
- default_parallel_group: site-runtime

- ISSUE-110 Background automation mode 基础设施
  - tracking_kind: gap
  - priority: p2
  - parallel_group: site-runtime
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/site-runtime/src/, apps/mv3-shell/src/background.js, apps/mv3-shell/src/page-hook.js, packages/site-runtime/test/

### Execution Host And Bridge (`execution-host-bridge`)

- stage: secondary
- status: partial
- default_parallel_group: js-runner

- ISSUE-108 JS Runner 执行引擎实现
  - tracking_kind: gap
  - priority: p1
  - parallel_group: js-runner
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/js-runner/src/, apps/mv3-shell/src/offscreen.js, packages/js-runner/test/


## Deferred Modules

### Repo Workflow And DX (`repo-workflow-dx`)

- stage: deferred
- status: partial
- default_parallel_group: sdk-docs

- ISSUE-107 Module tracking ledger 状态刷新
  - tracking_kind: doc-debt
  - priority: p1
  - parallel_group: sdk-docs
  - ready_now: yes
  - depends_on: (none)
  - write_scope: docs/module-tracking-ledger.json, docs/kernel-skeleton-design.md
