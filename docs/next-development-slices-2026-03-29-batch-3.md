# Next Development Slices (2026-03-29 Batch 3)

Manual planning snapshot for the next claimable queue.

`workflow:claim:preview` is currently blocked because carry-over issues are still in progress and every remaining open issue is gated by dependency or write-scope conflict.

## Snapshot

- open issues: 3
- in-progress issues: 2
- done issues: 20
- claim preview: blocked
- batch theme: AI surface / product control plane

## Carry-Over Gates

### Lane: mv3-shell / site-runtime

- ISSUE-026 Review: MV3 runtime wiring is still harness-bound
  - status: in-progress
  - owner: codex
  - why first: gates ISSUE-030 and ISSUE-031
  - check_cmd: bun run check

### Lane: sdk-docs

- ISSUE-028 Review: skill lifecycle/version surface is still model-only
  - status: in-progress
  - owner: copilot-gpt54
  - why first: occupies `packages/contracts/src/index.ts` and `docs/`, so ISSUE-029 is not claimable
  - check_cmd: bun run check

## Batch 3 Queue

### Step 1: lock action-only boundary

- ISSUE-029 Review: action capability model still conflates full AI surface
  - lane: contracts-core
  - ready_when: ISSUE-028 lands
  - acceptance_ref: docs/ai-native-capability-surface-design.md
  - why next: aligns with AI surface Phase 1, so action/resource/workflow boundaries are explicit before new product surfaces land

### Step 2: ship bootstrap self-awareness

- ISSUE-030 Review: product self-awareness bootstrap surface is still missing
  - lane: mv3-shell
  - ready_when: ISSUE-026 lands
  - acceptance_ref: docs/ai-native-capability-surface-design.md
  - why next: aligns with AI surface Phase 2, adding `runtime/config/skills/hosts` summaries before more product actions expand

### Step 3: promote host control plane

- ISSUE-031 Review: execution host control plane is still missing
  - lane: mv3-shell
  - ready_when: ISSUE-026 lands and Batch 3 step 2 clears shared `packages/core` / MV3 write scope
  - acceptance_ref: docs/ai-native-capability-surface-design.md
  - why after ISSUE-030: the design orders bootstrap resources ahead of `hosts.*` control-plane expansion, and both slices share core/MV3/docs integration files

## Sequencing Notes

- No open issue is claimable right now:
  - ISSUE-029 is blocked by ISSUE-028 write-scope conflict
  - ISSUE-030 is blocked by ISSUE-026 dependency
  - ISSUE-031 is blocked by ISSUE-026 dependency
- Once the carry-over gates land, the recommended serial order is:
  - ISSUE-029 -> ISSUE-030 -> ISSUE-031
- No new review issue is needed for this batch; the current open set already covers the next architecture gaps.
