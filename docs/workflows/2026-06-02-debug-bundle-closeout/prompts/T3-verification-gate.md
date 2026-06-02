You are executing `2026-06-02-debug-bundle-closeout/T3`.

Use the codex-session-orchestrator skill.

Goal:
`2026-06-02-debug-bundle-closeout: T3 - run focused verification and cutover gate`

First action:
Call `create_goal` with this objective.

Read:
- `/Users/envvar/work/repos/snowy/browser-brain-loop-next/docs/workflows/2026-06-02-debug-bundle-closeout/README.md`
- `/Users/envvar/work/repos/snowy/browser-brain-loop-next/docs/workflows/2026-06-02-debug-bundle-closeout/operating-rules.md`
- `/Users/envvar/work/repos/snowy/browser-brain-loop-next/docs/workflows/2026-06-02-debug-bundle-closeout/milestone-plan.md`
- `/Users/envvar/work/repos/snowy/browser-brain-loop-next/docs/workflows/2026-06-02-debug-bundle-closeout/tasks/T3-verification-gate.md`

Allowed writes:
- `docs/workflows/2026-06-02-debug-bundle-closeout/handoffs/T3-verification-gate.md`
- transient test/build artifacts normally produced by commands

Forbidden:
- product code edits
- root config/dependency/schema changes
- staging, commit, seal, push, PR, merge, release, deploy

Required proof:
Run the commands listed in the task file and record exact pass/fail status with decisive output. If a command is too slow or blocked, report why and what evidence is missing.

Worktree/commit/seal:
Do not commit or seal. This is a verification session only.

Handoff:
Write `docs/workflows/2026-06-02-debug-bundle-closeout/handoffs/T3-verification-gate.md` with conclusion, command results, blockers, and next step.
