# T1: Real Product Debug Bundle Dogfood Handoff

Status: passed for the read-only MDN product dogfood path.

## Conclusion

The real product sidepanel/chat/kernel path completed the required read-only dogfood chain on MDN:

1. Product Chat sent the task prompt.
2. The LLM used Browser Harness-style product tools to observe the page.
3. The LLM explicitly called `runtime_capture_diagnostics`.
4. The LLM explicitly called `debug_bundle`.
5. Product Chat produced a final assistant response.

Passing artifact:

- `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-rs1/`

This is product-path evidence for a public read-only page. It is not X existing-profile proof.

## Files Read

- `docs/workflows/2026-06-02-debug-bundle-closeout/README.md`
- `docs/workflows/2026-06-02-debug-bundle-closeout/operating-rules.md`
- `docs/workflows/2026-06-02-debug-bundle-closeout/milestone-plan.md`
- `docs/workflows/2026-06-02-debug-bundle-closeout/tasks/T1-real-product-dogfood.md`
- `docs/agent-task-index.md`
- `docs/browser-automation-dogfood-todo.md`
- `scripts/dogfood-real-browser-network.ts`
- `scripts/dogfood-existing-chrome-tab.js`
- `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-retry/report.md`
- `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-retry/chat-bootstrap.json`
- `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-retry/observability-timeline.json`
- `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-retry/debug-bundle.json`
- `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-rs1/report.md`
- `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-rs1/chat-bootstrap.json`
- `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-rs1/debug-bundle.json`

## Files Changed

- `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02/` from an initial shell quoting failure attempt; contains only prepared extension files and no product proof.
- `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-retry/` from a product-path run blocked by the default `rs` provider returning HTTP 403 before any browser tool call.
- `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-rs1/` from the passing product-path run.
- `docs/workflows/2026-06-02-debug-bundle-closeout/handoffs/T1-real-product-dogfood.md`.

No product code, public contracts, dependencies, root config, push, PR, merge, release, or deploy changes were made.

## Proof Commands And Results

Initial command failed before runner startup because zsh expanded `?` in the unquoted URL:

```bash
bun run dogfood:real-browser -- --artifact-dir=.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02 --url=https://developer.mozilla.org/en-US/search?q=websocket --prompt="只读 dogfood：使用 Browser Harness 原语观察页面，调用 runtime_capture_diagnostics 后显式调用 debug_bundle，然后给出最终简短结论。" --timeout-ms=180000
```

Result:

```text
zsh:1: no matches found: --url=https://developer.mozilla.org/en-US/search?q=websocket
```

Retry with quoted URL used the default `rs` provider and produced a blocked artifact:

```bash
DEBUG=pw:browser bun run dogfood:real-browser -- --artifact-dir=.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-retry --url='https://developer.mozilla.org/en-US/search?q=websocket' --prompt="只读 dogfood：使用 Browser Harness 原语观察页面，调用 runtime_capture_diagnostics 后显式调用 debug_bundle，然后给出最终简短结论。" --timeout-ms=180000 --keep-profile
```

Result evidence:

- artifact: `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-retry/`
- `report.md`: `Timed out: true`, `Completion reason: timeout`, `Latest assistant text: (empty)`
- `observability-timeline.json`: `runtime.llm.request.failed` with `LLM API error 403` from `https://crs0910-ppk.hf.space/v1/responses`
- `debug-bundle.json`: `toolCallCount: 0`, `laneCount: 0`

Passing run used the alternate configured provider `rs1`:

```bash
bun run dogfood:real-browser -- --codex-provider=rs1 --artifact-dir=.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-rs1 --url='https://developer.mozilla.org/en-US/search?q=websocket' --prompt="只读 dogfood：使用 Browser Harness 原语观察页面，调用 runtime_capture_diagnostics 后显式调用 debug_bundle，然后给出最终简短结论。" --timeout-ms=180000 --keep-profile
```

Result evidence:

- artifact: `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-rs1/`
- `report.md`: `Timed out: false`, `Completion reason: assistant_text`
- `report.md`: `Network requests: 74`, `Network responses: 73`, `Network failures: 0`, status counts `{"200":73}`
- `chat-bootstrap.json`: `runState.status: idle`, `messageCount: 6`, final assistant text present
- `debug-bundle.json`: `timelineEventCount: 20`, `rawEventTailCount: 20`, `toolCallCount: 8`, `laneCount: 4`
- `debug-bundle.json` lane map includes product-path entries for `tabs_get_active`, `page_info`, `runtime_capture_diagnostics`, and `debug_bundle`
- `debug-bundle.json` tool calls include succeeded `runtime_capture_diagnostics` and succeeded `debug_bundle`
- screenshots: `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-rs1/task-page.png` and `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-rs1/sidepanel.png`

The final assistant text in `chat-bootstrap.json` states that the LLM observed the MDN page, called `runtime_capture_diagnostics`, explicitly called `debug_bundle`, and returned the final conclusion.

## Blockers / Caveats

- Default provider `rs` was not usable for this run: `/responses` returned HTTP 403 before any browser tool call. `rs1` worked.
- The successful run recorded a diagnostic note from `runtime_capture_diagnostics`: `Offscreen document is not available`. It did not block the read-only dogfood chain.
- This T1 pass covers the public MDN product path. Existing-profile X proof remains separate: it still requires the repo MV3 product sidepanel in the same real Chrome profile as the X tab, and no external visible action is allowed without explicit user confirmation.

## Next Step

Use `.ml-cache/dogfood/debug-bundle-mdn-t1-2026-06-02-rs1/` as M2 read-only product dogfood proof. For X existing-profile dogfood, first arrange a Chrome profile where the logged-in X tab and repo MV3 sidepanel are both present, then run the documented existing-Chrome path without temporary-profile substitution.
