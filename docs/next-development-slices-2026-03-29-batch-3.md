# Next Development Slices (2026-03-29 Batch 3)

Manual planning snapshot for the next claimable queue.

`workflow:claim:preview` now resolves to the remaining Batch 3 slice directly.

## Snapshot

- open issues: 1
- in-progress issues: 0
- done issues: 24
- claim preview: ISSUE-031
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

## Batch 3 Queue

### Step 1: promote host control plane

- ISSUE-031 Review: execution host control plane is still missing
  - lane: mv3-shell
  - ready_now: yes
  - acceptance_ref: docs/ai-native-capability-surface-design.md
  - why now: bootstrap self-awareness is in place, so the remaining gap is turning host state from summary-only into a minimal `hosts.*` control plane

## Sequencing Notes

- Current next claim is:
  - ISSUE-031
- No new review issue is needed for this batch; the current open set already covers the next architecture gaps.
