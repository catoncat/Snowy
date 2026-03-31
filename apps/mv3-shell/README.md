# mv3-shell

Minimal Chrome MV3 extension shell — buildable extension packaging, background service worker, offscreen document, and page hook injection.

## Development

```bash
bun run ext:build
```

Build output is emitted to `apps/mv3-shell/dist/` and is the directory intended to be loaded into Chrome.

## Structure

```
dist/               Built extension payload
src/
  background.js    Background worker — composition root + message routing
  offscreen.html   Offscreen document container
  offscreen.js     Runner host / offscreen entry
  page-hook.js     MAIN world injection script (single-file)
manifest.json      Chrome MV3 manifest
vite.config.js     Extension packaging config
```

## Key Exports

```js
import { createBackgroundRunnerBridge, createPageHookBridge } from "mv3-shell/background";
```

| Function | Purpose |
|----------|---------|
| `createBackgroundRunnerBridge()` | Offscreen lifecycle, package-backed runner/site bridge, bootstrap |
| `createPageHookBridge()` | Page hook install/invoke/verify/snapshotState |
| `startBackgroundRunnerBridge()` | Auto-start bridge + register runtime listener |

## Message Routing

Routes `runner.*`, `host.*`, `hosts.*`, `site.runtime.invoke`, `runtime.diagnostics`, `runtime.bootstrap`, and `resource.read` messages between offscreen, content scripts, and page hooks.
