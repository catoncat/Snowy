# Level 2 UAT Scenario: Legacy Plugin Event Replacement

> date: 2026-05-27
> status: executed against current repo state
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
-> skills.invoke through JS Runner
-> package handler result
-> resource.read audit.tail evidence
```

This is intentionally not a full legacy plugin ecosystem migration. It is the release-facing proof that a hook-driven old plugin behavior can be represented as an enabled package-backed Skill without reintroducing `Plugin` as the product concept.

## Acceptance Checks

| Check | Command | Observed Result |
|---|---|---|
| Event-driven Skill UAT | `bun run test -- apps/mv3-shell/test/manifest.spec.ts -t "dispatches runtime events to enabled package-backed skill subscriptions"` | Passed: 1 test passed, 91 skipped. The test installed `skill.legacy.send-success`, exposed `eventSubscriptions` through `skills.summary` and `runtime.bootstrap`, dispatched `runtime.route.after`, received a `notify_success` result, and found install/enable/invoke evidence in `audit.tail`. |
| Repository gate | `bun run check` | Passed: typecheck passed, MV3 bridge gate passed with 2 tests, Biome checked 115 files, and the full Vitest suite passed with 35 test files / 616 tests. |
| Extension build smoke | `bun run build` | Passed: Vite transformed 46 modules and produced MV3 shell assets under `apps/mv3-shell/dist/`, including `background.js`, `offscreen.js`, `page-hook.js`, and sidepanel assets. |

## Release Readout

The scenario supports accepting `docs/level-2-cutover-acceptance-2026-05-27.md` as the repo-side Level 2 evidence basis.

Remaining decisions are outside this repository's autonomous workflow:

1. Accept the current evidence pack and move to product release / old-mainline cutover.
2. Request a human-defined UAT scenario with real browser/profile data.
3. Promote one named deferred breadth item to mainline with a product reason.

Do not treat deferred breadth rows such as version selection, package diff/preview, bulk debug export, bridge-side MCP transport, or full plugin ecosystem migration as default queue filler after this UAT.
