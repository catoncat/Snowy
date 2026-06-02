# T4: Integrate Proof, Commit, And Seal If Allowed

Owner: orchestrator

## Objective

After T1-T3 are verified, stage only the coherent debug bundle closeout files, create a scoped commit, append Mainline evidence, and seal the active intent if preflight allows.

## Preconditions

- T1 is verified or explicitly deferred with a blocker.
- T2 says the dirty diff is coherent or lists exact exclusions.
- T3 records focused verification and final gate results.
- `mainline preflight --json` no longer has unclassified overlaps.

## Allowed Writes

- Mainline metadata.
- Git index/commit for scoped verified files.
- workflow state/registry updates.

## Forbidden

- push
- PR
- merge
- release/deploy
- staging files outside the verified scope

## Required Proof

- `git status --short --branch`
- `git diff --cached --stat`
- commit hash
- `mainline append` summary
- `mainline seal --prepare --json`
- `mainline seal --submit --json` result, if allowed
