You are executing `2026-06-02-debug-bundle-closeout/T2`.

Use the codex-session-orchestrator skill and Mainline workflow.

Goal:
`2026-06-02-debug-bundle-closeout: T2 - audit dirty diff and Mainline overlaps`

First action:
Call `create_goal` with this objective.

Read:
- `/Users/envvar/work/repos/snowy/browser-brain-loop-next/docs/workflows/2026-06-02-debug-bundle-closeout/README.md`
- `/Users/envvar/work/repos/snowy/browser-brain-loop-next/docs/workflows/2026-06-02-debug-bundle-closeout/operating-rules.md`
- `/Users/envvar/work/repos/snowy/browser-brain-loop-next/docs/workflows/2026-06-02-debug-bundle-closeout/milestone-plan.md`
- `/Users/envvar/work/repos/snowy/browser-brain-loop-next/docs/workflows/2026-06-02-debug-bundle-closeout/tasks/T2-dirty-diff-mainline.md`

Allowed writes:
- `docs/workflows/2026-06-02-debug-bundle-closeout/handoffs/T2-dirty-diff-mainline.md`

Forbidden:
- product/docs edits outside the handoff
- staging, commit, seal, push, PR, merge, release, deploy
- reverting unknown dirty files

Required proof:
Classify dirty diff and Mainline overlaps using command evidence. Do not accept overlap status from memory alone.

Worktree/commit/seal:
Do not commit or seal. This is a read-only audit session plus handoff.

Handoff:
Write `docs/workflows/2026-06-02-debug-bundle-closeout/handoffs/T2-dirty-diff-mainline.md` with conclusion, grouped dirty files, overlap classification, proof commands/results, blockers, and next step.
