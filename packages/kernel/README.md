# @bbl-next/kernel

Session management, run state machine, loop engine, compaction manager, and unified kernel facade.

## API Entry

```ts
import { createKernel } from "@bbl-next/kernel";

const kernel = createKernel({ storage, llmAdapter });
```

## Key Exports

| Category | Examples |
|----------|---------|
| Kernel facade | `createKernel()` → `Kernel` — unified API for session/run/queue/loop/compaction |
| Session store | `SessionStore` — session CRUD, entry chain, context rebuild |
| Run controller | `RunController` — run phase state machine, prompt queue, retry |
| Loop engine | `LoopEngine` — turn scheduling, terminal detection, no-progress detection |
| Compaction | `CompactionManager` — threshold-based trigger, prepare/execute/apply cycle |
| Test helpers | `InMemorySessionStorage`, `resetIdCounter()`, `resetPromptCounter()`, `resetTurnCounter()` |

## Dependencies

- `@bbl-next/contracts`
