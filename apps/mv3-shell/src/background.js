import {
  BOOTSTRAP_RESOURCE_KEYS as CONTRACT_BOOTSTRAP_RESOURCE_KEYS,
  HOST_AUDIT_KINDS,
  HOST_AUDIT_STATUSES,
} from "@bbl-next/contracts";
import { createBootstrapSummary } from "@bbl-next/core";
import { createPageHookBridge } from "./page-hook-bridge.js";
import { createBackgroundRuntimeServices } from "./runtime-services.js";

export { createPageHookBridge } from "./page-hook-bridge.js";

export const RUNNER_BACKGROUND_TARGET = "bbl-next.runner.background";
export const RUNNER_OFFSCREEN_TARGET = "bbl-next.runner.offscreen";
export const RUNNER_OFFSCREEN_DOCUMENT_PATH = "src/offscreen.html";
export const RUNNER_OFFSCREEN_REASONS = ["WORKERS"];
export const RUNNER_OFFSCREEN_JUSTIFICATION =
  "Run the offscreen JS runner host for isolated skill execution.";
export const RUNNER_BRIDGE_TIMEOUT_MS = 5_000;
export const PAGE_HOOK_GLOBAL_KEY = "__BBL_NEXT_PAGE_HOOK__";
export const PAGE_HOOK_DEFAULT_FILE = "src/page-hook.js";
export const BOOTSTRAP_RESOURCE_KEYS = [...CONTRACT_BOOTSTRAP_RESOURCE_KEYS];
const LOCAL_HOST_ID = "local";
const AUDIT_STORAGE_KEY = "bbl-next.audit.host.v1";

function toBridgeError(error, fallbackCode = "E_RUNTIME") {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return {
      code: error.code,
      message: error.message,
      details: "details" in error ? error.details : undefined,
    };
  }
  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: error.message,
    };
  }
  return {
    code: fallbackCode,
    message: "Unknown bridge error",
    details: error,
  };
}

function isoNow() {
  return new Date().toISOString();
}

function normalizeAuditEntry(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (
    typeof value.kind !== "string" ||
    !HOST_AUDIT_KINDS.includes(value.kind) ||
    typeof value.status !== "string" ||
    !HOST_AUDIT_STATUSES.includes(value.status) ||
    typeof value.hostId !== "string"
  ) {
    return null;
  }

  const entry = {
    timestamp: typeof value.timestamp === "string" ? value.timestamp : isoNow(),
    sessionId: typeof value.sessionId === "string" ? value.sessionId : null,
    kind: value.kind,
    hostId: value.hostId,
    status: value.status,
  };
  if (typeof value.error === "string" && value.error.length > 0) {
    entry.error = value.error;
  }
  return entry;
}

function createChromeAuditStore(chromeApi, storageKey = AUDIT_STORAGE_KEY) {
  const storageArea = chromeApi?.storage?.local;
  if (typeof storageArea?.get !== "function" || typeof storageArea?.set !== "function") {
    return undefined;
  }
  return {
    async load() {
      const loaded = await storageArea.get(storageKey);
      return Array.isArray(loaded?.[storageKey]) ? loaded[storageKey] : [];
    },
    async save(entries) {
      await storageArea.set({
        [storageKey]: entries,
      });
    },
  };
}

function invalidPageAutomation(message) {
  return {
    ok: false,
    error: {
      code: "E_BAD_INPUT",
      message,
    },
  };
}

function emptyInterventionState() {
  return {
    status: "empty",
    totalCount: 0,
    activeCount: 0,
    recentCount: 0,
    active: [],
  };
}

function invalidHostControlPlane(message) {
  return {
    ok: false,
    error: {
      code: "E_BAD_INPUT",
      message,
    },
  };
}

function invalidHostSubstrate(message) {
  return {
    ok: false,
    error: {
      code: "E_BAD_INPUT",
      message,
    },
  };
}

function toExecutionHostHealthStatus(localState) {
  if (localState.health?.status === "degraded" || localState.error) {
    return "degraded";
  }
  if (localState.reachable) {
    return "healthy";
  }
  return "unknown";
}

function toExecutionHostState(localState) {
  if (localState.health?.status === "degraded" || localState.error) {
    return "degraded";
  }
  return localState.reachable ? "connected" : "disconnected";
}

function defaultBootstrapSummaryBuilder(input) {
  const summary = createBootstrapSummary({
    generatedAt: input.generatedAt,
    activeTab: input.runtime?.activeTab ?? null,
    runtime: {
      status: input.runtime?.status,
      sessionId: input.runtime?.sessionId,
      loopState: input.runtime?.loopState,
      lastError: input.runtime?.lastError,
    },
    skills: input.skills,
    hosts: input.hosts,
    config: input.config,
  });

  return {
    ...summary,
    runtime: {
      ...summary.runtime,
      mode: input.runtime?.mode ?? summary.runtime.mode,
    },
    resourceKeys: Array.isArray(input.resourceKeys)
      ? [...input.resourceKeys]
      : [...BOOTSTRAP_RESOURCE_KEYS],
  };
}

function toBootstrapActiveTab(activeTab, world = "main") {
  return {
    tabId: activeTab.id,
    url: activeTab.url,
    title: typeof activeTab.title === "string" ? activeTab.title : undefined,
    world,
  };
}

function normalizeSkillSummaryInput(entry) {
  if (typeof entry === "string") {
    return {
      id: entry,
      enabled: false,
      trusted: false,
      recentChange: null,
    };
  }
  if (!entry || typeof entry !== "object" || typeof entry.id !== "string") {
    return null;
  }
  return {
    id: entry.id,
    enabled: entry.enabled === true || entry.state === "enabled",
    trusted: entry.trusted === true,
    recentChange:
      typeof entry.recentChange === "string"
        ? entry.recentChange
        : typeof entry.lastChangedAt === "string"
          ? entry.lastChangedAt
          : null,
  };
}

function createTimeoutPromise(kind, requestId, timeoutMs) {
  let timerId;
  const promise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject({
        code: "E_TIMEOUT",
        message: `Runner bridge timed out for ${kind}`,
        details: {
          kind,
          requestId,
        },
      });
    }, timeoutMs);
  });
  return {
    promise,
    clear() {
      if (timerId != null) {
        clearTimeout(timerId);
      }
    },
  };
}

export function createBackgroundRunnerBridge({
  chromeApi = globalThis.chrome,
  timeoutMs = RUNNER_BRIDGE_TIMEOUT_MS,
  offscreenPath = RUNNER_OFFSCREEN_DOCUMENT_PATH,
  reasons = RUNNER_OFFSCREEN_REASONS,
  justification = RUNNER_OFFSCREEN_JUSTIFICATION,
  pageHookBridge = undefined,
  bootstrapSummaryBuilder = defaultBootstrapSummaryBuilder,
  sessionId = null,
  currentMode = "active-tab-only",
  listSkills = undefined,
  configSummary = undefined,
  runtimeServices = undefined,
  interventionTimeoutMs = undefined,
  auditStore = undefined,
  auditStorageKey = AUDIT_STORAGE_KEY,
} = {}) {
  const effectivePageHookBridge =
    pageHookBridge ??
    (typeof chromeApi?.scripting?.executeScript === "function"
      ? createPageHookBridge({ chromeApi })
      : undefined);
  let creating = null;
  let requestSequence = 0;
  const AUDIT_MAX_ENTRIES = 64;
  const auditEntries = [];
  const resolvedAuditStore = auditStore ?? createChromeAuditStore(chromeApi, auditStorageKey);
  const state = {
    defaultHostId: null,
    hostReady: false,
    hostLastSeenAt: undefined,
    hostRecoveredAt: undefined,
    hostRecoveryReason: undefined,
    lastRuntimeError: null,
    lastRuntimeErrorClearedAt: null,
  };
  let composedRuntimeServices = null;

  const auditReady = (async () => {
    if (!resolvedAuditStore) {
      return;
    }
    const loadedEntries = await resolvedAuditStore.load();
    const normalizedEntries = Array.isArray(loadedEntries)
      ? loadedEntries.map((entry) => normalizeAuditEntry(entry)).filter(Boolean)
      : [];
    auditEntries.splice(0, auditEntries.length, ...normalizedEntries.slice(-AUDIT_MAX_ENTRIES));
  })();

  async function persistAuditEntries() {
    if (!resolvedAuditStore) {
      return;
    }
    await resolvedAuditStore.save(auditEntries.map((entry) => ({ ...entry })));
  }

  async function resolveAuditSessionId() {
    if (typeof sessionId === "string" && sessionId.trim()) {
      return sessionId;
    }
    if (!runtimeServices && !composedRuntimeServices) {
      return null;
    }
    const runtimeKernelState = await getRuntimeServices().getKernelRuntimeState();
    return runtimeKernelState?.session?.id ?? null;
  }

  async function appendAudit({ kind, hostId, status, error }) {
    await auditReady;
    const entry = {
      timestamp: isoNow(),
      sessionId: await resolveAuditSessionId(),
      kind,
      hostId,
      status,
    };
    if (error) {
      entry.error = typeof error === "string" ? error : (error.message ?? String(error));
    }
    auditEntries.push(entry);
    if (auditEntries.length > AUDIT_MAX_ENTRIES) {
      auditEntries.splice(0, auditEntries.length - AUDIT_MAX_ENTRIES);
    }
    await persistAuditEntries();
    return entry;
  }

  function getAuditTail(limit) {
    const max = typeof limit === "number" && limit > 0 ? limit : AUDIT_MAX_ENTRIES;
    return auditEntries.slice(-max);
  }

  async function readAuditTail(limit) {
    await auditReady;
    return getAuditTail(limit);
  }

  function setRuntimeError(error) {
    if (error) {
      state.lastRuntimeError = {
        code: error.code ?? "E_RUNTIME",
        message: error.message ?? String(error),
        capturedAt: isoNow(),
      };
    }
  }

  function clearRuntimeError() {
    const hadError = state.lastRuntimeError !== null;
    state.lastRuntimeError = null;
    if (hadError) {
      state.lastRuntimeErrorClearedAt = isoNow();
    }
    return { cleared: hadError };
  }

  function getRuntimeError() {
    return state.lastRuntimeError;
  }

  function nextRequestId() {
    requestSequence += 1;
    return `bridge-${requestSequence}`;
  }

  function getRuntimeServices() {
    if (!composedRuntimeServices) {
      const baseRuntimeServices = createBackgroundRuntimeServices({
        chromeApi,
        invokeRunner: invoke,
        pageHookBridge: effectivePageHookBridge,
        configSummary,
        interventionTimeoutMs,
        pageHookScriptPath: PAGE_HOOK_DEFAULT_FILE,
      });
      composedRuntimeServices = runtimeServices
        ? {
            ...baseRuntimeServices,
            ...runtimeServices,
          }
        : baseRuntimeServices;
    }
    return composedRuntimeServices;
  }

  async function hasOffscreenDocument() {
    const offscreenUrl = chromeApi.runtime.getURL(offscreenPath);
    if (typeof chromeApi.runtime.getContexts === "function") {
      const contexts = await chromeApi.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [offscreenUrl],
      });
      return contexts.length > 0;
    }
    return false;
  }

  async function ensureOffscreenDocument() {
    const offscreenUrl = chromeApi.runtime.getURL(offscreenPath);
    if (await hasOffscreenDocument()) {
      return {
        created: false,
        offscreenUrl,
      };
    }
    if (!creating) {
      creating = chromeApi.offscreen.createDocument({
        url: offscreenPath,
        reasons,
        justification,
      });
    }
    try {
      await creating;
      return {
        created: true,
        offscreenUrl,
      };
    } finally {
      creating = null;
    }
  }

  function buildBridgeState(extra = {}) {
    return {
      hostReady: state.hostReady,
      hostLastSeenAt: state.hostLastSeenAt,
      hostRecoveredAt: state.hostRecoveredAt,
      hostRecoveryReason: state.hostRecoveryReason,
      ...extra,
    };
  }

  async function queryActiveTab() {
    if (!chromeApi?.tabs?.query) {
      return null;
    }
    const activeTabs = await chromeApi.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const activeTab = Array.isArray(activeTabs) ? activeTabs[0] : undefined;
    if (!activeTab || typeof activeTab.id !== "number" || typeof activeTab.url !== "string") {
      return null;
    }
    return activeTab;
  }

  async function resolveMaybe(value) {
    if (typeof value === "function") {
      return value();
    }
    return value;
  }

  async function routeRuntimeCapability(capabilityId, input = {}) {
    try {
      return {
        ok: true,
        data: await getRuntimeServices().dispatchCapability({
          capabilityId,
          input,
          permissions: [capabilityId],
        }),
      };
    } catch (error) {
      return {
        ok: false,
        error: toBridgeError(error),
      };
    }
  }

  async function routeRuntimeService(call) {
    try {
      return {
        ok: true,
        data: await call(),
      };
    } catch (error) {
      return {
        ok: false,
        error: toBridgeError(error),
      };
    }
  }

  function resolveHostId(hostId, action) {
    if (typeof hostId !== "string" || !hostId.trim()) {
      return invalidHostControlPlane(`${action} requires a string hostId`);
    }
    if (hostId !== LOCAL_HOST_ID) {
      return invalidHostControlPlane(`Unknown hostId: ${hostId}`);
    }
    return hostId;
  }

  function resolveHostSubstrateHostId(hostId, action) {
    if (typeof hostId === "string" && hostId.trim()) {
      return resolveHostId(hostId, action);
    }
    if (typeof state.defaultHostId === "string" && state.defaultHostId.trim()) {
      return state.defaultHostId;
    }
    return invalidHostSubstrate(`${action} requires hostId or a default host`);
  }

  async function readLocalHostControlState() {
    const checkedAt = isoNow();
    const offscreenPresent = await hasOffscreenDocument();
    if (!offscreenPresent) {
      return {
        checkedAt,
        offscreenPresent,
        reachable: false,
        health: null,
        error: null,
      };
    }

    const response = await sendToOffscreen("runner.diagnostics");
    if (!response.ok) {
      return {
        checkedAt,
        offscreenPresent,
        reachable: false,
        health: null,
        error: response.error ?? {
          code: "E_RUNTIME",
          message: "Runner diagnostics unavailable",
        },
      };
    }

    return {
      checkedAt,
      offscreenPresent,
      reachable: response.data?.ready === true,
      health: response.data?.health ?? null,
      error: null,
    };
  }

  function toLocalHostSnapshot(localState) {
    const connected = localState.reachable === true;
    const health = {
      status: toExecutionHostHealthStatus(localState),
      ...(localState.checkedAt ? { checkedAt: localState.checkedAt } : {}),
    };
    const snapshot = {
      hostId: LOCAL_HOST_ID,
      kind: "local",
      connected,
      state: toExecutionHostState(localState),
      isDefault: state.defaultHostId === LOCAL_HOST_ID,
      health,
    };
    if (localState.error) {
      return {
        ...snapshot,
        error: localState.error,
      };
    }
    return snapshot;
  }

  async function describeLocalHost() {
    return toLocalHostSnapshot(await readLocalHostControlState());
  }

  async function listHosts() {
    return {
      ok: true,
      data: {
        defaultHostId: state.defaultHostId,
        items: [await describeLocalHost()],
      },
    };
  }

  async function getHost({ hostId } = {}) {
    const resolvedHostId = resolveHostId(hostId, "hosts.get");
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    return {
      ok: true,
      data: await describeLocalHost(),
    };
  }

  async function connectHost({ hostId } = {}) {
    const resolvedHostId = resolveHostId(hostId, "hosts.connect");
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    const ensured = await ensureHost();
    if (!ensured.ok) {
      await appendAudit({
        kind: "hosts.connect",
        hostId: resolvedHostId,
        status: "failed",
        error: ensured.error?.message,
      });
      return ensured;
    }
    if (!state.defaultHostId) {
      state.defaultHostId = resolvedHostId;
    }
    await appendAudit({ kind: "hosts.connect", hostId: resolvedHostId, status: "connected" });
    return {
      ok: true,
      data: {
        defaultHostId: state.defaultHostId,
        host: toLocalHostSnapshot({
          checkedAt: isoNow(),
          offscreenPresent: true,
          reachable: ensured.data?.ready === true,
          health: ensured.data?.health ?? null,
          error: null,
        }),
      },
    };
  }

  async function disconnectHost({ hostId } = {}) {
    const resolvedHostId = resolveHostId(hostId, "hosts.disconnect");
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    if (await hasOffscreenDocument()) {
      if (typeof chromeApi.offscreen?.closeDocument !== "function") {
        return {
          ok: false,
          error: {
            code: "E_RUNTIME",
            message: "chrome.offscreen.closeDocument is required for hosts.disconnect",
          },
        };
      }
      await chromeApi.offscreen.closeDocument();
    }
    state.hostReady = false;
    await appendAudit({ kind: "hosts.disconnect", hostId: resolvedHostId, status: "disconnected" });
    return {
      ok: true,
      data: {
        defaultHostId: state.defaultHostId,
        host: await describeLocalHost(),
      },
    };
  }

  async function setDefaultHost({ hostId } = {}) {
    const resolvedHostId = resolveHostId(hostId, "hosts.set_default");
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    state.defaultHostId = resolvedHostId;
    await appendAudit({
      kind: "hosts.set_default",
      hostId: resolvedHostId,
      status: "default_set",
    });
    return {
      ok: true,
      data: {
        defaultHostId: state.defaultHostId,
        host: await describeLocalHost(),
      },
    };
  }

  async function hostHealth({ hostId } = {}) {
    const resolvedHostId = resolveHostId(hostId, "hosts.health");
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    const host = await describeLocalHost();
    return {
      ok: true,
      data: host,
    };
  }

  async function routeHostSubstrate(kind, payload = {}) {
    const resolvedHostId = resolveHostSubstrateHostId(payload.hostId, kind);
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    const ensured = await ensureHost();
    if (!ensured.ok) {
      return ensured;
    }
    const response = await sendToOffscreen(kind, {
      ...payload,
      hostId: resolvedHostId,
    });
    if (!response.ok) {
      return response;
    }
    return {
      ok: true,
      data: response.data,
    };
  }

  function normalizeScreenshotRequest({ format, quality } = {}) {
    const normalizedFormat = format == null ? "png" : format;
    if (normalizedFormat !== "png" && normalizedFormat !== "jpeg") {
      return invalidPageAutomation("page.screenshot format must be png or jpeg");
    }
    if (quality != null) {
      if (
        typeof quality !== "number" ||
        !Number.isFinite(quality) ||
        quality < 0 ||
        quality > 100
      ) {
        return invalidPageAutomation("page.screenshot quality must be between 0 and 100");
      }
    }
    return {
      format: normalizedFormat,
      ...(normalizedFormat === "jpeg" && quality != null ? { quality } : {}),
    };
  }

  async function captureActiveTabScreenshot({ format, quality } = {}) {
    if (!chromeApi?.tabs?.captureVisibleTab) {
      return {
        ok: false,
        error: {
          code: "E_RUNTIME",
          message: "chrome.tabs.captureVisibleTab is required for page.screenshot",
        },
      };
    }

    const activeTab = await queryActiveTab();
    if (!activeTab) {
      return invalidPageAutomation("page.screenshot requires an active tab with url metadata");
    }

    const screenshotOptions = normalizeScreenshotRequest({ format, quality });
    if (screenshotOptions.ok === false) {
      return screenshotOptions;
    }

    const dataUrl = await chromeApi.tabs.captureVisibleTab(activeTab.windowId, screenshotOptions);

    return {
      ok: true,
      data: {
        dataUrl,
        format: screenshotOptions.format,
      },
    };
  }

  function shouldRecoverHost(response) {
    if (!response?.ok) {
      return "ensure_failed";
    }
    if (response.data?.health?.status === "degraded") {
      return "unhealthy_host";
    }
    return null;
  }

  async function recoverHost(reason) {
    if (
      (await hasOffscreenDocument()) &&
      typeof chromeApi.offscreen?.closeDocument === "function"
    ) {
      await chromeApi.offscreen.closeDocument();
    }
    const documentState = await ensureOffscreenDocument();
    const response = await sendToOffscreen("runner.ensure_host");
    if (!response.ok) {
      return response;
    }
    state.hostRecoveredAt = isoNow();
    state.hostRecoveryReason = reason;
    return {
      ok: true,
      data: {
        ...response.data,
        bridge: buildBridgeState({
          offscreenUrl: documentState.offscreenUrl,
          recovered: true,
          recoveryReason: reason,
        }),
      },
    };
  }

  async function sendToOffscreen(kind, payload = {}) {
    const requestId = payload.requestId ?? nextRequestId();
    const timeout = createTimeoutPromise(kind, requestId, timeoutMs);
    try {
      const response = await Promise.race([
        chromeApi.runtime.sendMessage({
          target: RUNNER_OFFSCREEN_TARGET,
          kind,
          requestId,
          ...payload,
        }),
        timeout.promise,
      ]);
      if (!response || response.ok !== true) {
        state.hostReady = false;
        return (
          response ?? {
            ok: false,
            error: {
              code: "E_RUNTIME",
              message: `Runner bridge unavailable for ${kind}`,
              details: {
                kind,
                requestId,
              },
            },
          }
        );
      }
      state.hostReady = true;
      state.hostLastSeenAt = isoNow();
      return response;
    } catch (error) {
      state.hostReady = false;
      return {
        ok: false,
        error: toBridgeError(error, "E_TIMEOUT"),
      };
    } finally {
      timeout.clear();
    }
  }

  async function ensureHost() {
    const documentState = await ensureOffscreenDocument();
    const response = await sendToOffscreen("runner.ensure_host");
    const recoveryReason = shouldRecoverHost(response);
    if (recoveryReason) {
      return recoverHost(recoveryReason);
    }
    return {
      ok: true,
      data: {
        ...response.data,
        bridge: buildBridgeState({
          offscreenUrl: documentState.offscreenUrl,
          recovered: false,
        }),
      },
    };
  }

  async function invoke(invocation) {
    const ensured = await ensureHost();
    if (!ensured.ok) {
      return ensured;
    }
    return sendToOffscreen("runner.invoke", { invocation });
  }

  async function cancel(targetRequestId) {
    const ensured = await ensureHost();
    if (!ensured.ok) {
      return ensured;
    }
    return sendToOffscreen("runner.cancel", { targetRequestId });
  }

  async function health() {
    const ensured = await ensureHost();
    if (!ensured.ok) {
      return ensured;
    }
    const response = await sendToOffscreen("runner.health");
    if (!response.ok) {
      return response;
    }
    return {
      ok: true,
      data: {
        ...response.data,
        bridge: buildBridgeState({
          recovered: false,
        }),
      },
    };
  }

  async function diagnostics({ tabId, world = "main" } = {}) {
    const capturedAt = isoNow();
    const offscreenPresent = await hasOffscreenDocument();
    const interventionState =
      typeof getRuntimeServices().getInterventionState === "function"
        ? await getRuntimeServices().getInterventionState()
        : emptyInterventionState();

    const runnerResponse = offscreenPresent
      ? await sendToOffscreen("runner.diagnostics")
      : {
          ok: false,
          error: {
            code: "E_RUNTIME",
            message: "Offscreen document is not available",
          },
        };

    const runner = runnerResponse.ok
      ? {
          reachable: true,
          ready: runnerResponse.data?.ready === true,
          health: runnerResponse.data?.health ?? null,
        }
      : {
          reachable: false,
          error: runnerResponse.error ?? {
            code: "E_RUNTIME",
            message: "Runner diagnostics unavailable",
          },
        };

    let site;
    if (effectivePageHookBridge && typeof tabId === "number") {
      try {
        const snapshot = await effectivePageHookBridge.snapshotState({ tabId, world });
        site = {
          status: snapshot == null ? "empty" : "healthy",
          tabId,
          world,
          snapshot,
        };
      } catch (error) {
        site = {
          status: "degraded",
          tabId,
          world,
          error: toBridgeError(error),
        };
      }
    } else if (typeof tabId === "number") {
      site = {
        status: "unavailable",
        tabId,
        world,
      };
    } else {
      site = {
        status: "skipped",
      };
    }

    const degraded =
      !offscreenPresent ||
      !runner.reachable ||
      runner.health?.status === "degraded" ||
      site.status === "degraded";

    return {
      ok: true,
      data: {
        capturedAt,
        status: degraded ? "degraded" : "healthy",
        bridge: buildBridgeState({
          offscreenPresent,
          offscreenPath,
        }),
        interventions: interventionState,
        runner,
        site,
      },
    };
  }

  async function bootstrap({ world = "main" } = {}) {
    const generatedAt = isoNow();
    const activeTab = await queryActiveTab();
    const diagnosticsResult = await diagnostics({
      tabId: activeTab?.id,
      world,
    });
    if (!diagnosticsResult.ok) {
      return diagnosticsResult;
    }

    const runtimeDiagnostics = diagnosticsResult.data;
    const runnerHealth = runtimeDiagnostics.runner?.health;
    const activeTabSummary = activeTab ? toBootstrapActiveTab(activeTab, world) : null;
    const runtimeKernelState =
      sessionId == null && runtimeServices
        ? await getRuntimeServices().getKernelRuntimeState()
        : null;
    const runtimeStatus =
      runtimeDiagnostics.status === "degraded"
        ? activeTabSummary || runtimeDiagnostics.bridge.offscreenPresent
          ? "degraded"
          : "empty"
        : activeTabSummary
          ? "healthy"
          : "empty";
    const runtimeError = runtimeDiagnostics.runner?.error ?? runtimeDiagnostics.site?.error ?? null;

    if (runtimeError) {
      setRuntimeError(runtimeError);
    }
    const effectiveError = getRuntimeError();

    const localHost = toLocalHostSnapshot({
      checkedAt: generatedAt,
      offscreenPresent: runtimeDiagnostics.bridge.offscreenPresent,
      reachable: Boolean(runtimeDiagnostics.runner?.reachable),
      health: runnerHealth ?? null,
      error: runtimeDiagnostics.bridge.offscreenPresent
        ? (runtimeDiagnostics.runner?.error ?? null)
        : null,
    });
    const hostItems = [
      {
        hostId: localHost.hostId,
        kind: localHost.kind,
        connected: localHost.connected,
        state: localHost.state,
        isDefault: localHost.isDefault,
      },
    ];

    const rawSkillsSummary = await resolveMaybe(listSkills);
    const skillEntries = Array.isArray(rawSkillsSummary)
      ? rawSkillsSummary.map((entry) => normalizeSkillSummaryInput(entry)).filter(Boolean)
      : [];
    const resolvedConfigSummary =
      typeof getRuntimeServices().getConfigBootstrapSummary === "function"
        ? await getRuntimeServices().getConfigBootstrapSummary()
        : {
            status: "placeholder",
            fields: [],
            values: {},
            note: "Config control plane is not implemented yet.",
            updatedAt: null,
          };
    const interventionState =
      typeof getRuntimeServices().getInterventionState === "function"
        ? await getRuntimeServices().getInterventionState()
        : emptyInterventionState();

    const summary = bootstrapSummaryBuilder({
      generatedAt,
      runtime: {
        status: runtimeStatus,
        mode: currentMode,
        sessionId: sessionId ?? runtimeKernelState?.session.id ?? null,
        activeTab: activeTabSummary,
        loopState:
          runtimeKernelState?.runState.phase ??
          runnerHealth?.status ??
          (activeTabSummary ? "idle" : null),
        lastError: effectiveError
          ? {
              code: effectiveError.code,
              message: effectiveError.message,
            }
          : null,
        actionCapabilities: {
          total: 0,
          namespaces: [],
        },
      },
      skills: {
        status: skillEntries.length > 0 ? "healthy" : "empty",
        installedCount: skillEntries.length,
        enabledCount: skillEntries.filter((entry) => entry.enabled).length,
        trustedCount: skillEntries.filter((entry) => entry.trusted).length,
        recentChange: skillEntries.find((entry) => entry.recentChange)?.recentChange ?? null,
      },
      hosts: {
        status: hostItems.some((entry) => entry.state === "degraded")
          ? "degraded"
          : hostItems.some((entry) => entry.connected)
            ? "healthy"
            : "empty",
        defaultHostId: state.defaultHostId,
        totalCount: hostItems.length,
        connectedCount: hostItems.filter((entry) => entry.connected).length,
        items: hostItems,
      },
      config: {
        status: resolvedConfigSummary.status,
        fields: resolvedConfigSummary.fields,
        values: resolvedConfigSummary.values,
        note: resolvedConfigSummary.note,
        updatedAt: resolvedConfigSummary.updatedAt,
      },
    });

    summary.runtime.interventions = {
      status: interventionState.status,
      totalCount: interventionState.totalCount,
      activeCount: interventionState.activeCount,
      recentCount: interventionState.recentCount,
      active: interventionState.active.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        trigger: entry.trigger,
        status: entry.status,
        title: entry.title,
        message: entry.message,
        skillId: entry.skillId ?? null,
        action: entry.action ?? null,
        tabId: entry.tabId ?? null,
        requestedAt: entry.requestedAt,
        updatedAt: entry.updatedAt,
        expiresAt: entry.expiresAt,
      })),
    };

    return {
      ok: true,
      data: summary,
    };
  }

  async function route(message) {
    if (!message || message.target !== RUNNER_BACKGROUND_TARGET) {
      return undefined;
    }
    switch (message.kind) {
      case "runner.ensure_host":
        return ensureHost();
      case "runner.invoke":
        return invoke(message.invocation);
      case "runner.cancel":
        return cancel(message.targetRequestId);
      case "runner.health":
        return health();
      case "host.read":
        return routeHostSubstrate("host.read", {
          hostId: message.hostId,
          path: message.path,
        });
      case "host.write":
        return routeHostSubstrate("host.write", {
          hostId: message.hostId,
          path: message.path,
          content: message.content,
        });
      case "host.edit":
        return routeHostSubstrate("host.edit", {
          hostId: message.hostId,
          path: message.path,
          patch: message.patch,
        });
      case "host.exec":
        return routeHostSubstrate("host.exec", {
          hostId: message.hostId,
          command: message.command,
          timeoutMs: message.timeoutMs,
        });
      case "hosts.list":
        return listHosts();
      case "hosts.get":
        return getHost({
          hostId: message.hostId,
        });
      case "hosts.connect":
        return connectHost({
          hostId: message.hostId,
        });
      case "hosts.disconnect":
        return disconnectHost({
          hostId: message.hostId,
        });
      case "hosts.set_default":
        return setDefaultHost({
          hostId: message.hostId,
        });
      case "hosts.health":
        return hostHealth({
          hostId: message.hostId,
        });
      case "config.update":
        return routeRuntimeCapability("config.update", {
          patch: message.patch,
        });
      case "page.press_key":
        return routeRuntimeService(async () => {
          const result = await getRuntimeServices().invokePageAction({
            action: "press_key",
            input: {
              key: message.key,
            },
          });
          return result.result;
        });
      case "page.screenshot":
        return captureActiveTabScreenshot({
          format: message.format,
          quality: message.quality,
        });
      case "tabs.get_active":
        return routeRuntimeCapability("tabs.get_active");
      case "tabs.navigate":
        return routeRuntimeCapability("tabs.navigate", {
          url: message.url,
        });
      case "audit.host":
        return {
          ok: true,
          data: {
            entries: await readAuditTail(message.limit),
          },
        };
      case "audit.intervention":
        return {
          ok: true,
          data: {
            entries:
              typeof getRuntimeServices().readInterventionAudit === "function"
                ? await getRuntimeServices().readInterventionAudit(message.limit)
                : [],
          },
        };
      case "intervention.list":
        return {
          ok: true,
          data: {
            items:
              typeof getRuntimeServices().listInterventions === "function"
                ? await getRuntimeServices().listInterventions()
                : [],
            summary:
              typeof getRuntimeServices().getInterventionState === "function"
                ? await getRuntimeServices().getInterventionState()
                : emptyInterventionState(),
          },
        };
      case "intervention.resolve":
        return {
          ok: true,
          data: {
            intervention: await getRuntimeServices().resolveIntervention({
              id: message.interventionId ?? message.id,
              resolution: message.resolution,
            }),
          },
        };
      case "intervention.cancel":
        return {
          ok: true,
          data: {
            intervention: await getRuntimeServices().cancelIntervention({
              id: message.interventionId ?? message.id,
              reason: message.reason,
            }),
          },
        };
      case "site.runtime.invoke":
        return routeRuntimeService(() => getRuntimeServices().invokeSiteSkill(message));
      case "runtime.diagnostics":
      case "runtime.capture_diagnostics":
        return diagnostics({
          tabId: message.tabId,
          world: message.world,
        });
      case "runtime.clear_error":
        return {
          ok: true,
          data: clearRuntimeError(),
        };
      case "runtime.bootstrap":
        return bootstrap({
          world: message.world,
        });
      default:
        return {
          ok: false,
          error: {
            code: "E_RUNTIME",
            message: `Unknown runner bridge message: ${message.kind}`,
          },
        };
    }
  }

  function registerRuntimeListener() {
    const listener = (message, _sender, sendResponse) => {
      if (!message || message.target !== RUNNER_BACKGROUND_TARGET) {
        return undefined;
      }
      Promise.resolve(route(message))
        .then((response) => {
          sendResponse(response);
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: toBridgeError(error),
          });
        });
      return true;
    };
    chromeApi.runtime.onMessage.addListener(listener);
    return () => {
      chromeApi.runtime.onMessage.removeListener(listener);
    };
  }

  function getBridgeState() {
    return buildBridgeState();
  }

  return {
    ensureOffscreenDocument,
    ensureHost,
    invoke,
    cancel,
    health,
    diagnostics,
    bootstrap,
    getAuditTail,
    clearRuntimeError,
    route,
    registerRuntimeListener,
    getBridgeState,
  };
}

export function startBackgroundRunnerBridge(options = {}) {
  const chromeApi = options.chromeApi ?? globalThis.chrome;
  if (!chromeApi?.runtime?.onMessage || !chromeApi?.offscreen?.createDocument) {
    return null;
  }
  const bridge = createBackgroundRunnerBridge({ chromeApi, ...options });
  const dispose = bridge.registerRuntimeListener();
  if (chromeApi.runtime.onInstalled?.addListener) {
    chromeApi.runtime.onInstalled.addListener(() => {
      console.log("BBL Next MV3 shell installed");
    });
  }
  return {
    bridge,
    dispose,
  };
}

if (globalThis.chrome?.runtime?.onMessage && globalThis.chrome?.offscreen?.createDocument) {
  startBackgroundRunnerBridge();
}
