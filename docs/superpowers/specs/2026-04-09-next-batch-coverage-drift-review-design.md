# 2026-04-09 Next Batch Coverage + Drift Review Design

## Summary

This spec defines a lightweight planning pass for `browser-brain-loop-next` when the live queue is empty and the next step should be a review-first planning decision rather than immediate backlog mutation. The review should stay anchored on current workflow truth and mainline architecture truth, then produce a non-persistent recommendation set for the next backlog batch.

## Goal

Produce a planning review that answers three questions without mutating backlog records:

1. Which non-deferred modules currently have no live backlog coverage.
2. Which tracked modules still have meaningful delivery drift despite recent completed work.
3. Which next issues should be opened first to restore dispatchable work aligned with the repo mainline.

## Non-Goals

- Do not create or edit `docs/backlog/*.md`.
- Do not generate a new batch/planning markdown snapshot yet.
- Do not rebuild queue as the main outcome of the review; queue rebuild may be used only to confirm empty state.
- Do not scan every historical review doc unless current truth sources are insufficient.

## Inputs

The review should be grounded in these sources, in this order:

1. Workflow truth
   - `docs/workflow/live-queue.json`
   - `~/.codex/workflow-leases/browser-brain-loop-next.json`
2. Planning truth
   - `docs/module-tracking-ledger.json`
   - `docs/backlog/README.md`
3. Architecture truth
   - `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
   - `docs/kernel-skeleton-design.md`
4. Current execution signal
   - recently completed issues relevant to mainline modules
   - recent commits

## Review Method

### Phase 1: Coverage Review

For each non-deferred tracked module:

- determine whether it currently has live backlog coverage
- note whether the queue is empty because of true completion or missing issue coverage
- preserve module ordering semantics from `docs/module-tracking-ledger.json`

This phase should answer whether the repo is blocked by missing dispatch inventory.

### Phase 2: Drift Review

For modules with recent completed work or obvious mainline expectations:

- compare current module expectations against recent completed issues
- identify where implementation progress exists but no next executable slice remains
- distinguish between:
  - no remaining gap
  - remaining gap but missing issue coverage
  - issue coverage existed historically but no longer has an open live slice

This phase should stay focused on kernel-mainline and adjacent tracked modules first.

### Phase 3: Recommendation Set

Produce a proposed next-issue list without writing files.

Each recommendation should include:

- module
- proposed title
- tracking kind
- suggested priority
- suggested write scope
- short rationale for why it should be opened now

## Output Format

The review result should be presented in three sections:

1. `Coverage Review`
2. `Drift Review`
3. `Recommended Next Issues`

The output should be concise but specific enough that a follow-up pass can convert recommendations directly into backlog issues.

## Decision Rules

- Prefer mainline modules over secondary and deferred modules.
- Treat empty live queue plus empty active lease as planning mode, not completion proof.
- Use recovery report and kernel skeleton as the source for what still counts as mainline drift.
- Avoid promoting historical batch docs or comprehensive review docs to live truth.

## Success Criteria

This planning pass is successful if it:

- explains why the queue is empty in terms of module coverage rather than only command output
- identifies the most actionable missing issue coverage in mainline order
- gives a recommendation list that can be turned into backlog issues with minimal additional interpretation

## Risks And Constraints

- Historical docs may mention delivered slices that no longer imply live dispatchable work.
- A module may look partially implemented but still lack the next smallest executable slice.
- Recent completed issues can hide remaining integration or observability gaps if read too optimistically.

## Next Step After Approval

After user review and approval of this spec, execute the coverage + drift review and present the recommendation set. If the user then wants to persist the result, convert the recommended items into formal backlog issues and rebuild the live queue.
