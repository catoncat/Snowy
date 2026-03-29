# @bbl-next/js-runner

Isolated JS execution host with RPC protocol for invoke, cancel, and health checks. Supports host substrate adapter for read/write/edit/exec callbacks.

## API Entry

```ts
import { JsRunnerHost } from "@bbl-next/js-runner";
```

## Key Exports

| Category | Examples |
|----------|---------|
| Runner host | `JsRunnerHost` — `invoke()`, `dispatch()`, `cancel()`, `getHealth()` |
| RPC protocol | `RunnerRpcRequest`, `RunnerRpcResponse` (invoke/cancel/health + host substrate) |
| Host adapter | `RunnerHostAdapter` — optional read/write/edit/exec callbacks |
| Types | `RunnerInvocation`, `RunnerInvocationResult`, `RunnerHostHealth` |

## Dependencies

- `@bbl-next/contracts`
