# Browser Automation Dogfood Report 2026-05-31

## Goal

验证 Browser Harness 式少数原语是否足够支撑最小 browser lane dogfood。判断由当前 Codex Agent 基于证据完成，不写代码评分器。

## Environment

- Tool: `/Users/envvar/work/repos/_research/browser-harness`
- Command shape: `browser-harness <<'PY' ... PY`
- Page: controlled `data:` page with one button, one input, one scroll marker
- Evidence screenshots:
  - `/tmp/bbl-dogfood-step1.png`
  - `/tmp/bbl-dogfood-step2.png`
  - `/tmp/bbl-dogfood-step3.png`
  - `/tmp/bbl-dogfood-step4.png`

## Action Trace

1. Static Page Sanity
   - Action: `new_tab(data_url)`, `wait_for_load()`, `page_info()`, `capture_screenshot()`
   - Evidence: page title was `BBL Dogfood Harness`; viewport and page height were visible in `page_info`.
   - Agent judgment: page was observable enough to choose the button as the next target.

2. Coordinate Click
   - Action: `click_at_xy(170, 150)`, then `capture_screenshot()`
   - Evidence: JS readback showed `{ text: "Click target: clicked", clicked: "yes" }`.
   - Agent judgment: coordinate click was sufficient; no selector, UID, locator ranking, or DOM search was needed.

3. Keyboard Text Input
   - Action: `click_at_xy(230, 238)`, `type_text("agent")`, `press_key("Enter")`
   - Evidence: JS readback showed `{ value: "agent", status: "Submitted: agent", submitted: "agent" }`.
   - Agent judgment: typing and submit path worked; if it had failed, the next diagnosis would be focus first, then key dispatch, then page logic.

4. Scroll And Observe
   - Action: `scroll(900, 850, dy=900)`, then `page_info()` and screenshot.
   - Evidence: `page_info` showed `sy: 774`; screenshot showed the yellow bottom marker visible.
   - Agent judgment: scroll was effective and visually confirmable without DOM snapshot.

5. JS/CDP Escape Hatch
   - Action: `js(...)` for compact page state and `cdp("Runtime.evaluate", expression="document.title")`.
   - Evidence: JS returned `{ clicked: "yes", submitted: "agent", scrollY: 774 }`; CDP returned the page title.
   - Agent judgment: JS/CDP was useful only as state readback. It should stay as an escape hatch, not become a locator framework.

## Agent Self-Evaluation

This controlled run supports the first-principles direction:

- Keep: `page_info`, `screenshot`, `click_xy`, `type_text`, `press_key`, `scroll`, `js`, `cdp`.
- Avoid: UID-first action paths as the default route, hidden verify, runtime success scoring, and fallback planners.
- Next simplest real scenario: use the same report format on an authenticated page where visual state matters, starting with X bookmarks only after confirming the action will not accidentally spam or duplicate likes.

## Follow-Up

- Add vNext equivalents for `page.info`, `page.click_xy`, `page.type_text`, `page.scroll`, `page.js`, and debug-gated `page.cdp`.
- Make UI/action output show evidence, not just `ok`.
- Keep `page.query` as auxiliary DOM readback until a dogfood report proves a stronger default is needed.
