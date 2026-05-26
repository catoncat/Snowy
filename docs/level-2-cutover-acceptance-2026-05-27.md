# Level 2 Cutover Acceptance Pack

> date: 2026-05-27
> status: repo-side gate evidence complete; external release acceptance pending
> scope: browser-brain-loop-next as replacement candidate for the old browser plugin mainline

## Decision Summary

The repository now has current repo-side evidence for Level 2 cutover readiness. The old-product replacement proof is no longer missing a representative executable Skill path: `ISSUE-172` through `ISSUE-181` cover install, package persistence, restart discovery, package execution, shared discoverability, visible management, rollback, author/update, runtime event subscription, and audit evidence. `ISSUE-184` adds the release-facing real Chromium MV3 proof: package handlers execute in a sandbox runner instead of `unsafe-eval`, and sandboxed handlers can call back into the shared capability path.

This document does not approve a product release or switch the old mainline by itself. The representative UAT readout is captured in `docs/level-2-uat-scenario-2026-05-27.md`. The remaining decision is external release acceptance: either accept this proof pack as the Level 2 cutover basis, request another concrete UAT scenario, or explicitly promote one deferred breadth item into the current milestone.

## Gate Evidence

| Gate | Status | Evidence |
|---|---|---|
| Gate A: Contract / Runtime Correctness | satisfied | `CapabilityDescriptor`, action projection, ctx permissions, trace, nested invoke, skill lifecycle, package action catalog, and event subscription summaries are covered by `packages/contracts/test/contracts.spec.ts` and `packages/core/test/core.spec.ts`; latest related implementation commits include `da6333b`, `e5cd727`, and `fd53473`. |
| Gate B: BrowserVFS Correctness | satisfied | BrowserVFS baseline and canonical `mem://skills/<skillId>/...` behavior are established; `ISSUE-173` / `04c9986` proves `skills.install` setup plans materialize package files into the canonical package root and survive restart readback. |
| Gate C: JS Runner + MV3 Host Correctness | satisfied | JS Runner and MV3 offscreen bridge remain the execution path for package handlers; `ISSUE-174` / `4e14beb` proves installed `skill.json` + `handler.js` registration and invocation through the runner path, and `ISSUE-184` proves the same release UAT path works in real Chromium MV3 CSP by executing dynamic package code in a sandbox page rather than an extension page. |
| Gate D: Site Runtime Minimum Production Path | satisfied | Active-tab Tier 1 automation is sufficient for cutover; `ISSUE-172` / `da6333b` proves an executable Skill can invoke real `tabs.get_active` through the shared MV3 runtime and leave audit evidence. |
| Gate E: Migration Control Plane Exists | satisfied | `docs/legacy-to-vnext-migration-matrix.md`, `docs/migration-parity-dashboard.md`, `docs/cutover-readiness-criteria.md`, and `docs/module-tracking-ledger.json` distinguish shipped cutover-critical proof from deferred breadth. |
| Gate F: Operability | satisfied | `audit.tail`, runtime diagnostics, intervention/audit resources, and observability read surfaces are landed; `ISSUE-172` through `ISSUE-184` rely on vNext audit/runtime evidence rather than old-repo diagnostics, including real Chromium `audit.tail` readback for `skills.invoke` and sandboxed `memfs.read`. |
| Gate G: Product Self-Awareness Surface | satisfied | `runtime.summary`, `config.summary`, `skills.summary`, `hosts.summary`, and `runtime.bootstrap` expose shared state; `ISSUE-175`, `ISSUE-176`, `ISSUE-178`, `ISSUE-179`, `ISSUE-180`, and `ISSUE-181` extend that surface through package catalog, sidepanel catalog, version/rollback readiness, update/rollback actions, and event subscriptions. |

## Representative Product Loop

The current replacement loop is:

```text
skills.install setupPlan
→ mem://skills package files
→ persist/restart discovery
→ skill.json action/event catalog
→ sidepanel Skills catalog / shared skills.summary
→ enable
→ skills.invoke or runtime.event.dispatch
→ sandboxed JS Runner package handler under MV3 CSP
→ shared capability call such as tabs.get_active or memfs.read
→ audit.tail evidence
→ optional update snapshot and skills.rollback readback
```

This is the repo-side proof that the vNext browser extension can replace a representative old Plugin / Skill capability chain without reintroducing `Plugin` as the product concept.

## Deferred Breadth

These items remain deliberately outside the current Level 2 proof. They should not become small default queue filler unless a human explicitly promotes one into the current milestone:

- interactive version selection, rollback confirmation, and package diff/preview
- bulk migration of every historical plugin ecosystem affordance
- Tier 2 / Tier 3 browser automation such as scroll, select option, hover, tabs create/close, stealth/computer mode
- screenshot/download export composites
- bulk debug dump/export and deeper observability productization
- bridge-side MCP server/transport
- broader provider policy hardening outside current kernel/control-plane routing

## Next Decision Boundary

There should be at most one next planning boundary after this pack:

1. Accept this repository state plus the real Chromium MV3 smoke in `docs/level-2-uat-scenario-2026-05-27.md` as the Level 2 cutover evidence basis and move to external release / product cutover.
2. Request one additional concrete UAT scenario that exercises a human-selected real browser/profile workflow.
3. Explicitly promote one deferred breadth item to mainline with a named product reason.

Do not reopen version-selection rows, diff/preview rows, audit rows, or manifest metadata rows as default implementation issues unless they are selected through that decision boundary.
