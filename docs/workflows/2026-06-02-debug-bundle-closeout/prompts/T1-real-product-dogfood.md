You are executing `2026-06-02-debug-bundle-closeout/T1`.

Use the codex-session-orchestrator skill.

Goal:
`2026-06-02-debug-bundle-closeout: T1 - verify real product debug bundle dogfood`

First action:
Call `create_goal` with this objective.

Read:
- `/Users/envvar/work/repos/snowy/browser-brain-loop-next/docs/workflows/2026-06-02-debug-bundle-closeout/README.md`
- `/Users/envvar/work/repos/snowy/browser-brain-loop-next/docs/workflows/2026-06-02-debug-bundle-closeout/operating-rules.md`
- `/Users/envvar/work/repos/snowy/browser-brain-loop-next/docs/workflows/2026-06-02-debug-bundle-closeout/milestone-plan.md`
- `/Users/envvar/work/repos/snowy/browser-brain-loop-next/docs/workflows/2026-06-02-debug-bundle-closeout/tasks/T1-real-product-dogfood.md`

Allowed writes:
- `.ml-cache/dogfood/**`
- `docs/workflows/2026-06-02-debug-bundle-closeout/handoffs/T1-real-product-dogfood.md`

Forbidden:
- product code edits
- external visible actions
- reading cookies/localStorage/profile secrets/passwords/tokens
- push, PR, merge, release, deploy

Required proof:
Artifact path and evidence for diagnostics -> debug_bundle -> final response, or exact blocker.

Worktree/commit/seal:
Do not commit or seal. This is an evidence session only.

Handoff:
Write `docs/workflows/2026-06-02-debug-bundle-closeout/handoffs/T1-real-product-dogfood.md` with conclusion, files read/changed, proof commands/results, blockers, and next step.
