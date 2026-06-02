# Level 2 UAT Scenario: Legacy Plugin Event Replacement

> date: 2026-05-27
> status: executed against current repo state and real Chromium MV3 extension
> scope: representative old-plugin replacement loop for release acceptance

## Scenario

This UAT scenario exercises the old `send-success-global-message` class of plugin behavior through the vNext Skill runtime model.

The representative flow is:

```text
skills.install setupPlan
-> mem://skills/<skillId> package files
-> skill.json eventSubscriptions
-> skills.enable
-> resource.read skills.summary
-> runtime.bootstrap
-> runtime.event.dispatch runtime.route.after
-> skills.invoke through sandboxed JS Runner
-> package handler ctx.call("memfs.read")
-> package handler result
-> resource.read audit.tail evidence
```

This is intentionally not a full legacy plugin ecosystem migration. It is the release-facing proof that a hook-driven old plugin behavior can be represented as an enabled package-backed Skill without reintroducing `Plugin` as the product concept.

## Acceptance Checks

| Check | Command | Observed Result |
|---|---|---|
| Release acceptance evidence refresh | `bun run release:acceptance` | Runs the release-facing proof refresh: validates the Level 2 acceptance pack, this UAT scenario, cutover readiness criteria, source-of-truth planning boundary, and module ledger status, then runs build, the real Chromium MV3 smoke, and the repository gate. |
| Real Chromium MV3 release smoke | `bun run release:smoke:mv3` | Passed after ISSUE-184: Playwright Chromium loaded `apps/mv3-shell/dist` as an unpacked MV3 extension, installed `skill.release.real-browser`, enabled it, read `skills.summary` / `runtime.bootstrap`, dispatched `runtime.route.after`, executed the package handler inside the MV3 sandbox runner, called `ctx.call("memfs.read")` back through the offscreen/background capability gateway, and found both `skills.invoke` and `memfs.read` evidence in `audit.tail`. The same smoke was RED before the fix with Chrome MV3 CSP rejecting `unsafe-eval` during package handler evaluation. |
| Event-driven Skill UAT | `bun run test -- apps/mv3-shell/test/manifest.spec.ts -t "dispatches runtime events to enabled package-backed skill subscriptions"` | Passed: 1 test passed, 91 skipped. The test installed `skill.legacy.send-success`, exposed `eventSubscriptions` through `skills.summary` and `runtime.bootstrap`, dispatched `runtime.route.after`, received a `notify_success` result, and found install/enable/invoke evidence in `audit.tail`. |
| Repository gate | `bun run check` | Passed: typecheck passed, MV3 bridge gate passed with 2 tests, Biome checked 115 files, and the full Vitest suite passed with 35 test files / 616 tests. |
| Extension build smoke | `bun run build` | Passed: Vite transformed 47 modules and produced MV3 shell assets under `apps/mv3-shell/dist/`, including `background.js`, `offscreen.js`, `runner-sandbox.js`, `page-hook.js`, and sidepanel assets. |

## Release Readout

The scenario supports accepting `docs/level-2-cutover-acceptance-2026-05-27.md` as the repo-side Level 2 evidence basis. The release-facing proof now includes real Chromium MV3 CSP behavior, not only Vitest harness execution.

`bun run release:acceptance` is the current repo-side refresh command for this evidence pack. Passing it means the documented proof still matches current code and tests; it does not replace the external release decision.

Remaining decisions are outside this repository's autonomous workflow:

1. Accept the current evidence pack and move to product release / old-mainline cutover.
2. Request a human-defined UAT scenario with real browser/profile data.
3. Promote one named deferred breadth item to mainline with a product reason.

Do not treat deferred breadth rows such as version selection, package diff/preview, bulk debug export, or full plugin ecosystem migration as default queue filler after this UAT.
