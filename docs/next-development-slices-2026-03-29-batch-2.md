# Next Development Slices (2026-03-29)

Auto-generated from the current open backlog issues.

## Snapshot

- open issues: 7
- done issues: 15
- recommended batch: Batch 2

## Recommended Batch 2

### Lane: browser-vfs

- ISSUE-016 Review: BrowserVFS IndexedDB migration strategy is still implicit
  - priority: p1
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/browser-vfs/src/index.ts, packages/browser-vfs/test/browser-vfs.spec.ts

### Lane: contracts-core

- ISSUE-023 Review: memfs capability catalog misses BrowserVFS public ops
  - priority: p0
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/core/src/index.ts, packages/core/test/core.spec.ts, packages/skill-sdk/src/index.ts, packages/skill-sdk/test/skill-sdk.spec.ts
- ISSUE-019 Review: bridge-side MCP export is still descriptor-only
  - priority: p1
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/core/src/index.ts, packages/core/test/core.spec.ts, docs/

### Lane: mv3-shell

- ISSUE-021 Review: MV3 offscreen lifecycle is still optimistic
  - priority: p1
  - ready_now: yes
  - depends_on: (none)
  - write_scope: apps/mv3-shell/src/background.js, apps/mv3-shell/src/offscreen.js, apps/mv3-shell/test/manifest.spec.ts
- ISSUE-025 Review: runtime diagnostics/debug surface is still missing
  - priority: p1
  - ready_now: yes
  - depends_on: (none)
  - write_scope: apps/mv3-shell/src/background.js, apps/mv3-shell/src/offscreen.js, apps/mv3-shell/test/manifest.spec.ts
- ISSUE-026 Review: MV3 runtime wiring is still harness-bound
  - priority: p1
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/site-runtime/src/index.ts, packages/site-runtime/test/site-runtime.spec.ts, apps/mv3-shell/src/background.js, apps/mv3-shell/src/offscreen.js, apps/mv3-shell/test/manifest.spec.ts

### Lane: sdk-docs

- ISSUE-028 Review: skill lifecycle/version surface is still model-only
  - priority: p1
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/browser-vfs/src/index.ts, packages/skill-sdk/src/index.ts, docs/
