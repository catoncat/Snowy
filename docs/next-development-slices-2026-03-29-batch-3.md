# Next Development Slices (2026-03-29 Batch 3)

Manual planning snapshot for the next claimable queue.

`workflow:claim:preview` now resolves to the remaining Batch 3 slice directly.

## Snapshot

- open issues: 1
- in-progress issues: 0
- done issues: 25
- claim preview: ISSUE-032
- batch theme: AI surface / product control plane

## Completed Gates

- ISSUE-026 Review: MV3 runtime wiring is still harness-bound
  - status: done
- ISSUE-028 Review: skill lifecycle/version surface is still model-only
  - status: done
- ISSUE-029 Review: action capability model still conflates full AI surface
  - status: done
- ISSUE-030 Review: product self-awareness bootstrap surface is still missing
  - status: done
- ISSUE-031 Review: execution host control plane is still missing
  - status: done

## Batch 3 Queue

### Step 1: promote host control plane

- ISSUE-031 Review: execution host control plane is still missing
  - status: done
  - outcome: minimal local `hosts.*` control plane is now implemented and tested

### Step 2: close the remaining host substrate gap

- ISSUE-032 Review: host substrate still lacks default routing and file primitives
  - lane: mv3-shell
  - ready_now: yes
  - acceptance_ref: docs/ai-native-capability-surface-design.md
  - why now: `hosts.*` control plane 已落地，但 `host.*` 仍是 `exec`-only，默认 host 也还没进入 substrate 路由

## Sequencing Notes

- Current next claim is:
  - ISSUE-032
- `ISSUE-032` 是关闭 `ISSUE-031` 时拆出的直接 follow-up。
