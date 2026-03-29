# Next Development Slices (2026-03-29 Batch 5)

Current next-claim snapshot after `ISSUE-032` and `ISSUE-034` closed.

## Snapshot

- open issues: 1
- in-progress issues: 0
- done issues: 27
- recommended batch: Batch 5
- claim preview: ISSUE-035

## Recommended Batch 5

### Lane: js-runner

- ISSUE-035 Review: offscreen execution host is still contract-only
  - priority: p1
  - ready_now: yes
  - depends_on: ISSUE-032
  - acceptance_ref: docs/ai-native-capability-surface-design.md
  - why now: `ISSUE-032` 已把 host substrate contract 与 default routing 收口，但默认 offscreen local host 仍会落到 contract-only runner path
  - write_scope: packages/js-runner/src/index.ts, packages/js-runner/src/runner-host-core.js, packages/js-runner/test/js-runner.spec.ts, apps/mv3-shell/src/runner-host-core.js, apps/mv3-shell/src/offscreen.js, apps/mv3-shell/test/manifest.spec.ts, docs/
