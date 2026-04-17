# Next Development Slices (2026-04-17)

Auto-generated from the current module ledger and live open backlog issues.

## Snapshot

- open issues: 6
- done issues: 150
- tracked modules: 10
- recommended batch: Batch 13
- provisional: no

## Mainline Modules

### Provider And Profile Routing (`provider-profile-routing`)

- stage: mainline
- status: partial
- default_parallel_group: contracts-core

- ISSUE-163 Follow-up: provider routing overrides still cannot be managed through shared control plane
  - tracking_kind: follow-up
  - priority: p1
  - parallel_group: contracts-core
  - ready_now: no
  - depends_on: ISSUE-159
  - write_scope: packages/contracts/src/index.ts, packages/kernel/src/llm-profile-resolver.ts, packages/kernel/src/kernel-facade.ts, docs/legacy-to-vnext-migration-matrix.md

### Observability And Audit (`observability-audit`)

- stage: mainline
- status: partial
- default_parallel_group: mv3-shell

- ISSUE-162 Follow-up: re-evaluate observability export after browser automation event sources stabilize
  - tracking_kind: follow-up
  - priority: p1
  - parallel_group: mv3-shell
  - ready_now: no
  - depends_on: ISSUE-161
  - write_scope: docs/module-tracking-ledger.json, docs/migration-parity-dashboard.md, packages/contracts/src/index.ts, packages/core/src/index.ts, apps/mv3-shell/src/background.ts

### Intervention And Handoff (`intervention-handoff`)

- stage: mainline
- status: partial
- default_parallel_group: site-runtime

- ISSUE-158 Review: intervention module status and cutover docs are stale after page-action handoff closure
  - tracking_kind: doc-debt
  - priority: p1
  - parallel_group: site-runtime
  - ready_now: yes
  - depends_on: (none)
  - write_scope: docs/cutover-readiness-criteria.md, docs/migration-parity-dashboard.md, docs/legacy-to-vnext-migration-matrix.md, docs/module-tracking-ledger.json


## Secondary Modules

### AI Surface Control Plane (`ai-surface-control-plane`)

- stage: secondary
- status: partial
- default_parallel_group: contracts-core

- ISSUE-159 Review: provider routing still lacks a shared control-plane update surface
  - tracking_kind: gap
  - priority: p1
  - parallel_group: contracts-core
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/core/src/index.ts, docs/ai-surface-index.md

### Site Runtime And Browser Automation (`site-runtime-browser-automation`)

- stage: secondary
- status: partial
- default_parallel_group: site-runtime

- ISSUE-161 Review: browser automation cutover docs are stale after page-action handoff closure
  - tracking_kind: doc-debt
  - priority: p1
  - parallel_group: site-runtime
  - ready_now: no
  - depends_on: ISSUE-158
  - write_scope: docs/cutover-readiness-criteria.md, docs/migration-parity-dashboard.md, docs/browser-automation-cutover-boundary.md, docs/module-tracking-ledger.json

### Execution Host And Bridge (`execution-host-bridge`)

- stage: secondary
- status: partial
- default_parallel_group: js-runner

- ISSUE-160 Review: local execution host cutover still lacks first-class exec parity
  - tracking_kind: gap
  - priority: p1
  - parallel_group: js-runner
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/js-runner/src/index.ts, apps/mv3-shell/src/offscreen.ts, apps/mv3-shell/src/runtime-services.ts, docs/migration-parity-dashboard.md, docs/legacy-to-vnext-migration-matrix.md

## Deferred Inside Batch

- ISSUE-163 waits on ISSUE-159
- ISSUE-162 waits on ISSUE-161
- ISSUE-161 waits on ISSUE-158
