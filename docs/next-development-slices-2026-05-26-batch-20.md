# Next Development Slices (2026-05-26)

Auto-generated from the current module ledger and live open backlog issues.

## Snapshot

- open issues: 1
- done issues: 173
- tracked modules: 12
- recommended batch: Batch 20
- provisional: no

## North Star Check

The current target is still browser plugin refactor completion, not infinite gap harvesting. `ISSUE-172` through `ISSUE-180` proved a shared package-backed Skill loop for install, update, invoke, rollback, summary, and audit. The next gap that still changes the product completion state is event-driven legacy plugin behavior: old external plugins were hook subscribers, while the current vNext proof is still mostly explicit `skills.invoke`.

## Batch Retrospective

Batch 19 / `ISSUE-180` moved Skill Studio from hidden package convention to a shared author/update path. That closes the synthetic authoring/update chain, but it does not migrate a real old plugin behavior that fires automatically from runtime events.

## Rot / Freshness Review

`docs/agent-bootstrap-context-pack.md` and the migration docs still mention incomplete Skill Studio breadth and legacy plugin ecosystem migration. After `ISSUE-180`, the stale part is not manual package authoring anymore; the remaining meaningful old-product gap is event/hook semantics. This batch keeps that as one integrated milestone instead of splitting hook names, manifest fields, and audit records into separate tickets.

## Recommended Next Milestone

Migrate one real old hook-driven plugin behavior, using `send-success-global-message` as the pilot, into an executable Skill event/subscription path:

- package manifest declares the subscription
- shared summary/bootstrap exposes it
- enabled package-backed Skill receives a representative runtime event through JS runner
- evidence is visible through shared audit/observability resources

## Not Now

- Full old plugin ecosystem bulk migration
- Full hook API compatibility matrix
- Rich Studio editor polish, diff/preview, and version selection UI
- Reintroducing `Plugin` as a product concept

## Mainline Modules

### Old Product Replacement Loop (`old-product-replacement-loop`)

- stage: mainline
- status: shipped
- default_parallel_group: mv3-shell

- ISSUE-181 Completion milestone: legacy plugin event hooks have no Skill event subscription path
  - tracking_kind: mainline
  - priority: p0
  - parallel_group: mv3-shell
  - ready_now: yes
  - depends_on: (none)
  - write_scope: packages/contracts/src/index.ts, packages/contracts/test/contracts.spec.ts, packages/core/src/index.ts, packages/core/test/core.spec.ts, apps/mv3-shell/src/runtime-services.ts, apps/mv3-shell/src/background.ts, apps/mv3-shell/test/manifest.spec.ts, docs/skill-package-convention.md, docs/ai-surface-index.md, docs/legacy-to-vnext-migration-matrix.md, docs/migration-parity-dashboard.md, docs/cutover-readiness-criteria.md, docs/agent-bootstrap-context-pack.md
