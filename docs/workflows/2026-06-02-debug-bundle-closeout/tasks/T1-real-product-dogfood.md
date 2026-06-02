# T1: Verify Real Product Debug Bundle Dogfood

## Objective

Verify that the real product sidepanel/chat/kernel path can complete a read-only browser task with Browser Harness primitives, call `runtime_capture_diagnostics`, explicitly call `debug_bundle`, and produce a final assistant response.

## Read

- `docs/workflows/2026-06-02-debug-bundle-closeout/README.md`
- `docs/workflows/2026-06-02-debug-bundle-closeout/operating-rules.md`
- `docs/workflows/2026-06-02-debug-bundle-closeout/milestone-plan.md`
- `docs/browser-automation-dogfood-todo.md`
- `scripts/dogfood-real-browser-network.ts`
- `scripts/dogfood-existing-chrome-tab.js`

## Allowed Writes

- `.ml-cache/dogfood/**`
- `docs/workflows/2026-06-02-debug-bundle-closeout/handoffs/T1-real-product-dogfood.md`

## Forbidden

- Product code edits.
- Real external visible actions such as like/post/reply/follow/DM/form submit.
- Temporary-profile artifact counted as existing-profile X product success.
- Reading cookies, localStorage, profile secrets, passwords, or tokens.

## Required Proof

Record either:

- passing artifact path with diagnostics -> debug_bundle -> final response evidence, or
- exact blocker path and reason.

For X existing-profile dogfood, proof must show the product sidepanel/chat/kernel path in the same real Chrome profile as the X tab. If no product sidepanel is available in that profile, write a blocked artifact and handoff.

## Suggested Commands

```bash
bun run dogfood:real-browser -- --url=https://developer.mozilla.org/en-US/search?q=websocket --prompt="只读 dogfood：使用 Browser Harness 原语观察页面，调用 runtime_capture_diagnostics 后显式调用 debug_bundle，然后给出最终简短结论。"
```

For existing-profile X, use the documented `runExistingChromeDogfood` path in `docs/browser-automation-dogfood-todo.md` only if the product sidepanel/extension id is available in that same profile.

## Escalation

Stop if the run needs real external visible action, missing credentials, product code changes, or a new browser capability.
