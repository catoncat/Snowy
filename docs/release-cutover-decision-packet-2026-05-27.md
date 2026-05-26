# Release Cutover Decision Packet

> date: 2026-05-27
> status: ready for external release acceptance
> scope: browser-brain-loop-next replacing the old browser plugin mainline

## Recommended Decision

Accept the current repo-side Level 2 evidence pack as the basis for external release / old-mainline cutover.

This packet does not perform the product cutover by itself. It gives the decision maker one current place to verify the evidence and choose the next branch.

## Required Fresh Evidence

Run this immediately before making the decision:

```bash
bun run release:acceptance
```

The command must pass. It verifies:

- `docs/level-2-cutover-acceptance-2026-05-27.md`
- `docs/level-2-uat-scenario-2026-05-27.md`
- `docs/cutover-readiness-criteria.md`
- `docs/source-of-truth-map.md`
- `docs/module-tracking-ledger.json`
- extension production build
- real Chromium MV3 release smoke
- repo-wide typecheck, lint, and tests

The latest run in this session passed with `ok: true`, including build, real Chromium MV3 smoke, and `bun run check`.

Then run the cutover status gate:

```bash
bun run release:cutover:status
```

This command reruns the repo-side acceptance gate and adds delivery state: Git branch, upstream, ahead/behind count, worktree cleanliness, live queue entries, and active workflow leases. It may fail even when `release:acceptance` is green. In that case, treat the failure as a cutover delivery blocker, not as permission to reopen deferred implementation rows.

Current delivery state as of this packet refresh:

- release branch: `codex/browser-plugin-cutover`
- review handoff: PR #2, `[codex] 推进浏览器插件重构 cutover`
- local `bun run release:cutover:status`: passing, with no blockers
- GitHub PR CI: passing
- remaining boundary: external release acceptance / old-mainline switch decision

Do not interpret an empty queue after this point as permission to create more default implementation slices. If the status gate stays green, continue through review, acceptance, and explicit release/cutover decision handling. If the gate fails, fix the concrete delivery blocker it reports before reopening product scope.

## Repo-Side Evidence Summary

- Gate A: contracts, descriptor projection, ctx permissions, trace, nested invoke, lifecycle, package action catalog, and event subscription summaries are test-covered.
- Gate B: BrowserVFS canonical `mem://skills/<skillId>/...` package storage is proven through install setup materialization and restart readback.
- Gate C: package-backed handlers execute in the MV3 path; real Chromium CSP is covered by sandboxed handler execution rather than extension-page `unsafe-eval`.
- Gate D: representative active-tab automation reaches shared `tabs.get_active` from an executable Skill and leaves audit evidence.
- Gate E: migration matrix, parity dashboard, cutover criteria, and module ledger distinguish shipped proof from deferred breadth.
- Gate F: `audit.tail`, diagnostics, intervention/audit, and observability read surfaces provide vNext runtime evidence without falling back to the old repo.
- Gate G: `runtime.summary`, `config.summary`, `skills.summary`, `hosts.summary`, `runtime.bootstrap`, and sidepanel management consume the shared product surface.

The representative replacement loop is:

```text
skills.install setupPlan
-> mem://skills package files
-> persist/restart discovery
-> skill.json action/event catalog
-> sidepanel Skills catalog / shared skills.summary
-> enable
-> skills.invoke or runtime.event.dispatch
-> sandboxed JS Runner package handler under MV3 CSP
-> shared capability call such as tabs.get_active or memfs.read
-> audit.tail evidence
-> optional update snapshot and skills.rollback readback
```

## Allowed Decision Options

1. Accept the evidence pack and move to external release / old-mainline cutover.
2. Request one concrete human-defined UAT scenario with real browser/profile data.
3. Promote exactly one deferred breadth item to mainline with a named product reason.

Anything else should be treated as a new product decision, not default backlog generation.

## Not Now

Do not reopen these as default queue filler:

- interactive version selection UI
- rollback confirmation UI
- package diff/preview
- bulk migration of every historical plugin affordance
- Tier 2 / Tier 3 browser automation breadth
- screenshot/download composites
- bulk debug export
- bridge-side MCP server/transport
- broad provider-policy hardening

These are post-cutover or explicitly promoted product breadth. They are not blockers for the current Level 2 replacement proof.

## Post-Decision Actions

If the decision is accepted:

- record the external decision outcome next to this packet
- decide the release branch / PR / deployment path explicitly, then rerun `bun run release:cutover:status`
- keep `bun run release:acceptance` as the pre-cutover repo-side gate
- move old-mainline work to maintenance / follow-up planning

If one extra UAT is requested:

- define the exact scenario first
- run or implement only that scenario
- do not reopen unrelated deferred breadth

If one deferred breadth item is promoted:

- name the product reason
- update module ledger stage/rationale before queueing work
- create one milestone issue around an end-to-end product loop
