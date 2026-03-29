# mv3-shell

Minimal Chrome MV3 extension shell — background service worker, offscreen document, and page hook injection.

## Structure

```
src/
  background.js    Background worker — message routing hub
  offscreen.html   Offscreen document container
  offscreen.js     Runner host / offscreen entry
  page-hook.js     MAIN world injection script
manifest.json      Chrome MV3 manifest
```

## Key Exports

```js
import { createBackgroundRunnerBridge, createPageHookBridge } from "mv3-shell/background";
```

| Function | Purpose |
|----------|---------|
| `createBackgroundRunnerBridge()` | Offscreen lifecycle, runner invoke/cancel/health, site runtime bridge, bootstrap |
| `createPageHookBridge()` | Page hook install/invoke/verify/snapshotState |
| `startBackgroundRunnerBridge()` | Auto-start bridge + register runtime listener |

## Message Routing

Routes `runner.*`, `host.*`, `hosts.*`, `site.runtime.invoke`, `runtime.diagnostics`, `runtime.bootstrap` messages between offscreen, content scripts, and page hooks.
