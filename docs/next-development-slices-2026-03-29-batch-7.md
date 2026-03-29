# Next Development Slices (2026-03-29 Batch 7)

Manual planning snapshot after the recovery report and kernel skeleton realignment.

## Snapshot

- open issues: 19
- in-progress issues: 0
- done issues: 28
- claim preview target: ISSUE-051
- batch theme: browser-side kernel mainline first, operability and substrate second

## Recommended Batch 7

### Lane: kernel

- ISSUE-051 Kernel B-1: contracts + session store skeleton
  - priority: p0
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/contracts/test/contracts.spec.ts, packages/kernel/src/, packages/kernel/test/, docs/
- ISSUE-052 Kernel B-2: run controller + loop engine skeleton
  - priority: p0
  - ready_now: no
  - depends_on: ISSUE-051
  - write_scope: packages/kernel/src/, packages/kernel/test/, docs/
- ISSUE-053 Kernel B-3: compaction manager + kernel facade
  - priority: p0
  - ready_now: no
  - depends_on: ISSUE-052
  - write_scope: packages/kernel/src/, packages/kernel/test/, packages/core/src/index.ts, packages/core/test/core.spec.ts, docs/

### Secondary Queue: mv3-shell

- ISSUE-033 Review: runtime diagnostics is still bridge-only and not part of the public control plane
  - priority: p1
  - ready_now: yes
  - depends_on: ISSUE-032
- ISSUE-042 Review: audit tail is still missing for host control plane changes
  - priority: p1
  - ready_now: no
  - depends_on: ISSUE-033
- ISSUE-043 Review: runtime error lifecycle is still read-only and lacks clear-error closure
  - priority: p1
  - ready_now: no
  - depends_on: ISSUE-042

### Secondary Queue: site-runtime

- ISSUE-036 Review: browser automation cutover boundary is still undefined
  - priority: p1
  - ready_now: yes
  - depends_on: (none)
- ISSUE-045 Review: Site Runtime 与 Capability Routing 桥接策略未定义
  - priority: p1
  - ready_now: yes
  - depends_on: (none)

### Secondary Queue: js-runner

- ISSUE-038 Review: real local execution host adapter is still missing
  - priority: p1
  - ready_now: yes
  - depends_on: ISSUE-035

## Sequencing Notes

- 这不是否定 batch 6；而是把 repo 主线从 substrate follow-up 切回 browser-side kernel。
- `workflow:claim:preview` 在 live backlog frontmatter 同步后，应先返回 `ISSUE-051`。
- `ISSUE-052` / `ISSUE-053` 是显式链式切片，避免 kernel mainline 再次变成隐性大任务。
- batch 6 的 operability / browser automation / host adapter 队列继续保留，但默认作为 kernel 主线之后的次级队列。
