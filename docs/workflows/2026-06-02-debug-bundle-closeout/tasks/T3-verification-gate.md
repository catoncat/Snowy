# T3: Run Focused Verification And Cutover Gate

## Objective

Refresh command evidence for the dirty debug bundle slice and distinguish current-slice failures from unrelated repo noise.

## Read

- `docs/workflows/2026-06-02-debug-bundle-closeout/README.md`
- `docs/workflows/2026-06-02-debug-bundle-closeout/operating-rules.md`
- `docs/workflows/2026-06-02-debug-bundle-closeout/milestone-plan.md`
- `package.json`
- relevant test files listed by current dirty diff

## Allowed Writes

- `docs/workflows/2026-06-02-debug-bundle-closeout/handoffs/T3-verification-gate.md`
- transient test/build artifacts normally produced by the commands

## Forbidden

- Product code edits.
- Root config/dependency/schema changes.
- Staging, commit, seal, push, PR, merge, release, or deploy.

## Required Proof

Run and record:

```bash
bun test apps/mv3-shell/test/runtime-chat.spec.ts
bun test apps/mv3-shell/test/manifest.spec.ts
bun test packages/kernel/test/llm-message-model.spec.ts packages/kernel/test/loop-engine.spec.ts packages/kernel/test/loop-orchestrator.spec.ts packages/kernel/test/prompt-builder.spec.ts
bun run typecheck
git diff --check
bun run check
bun run release:cutover:status
```

If any command fails, record:

- command
- exit status
- decisive error lines
- whether failure is inside current dirty slice
- next smallest fix or blocker

## Escalation

Stop if verification needs code changes or if command output indicates unrelated active work is blocking repo-wide gates.
