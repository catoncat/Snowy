# ISSUE-127 Remote Transport Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the injectable remote exec/probe seam with a minimal remote transport contract in the MV3 background bridge, verify available/unavailable runtime behavior with focused tests, and update migration docs before deciding whether ISSUE-127 can close.

**Architecture:** Introduce a first-class `remoteTransport` object boundary in `apps/mv3-shell/src/background.ts` so the background bridge depends on a contract rather than raw callbacks. Keep the existing remote exec/probe wrappers in `apps/mv3-shell/src/runtime-services.ts`, but expose them through a small transport factory so availability, diagnostics, and probe semantics are explicit and testable.

**Tech Stack:** TypeScript, Vitest, Bun, MV3 background/offscreen bridge tests, markdown control docs

---

### Task 1: Add failing tests for remote transport contract semantics

**Files:**
- Modify: `apps/mv3-shell/test/manifest.spec.ts`
- Test: `apps/mv3-shell/test/manifest.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add focused tests that assert:

```ts
it("does not expose a remote host record when no remote transport is configured", async () => {
  // createBackgroundRunnerBridge({ chromeApi, timeoutMs: 50 })
  // hosts.list should only include local
});

it("surfaces a degraded remote host when remote transport is configured but unavailable", async () => {
  // createBackgroundRunnerBridge({ chromeApi, timeoutMs: 50, remoteTransport })
  // hosts.list / hosts.get include remote with degraded state + structured error
  // hosts.connect and host.exec fail with transport_unavailable diagnostics
});

it("routes remote exec through the configured remote transport contract", async () => {
  // hosts.set_default remote
  // host.exec succeeds and calls remoteTransport.exec()
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- apps/mv3-shell/test/manifest.spec.ts`

Expected: the newly added transport-contract assertions fail because `createBackgroundRunnerBridge()` still uses `sendRemoteExec` / `sendRemoteProbe` availability rules.

- [ ] **Step 3: Commit the red test state if working in a disposable branch**

```bash
git add apps/mv3-shell/test/manifest.spec.ts
# optional checkpoint commit only if using a dedicated worker branch
```

### Task 2: Replace callback seams with a minimal remote transport contract

**Files:**
- Modify: `apps/mv3-shell/src/background.ts`
- Modify: `apps/mv3-shell/src/runtime-services.ts`
- Test: `apps/mv3-shell/test/manifest.spec.ts`

- [ ] **Step 1: Introduce the contract in the background bridge**

Update `createBackgroundRunnerBridge()` so it accepts a `remoteTransport` object instead of directly depending on raw `sendRemoteExec` / `sendRemoteProbe` callbacks.

```ts
const REMOTE_TRANSPORT_UNAVAILABLE_ERROR = {
  code: "E_RUNTIME",
  message: "Remote transport is unavailable",
  details: {
    reason: "transport_unavailable",
  },
};

function hasRemoteTransport() {
  return Boolean(remoteTransport);
}
```

- [ ] **Step 2: Implement explicit transport availability helpers**

Add small helpers so runtime semantics come from the contract itself.

```ts
async function isRemoteTransportAvailable() {
  if (!remoteTransport) return false;
  if (typeof remoteTransport.isAvailable === "function") {
    return Boolean(await remoteTransport.isAvailable());
  }
  return true;
}

async function describeRemoteTransportAvailability(hostId = REMOTE_HOST_ID) {
  if (!remoteTransport) return null;
  if (typeof remoteTransport.describeAvailability === "function") {
    return (await remoteTransport.describeAvailability({ hostId })) ?? null;
  }
  return null;
}
```

- [ ] **Step 3: Route probe/exec through the contract**

Use the transport in `probeRemoteHostControlState()` and `routeRemoteExec()`.

```ts
if (!remoteTransport || typeof remoteTransport.exec !== "function") {
  return unsupportedHostOperation({ hostId: resolvedHostId, kind: "exec" });
}

const response = await remoteTransport.exec({
  kind: "exec",
  requestId: payload.requestId ?? nextRequestId(),
  hostId: resolvedHostId,
  command: payload.command,
  timeoutMs: payload.timeoutMs,
});
```

When the transport exists but reports unavailable, surface a structured degraded-state error with `details.reason = "transport_unavailable"` instead of silently treating the host as absent.

- [ ] **Step 4: Expose a transport factory from runtime services**

Keep the current wrappers, but package them behind a formal factory.

```ts
export function createRemoteHostTransport({ sendExec, sendProbe, isAvailable }: any = {}) {
  if (typeof sendExec !== "function") {
    return null;
  }
  return {
    isAvailable,
    exec: createRemoteExecAdapter(sendExec).exec,
    probe: typeof sendProbe === "function" ? createRemoteHostProbe(sendProbe) : undefined,
  };
}
```

- [ ] **Step 5: Run focused tests to verify they pass**

Run: `bun run test -- apps/mv3-shell/test/manifest.spec.ts`

Expected: PASS for the newly added transport contract tests and no regression in existing MV3 bridge tests.

- [ ] **Step 6: Commit the implementation**

```bash
git add apps/mv3-shell/src/background.ts apps/mv3-shell/src/runtime-services.ts apps/mv3-shell/test/manifest.spec.ts
git commit -m "feat: formalize remote host transport contract"
```

### Task 3: Sync migration docs and verify closeout readiness

**Files:**
- Modify: `docs/legacy-to-vnext-migration-matrix.md`
- Modify: `docs/backlog/2026-04-10-follow-up-remote-execution-host-transport-is-still-injectable-only.md`
- Test: `apps/mv3-shell/test/manifest.spec.ts`

- [ ] **Step 1: Update the migration matrix wording**

Replace the old gap wording with language that reflects the new state.

```md
`hosts.*` control plane, default-host routing, probe-backed health semantics, and the minimal remote transport contract are landed; remaining gaps are concrete production transport configuration and multi-remote-host discovery/parity.
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
bun run test -- apps/mv3-shell/test/manifest.spec.ts
./node_modules/.bin/biome check apps/mv3-shell/src/background.ts apps/mv3-shell/src/runtime-services.ts apps/mv3-shell/test/manifest.spec.ts docs/legacy-to-vnext-migration-matrix.md docs/backlog/2026-04-10-follow-up-remote-execution-host-transport-is-still-injectable-only.md
```

Expected: both commands pass, or any external blocker is clearly identified.

- [ ] **Step 3: If acceptance is satisfied, close the issue record**

Append completion details and set status to done.

```md
## 工作总结
- remote exec/probe path now flows through a first-class transport contract
- focused verification: `bun run test -- apps/mv3-shell/test/manifest.spec.ts`, `biome check ...`
- remaining scope boundary: no multi-remote-host discovery or final production transport

## 相关 commits
- <commit-hash> feat: formalize remote host transport contract
```

- [ ] **Step 4: Rebuild the live queue if the issue is marked done**

Run: `bun run workflow:queue:build`

Expected: queue rebuild succeeds after the backlog record changes.
