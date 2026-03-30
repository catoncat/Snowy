export const RUNNER_BACKGROUND_TARGET = "bbl-next.runner.background";
export const RUNNER_OFFSCREEN_TARGET = "bbl-next.runner.offscreen";
export const RUNNER_OFFSCREEN_DOCUMENT_PATH = "src/offscreen.html";
export const RUNNER_OFFSCREEN_REASONS = ["WORKERS"];
export const RUNNER_OFFSCREEN_JUSTIFICATION =
  "Run the offscreen JS runner host for isolated skill execution.";
export const RUNNER_BRIDGE_TIMEOUT_MS = 5_000;
export const PAGE_HOOK_GLOBAL_KEY = "__BBL_NEXT_PAGE_HOOK__";
export const PAGE_HOOK_DEFAULT_FILE = "src/page-hook.js";
export const BOOTSTRAP_RESOURCE_KEYS = ["runtime", "config", "skills", "hosts"];
const LOCAL_HOST_ID = "local";

function toBridgeError(error, fallbackCode = "E_RUNTIME") {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return {
      code: error.code,
      message: error.message,
      details: "details" in error ? error.details : undefined
    };
  }
  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: error.message
    };
  }
  return {
    code: fallbackCode,
    message: "Unknown bridge error",
    details: error
  };
}

function isoNow() {
  return new Date().toISOString();
}

function siteWorldToExecutionWorld(world) {
  return world === "main" ? "MAIN" : "ISOLATED";
}

function unwrapExecuteScriptResult(result) {
  if (Array.isArray(result)) {
    return result[0]?.result;
  }
  return result;
}

function invalidSiteRuntimeInvoke(message) {
  return {
    ok: false,
    error: {
      code: "E_BAD_INPUT",
      message
    }
  };
}

function invalidHostControlPlane(message) {
  return {
    ok: false,
    error: {
      code: "E_BAD_INPUT",
      message
    }
  };
}

function invalidHostSubstrate(message) {
  return {
    ok: false,
    error: {
      code: "E_BAD_INPUT",
      message
    }
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

function defaultBootstrapSummaryBuilder({
  generatedAt,
  resourceKeys,
  runtime,
  skills,
  hosts,
  config
}) {
  const summary = {
    status:
      runtime.status === "degraded" || hosts.status === "degraded"
        ? "degraded"
        : runtime.status === "empty" && skills.status === "empty" && hosts.status === "empty"
          ? "empty"
          : "healthy",
    generatedAt,
    resourceKeys,
    runtime,
    skills,
    hosts,
    config
  };
  return summary;
}

function toCanonicalTab(activeTab) {
  return {
    tabId: activeTab.id,
    url: activeTab.url,
    active: activeTab.active === true
  };
}

function toBootstrapActiveTab(activeTab, world = "main") {
  return {
    tabId: activeTab.id,
    url: activeTab.url,
    title: typeof activeTab.title === "string" ? activeTab.title : undefined,
    world
  };
}

function normalizeSkillSummaryInput(entry) {
  if (typeof entry === "string") {
    return {
      id: entry,
      enabled: false,
      trusted: false,
      recentChange: null
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
          : null
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
          requestId
        }
      });
    }, timeoutMs);
  });
  return {
    promise,
    clear() {
      if (timerId != null) {
        clearTimeout(timerId);
      }
    }
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
  configSummary = undefined
} = {}) {
  let creating = null;
  let requestSequence = 0;
  const AUDIT_MAX_ENTRIES = 64;
  const auditEntries = [];
  const state = {
    defaultHostId: null,
    hostReady: false,
    hostLastSeenAt: undefined,
    hostRecoveredAt: undefined,
    hostRecoveryReason: undefined,
    lastRuntimeError: null,
    lastRuntimeErrorClearedAt: null
  };

  function appendAudit({ kind, hostId, status, error }) {
    const entry = { timestamp: isoNow(), kind, hostId, status };
    if (error) {
      entry.error = typeof error === "string" ? error : error.message ?? String(error);
    }
    auditEntries.push(entry);
    if (auditEntries.length > AUDIT_MAX_ENTRIES) {
      auditEntries.splice(0, auditEntries.length - AUDIT_MAX_ENTRIES);
    }
  }

  function getAuditTail(limit) {
    const max = typeof limit === "number" && limit > 0 ? limit : AUDIT_MAX_ENTRIES;
    return auditEntries.slice(-max);
  }

  function setRuntimeError(error) {
    if (error) {
      state.lastRuntimeError = {
        code: error.code ?? "E_RUNTIME",
        message: error.message ?? String(error),
        capturedAt: isoNow()
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

  async function hasOffscreenDocument() {
    const offscreenUrl = chromeApi.runtime.getURL(offscreenPath);
    if (typeof chromeApi.runtime.getContexts === "function") {
      const contexts = await chromeApi.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [offscreenUrl]
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
        offscreenUrl
      };
    }
    if (!creating) {
      creating = chromeApi.offscreen.createDocument({
        url: offscreenPath,
        reasons,
        justification
      });
    }
    try {
      await creating;
      return {
        created: true,
        offscreenUrl
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
      ...extra
    };
  }

  async function queryActiveTab() {
    if (!chromeApi?.tabs?.query) {
      return null;
    }
    const activeTabs = await chromeApi.tabs.query({
      active: true,
      lastFocusedWindow: true
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
        error: null
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
          message: "Runner diagnostics unavailable"
        }
      };
    }

    return {
      checkedAt,
      offscreenPresent,
      reachable: response.data?.ready === true,
      health: response.data?.health ?? null,
      error: null
    };
  }

  function toLocalHostSnapshot(localState) {
    const connected = localState.reachable === true;
    const health = {
      status: toExecutionHostHealthStatus(localState),
      ...(localState.checkedAt ? { checkedAt: localState.checkedAt } : {})
    };
    const snapshot = {
      hostId: LOCAL_HOST_ID,
      kind: "local",
      connected,
      state: toExecutionHostState(localState),
      isDefault: state.defaultHostId === LOCAL_HOST_ID,
      health
    };
    if (localState.error) {
      return {
        ...snapshot,
        error: localState.error
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
        items: [await describeLocalHost()]
      }
    };
  }

  async function getHost({ hostId } = {}) {
    const resolvedHostId = resolveHostId(hostId, "hosts.get");
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    return {
      ok: true,
      data: await describeLocalHost()
    };
  }

  async function connectHost({ hostId } = {}) {
    const resolvedHostId = resolveHostId(hostId, "hosts.connect");
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    const ensured = await ensureHost();
    if (!ensured.ok) {
      appendAudit({ kind: "hosts.connect", hostId: resolvedHostId, status: "failed", error: ensured.error?.message });
      return ensured;
    }
    if (!state.defaultHostId) {
      state.defaultHostId = resolvedHostId;
    }
    appendAudit({ kind: "hosts.connect", hostId: resolvedHostId, status: "connected" });
    return {
      ok: true,
      data: {
        defaultHostId: state.defaultHostId,
        host: toLocalHostSnapshot({
          checkedAt: isoNow(),
          offscreenPresent: true,
          reachable: ensured.data?.ready === true,
          health: ensured.data?.health ?? null,
          error: null
        })
      }
    };
  }

  async function disconnectHost({ hostId } = {}) {
    const resolvedHostId = resolveHostId(hostId, "hosts.disconnect");
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    if ((await hasOffscreenDocument())) {
      if (typeof chromeApi.offscreen?.closeDocument !== "function") {
        return {
          ok: false,
          error: {
            code: "E_RUNTIME",
            message: "chrome.offscreen.closeDocument is required for hosts.disconnect"
          }
        };
      }
      await chromeApi.offscreen.closeDocument();
    }
    state.hostReady = false;
    appendAudit({ kind: "hosts.disconnect", hostId: resolvedHostId, status: "disconnected" });
    return {
      ok: true,
      data: {
        defaultHostId: state.defaultHostId,
        host: await describeLocalHost()
      }
    };
  }

  async function setDefaultHost({ hostId } = {}) {
    const resolvedHostId = resolveHostId(hostId, "hosts.set_default");
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    state.defaultHostId = resolvedHostId;
    appendAudit({ kind: "hosts.set_default", hostId: resolvedHostId, status: "default_set" });
    return {
      ok: true,
      data: {
        defaultHostId: state.defaultHostId,
        host: await describeLocalHost()
      }
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
      data: host
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
      hostId: resolvedHostId
    });
    if (!response.ok) {
      return response;
    }
    return {
      ok: true,
      data: response.data
    };
  }

  async function resolveActiveTabMetadata(requestedTab) {
    if (!requestedTab || typeof requestedTab.tabId !== "number") {
      return invalidSiteRuntimeInvoke("Site runtime invoke requires tab metadata");
    }
    if (!chromeApi?.tabs?.query) {
      return {
        ok: false,
        error: {
          code: "E_RUNTIME",
          message: "chrome.tabs.query is required for active tab metadata"
        }
      };
    }

    const activeTab = await queryActiveTab();
    if (!activeTab) {
      return invalidSiteRuntimeInvoke("Site runtime invoke requires an active tab");
    }
    if (activeTab.id !== requestedTab.tabId) {
      return invalidSiteRuntimeInvoke("Site runtime invoke target must be the active tab");
    }
    if (typeof activeTab.url !== "string") {
      return invalidSiteRuntimeInvoke("Site runtime invoke requires active tab url metadata");
    }

    return {
      ok: true,
      data: toCanonicalTab(activeTab)
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
    if ((await hasOffscreenDocument()) && typeof chromeApi.offscreen?.closeDocument === "function") {
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
          recoveryReason: reason
        })
      }
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
          ...payload
        }),
        timeout.promise
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
                requestId
              }
            }
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
        error: toBridgeError(error, "E_TIMEOUT")
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
          recovered: false
        })
      }
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
          recovered: false
        })
      }
    };
  }

  async function invokeSiteRuntime({
    skillId,
    action,
    tab,
    input = {},
    ctx = {},
    plan,
    module,
    verifier
  } = {}) {
    if (!plan || !Array.isArray(plan.steps)) {
      return invalidSiteRuntimeInvoke("Site runtime invoke requires an injection plan");
    }
    if (!module || typeof module.id !== "string" || typeof module.source !== "string") {
      return invalidSiteRuntimeInvoke("Site runtime invoke requires a runner module");
    }
    const resolvedTabResponse = await resolveActiveTabMetadata(tab);
    if (!resolvedTabResponse.ok) {
      return resolvedTabResponse;
    }
    const resolvedTab = resolvedTabResponse.data;

    const trace = [`match:${skillId}`];
    const site = {
      plan,
      installations: []
    };

    if (plan.steps.length > 0) {
      if (!pageHookBridge) {
        return {
          ok: false,
          error: {
            code: "E_RUNTIME",
            message: "Page hook bridge is not configured"
          }
        };
      }
      trace.push(`plan:${plan.steps.length}_steps`);
      for (const step of plan.steps) {
        const installation = await pageHookBridge.install(step, resolvedTab);
        site.installations.push({
          step,
          result: installation
        });
        trace.push(`install:${step.world}:${step.scriptId}`);
      }
    }

    const runnerResponse = await invoke({
      module,
      input,
      ctx: {
        ...ctx,
        tab: resolvedTab,
        site
      }
    });
    if (!runnerResponse.ok) {
      return runnerResponse;
    }
    if (runnerResponse.data?.ok !== true) {
      return {
        ok: false,
        error: runnerResponse.data?.error ?? {
          code: "E_RUNTIME",
          message: "Runner invocation failed"
        }
      };
    }

    let result = runnerResponse.data.result?.result;
    const targetInstallation = site.installations[site.installations.length - 1];
    if (targetInstallation && pageHookBridge?.invoke) {
      result = await pageHookBridge.invoke({
        installation: targetInstallation,
        action,
        input: result,
        tab: resolvedTab,
        ctx: {
          ...ctx,
          tab: resolvedTab,
          site
        }
      });
    }
    trace.push(`invoke:${action}`);

    let verified = true;
    if (verifier && targetInstallation && pageHookBridge?.verify) {
      verified = Boolean(
        await pageHookBridge.verify({
          installation: targetInstallation,
          action,
          result,
          tab: resolvedTab
        })
      );
      trace.push(`verify:${verifier}`);
      if (!verified) {
        return {
          ok: false,
          error: {
            code: "E_VERIFY_FAILED",
            message: `Verifier failed for ${skillId}.${action}`
          }
        };
      }
    }

    return {
      ok: true,
      data: {
        result,
        verified,
        trace
      }
    };
  }

  async function diagnostics({
    tabId,
    world = "main"
  } = {}) {
    const capturedAt = isoNow();
    const offscreenPresent = await hasOffscreenDocument();

    const runnerResponse = offscreenPresent
      ? await sendToOffscreen("runner.diagnostics")
      : {
          ok: false,
          error: {
            code: "E_RUNTIME",
            message: "Offscreen document is not available"
          }
        };

    const runner = runnerResponse.ok
      ? {
          reachable: true,
          ready: runnerResponse.data?.ready === true,
          health: runnerResponse.data?.health ?? null
        }
      : {
          reachable: false,
          error: runnerResponse.error ?? {
            code: "E_RUNTIME",
            message: "Runner diagnostics unavailable"
          }
        };

    let site;
    if (pageHookBridge && typeof tabId === "number") {
      try {
        const snapshot = await pageHookBridge.snapshotState({ tabId, world });
        site = {
          status: snapshot == null ? "empty" : "healthy",
          tabId,
          world,
          snapshot
        };
      } catch (error) {
        site = {
          status: "degraded",
          tabId,
          world,
          error: toBridgeError(error)
        };
      }
    } else if (typeof tabId === "number") {
      site = {
        status: "unavailable",
        tabId,
        world
      };
    } else {
      site = {
        status: "skipped"
      };
    }

    const degraded =
      !offscreenPresent
      || !runner.reachable
      || runner.health?.status === "degraded"
      || site.status === "degraded";

    return {
      ok: true,
      data: {
        capturedAt,
        status: degraded ? "degraded" : "healthy",
        bridge: buildBridgeState({
          offscreenPresent,
          offscreenPath
        }),
        runner,
        site
      }
    };
  }

  async function bootstrap({
    world = "main"
  } = {}) {
    const generatedAt = isoNow();
    const activeTab = await queryActiveTab();
    const diagnosticsResult = await diagnostics({
      tabId: activeTab?.id,
      world
    });
    if (!diagnosticsResult.ok) {
      return diagnosticsResult;
    }

    const runtimeDiagnostics = diagnosticsResult.data;
    const runnerHealth = runtimeDiagnostics.runner?.health;
    const activeTabSummary = activeTab ? toBootstrapActiveTab(activeTab, world) : null;
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
      error:
        runtimeDiagnostics.bridge.offscreenPresent
          ? runtimeDiagnostics.runner?.error ?? null
          : null
    });
    const hostItems = [
      {
        hostId: localHost.hostId,
        kind: localHost.kind,
        connected: localHost.connected,
        state: localHost.state,
        isDefault: localHost.isDefault
      }
    ];

    const rawSkillsSummary = await resolveMaybe(listSkills);
    const skillEntries = Array.isArray(rawSkillsSummary)
      ? rawSkillsSummary
          .map((entry) => normalizeSkillSummaryInput(entry))
          .filter(Boolean)
      : [];
    const resolvedConfigSummary = (await resolveMaybe(configSummary)) ?? {};

    return {
      ok: true,
      data: bootstrapSummaryBuilder({
        generatedAt,
        resourceKeys: BOOTSTRAP_RESOURCE_KEYS,
        runtime: {
          status: runtimeStatus,
          mode: currentMode,
          sessionId,
          activeTab: activeTabSummary,
          loopState: runnerHealth?.status ?? (activeTabSummary ? "idle" : null),
          lastError: effectiveError
            ? {
                code: effectiveError.code,
                message: effectiveError.message
              }
            : null,
          actionCapabilities: {
            total: 0,
            namespaces: []
          }
        },
        skills: {
          status: skillEntries.length > 0 ? "healthy" : "empty",
          installedCount: skillEntries.length,
          enabledCount: skillEntries.filter((entry) => entry.enabled).length,
          trustedCount: skillEntries.filter((entry) => entry.trusted).length,
          recentChange: skillEntries.find((entry) => entry.recentChange)?.recentChange ?? null
        },
        hosts: {
          status:
            hostItems.some((entry) => entry.state === "degraded")
              ? "degraded"
              : hostItems.some((entry) => entry.connected)
                ? "healthy"
                : "empty",
          defaultHostId: state.defaultHostId,
          totalCount: hostItems.length,
          connectedCount: hostItems.filter((entry) => entry.connected).length,
          items: hostItems
        },
        config: {
          status: resolvedConfigSummary.status ?? "placeholder",
          fields:
            resolvedConfigSummary.fields
            ?? ["model", "automation", "permissions", "preferences"],
          note:
            resolvedConfigSummary.note ?? "Config control plane is not implemented yet."
        }
      })
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
          path: message.path
        });
      case "host.write":
        return routeHostSubstrate("host.write", {
          hostId: message.hostId,
          path: message.path,
          content: message.content
        });
      case "host.edit":
        return routeHostSubstrate("host.edit", {
          hostId: message.hostId,
          path: message.path,
          patch: message.patch
        });
      case "host.exec":
        return routeHostSubstrate("host.exec", {
          hostId: message.hostId,
          command: message.command,
          timeoutMs: message.timeoutMs
        });
      case "hosts.list":
        return listHosts();
      case "hosts.get":
        return getHost({
          hostId: message.hostId
        });
      case "hosts.connect":
        return connectHost({
          hostId: message.hostId
        });
      case "hosts.disconnect":
        return disconnectHost({
          hostId: message.hostId
        });
      case "hosts.set_default":
        return setDefaultHost({
          hostId: message.hostId
        });
      case "hosts.health":
        return hostHealth({
          hostId: message.hostId
        });
      case "audit.host":
        return {
          ok: true,
          data: {
            entries: getAuditTail(message.limit)
          }
        };
      case "site.runtime.invoke":
        return invokeSiteRuntime(message);
      case "runtime.diagnostics":
      case "runtime.capture_diagnostics":
        return diagnostics({
          tabId: message.tabId,
          world: message.world
        });
      case "runtime.clear_error":
        return {
          ok: true,
          data: clearRuntimeError()
        };
      case "runtime.bootstrap":
        return bootstrap({
          world: message.world
        });
      default:
        return {
          ok: false,
          error: {
            code: "E_RUNTIME",
            message: `Unknown runner bridge message: ${message.kind}`
          }
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
            error: toBridgeError(error)
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
    invokeSiteRuntime,
    cancel,
    health,
    diagnostics,
    bootstrap,
    getAuditTail,
    clearRuntimeError,
    route,
    registerRuntimeListener,
    getBridgeState
  };
}

export function createPageHookBridge({
  chromeApi = globalThis.chrome,
  hookKey = PAGE_HOOK_GLOBAL_KEY,
  defaultFile = PAGE_HOOK_DEFAULT_FILE
} = {}) {
  if (!chromeApi?.scripting?.executeScript) {
    throw new Error("chrome.scripting.executeScript is required for page hook injection");
  }

  async function executeInTab({ tabId, world, files, func, args = [] }) {
    const executionResult = await chromeApi.scripting.executeScript({
      target: { tabId },
      world: siteWorldToExecutionWorld(world),
      ...(files ? { files } : { func, args })
    });
    return unwrapExecuteScriptResult(executionResult);
  }

  function getInstallationId(installation) {
    return installation?.result?.installationId;
  }

  async function install(step, tab) {
    const jsPath = step.jsPath ?? defaultFile;
    await executeInTab({
      tabId: tab.tabId,
      world: step.world,
      files: [jsPath]
    });
    return executeInTab({
      tabId: tab.tabId,
      world: step.world,
      func: (installedHookKey, installedStep, installedTab) => {
        const api = globalThis[installedHookKey];
        if (!api || typeof api.install !== "function") {
          throw new Error(`Page hook ${installedHookKey} is not installed`);
        }
        return api.install(installedStep, installedTab);
      },
      args: [hookKey, { ...step, jsPath }, tab]
    });
  }

  async function invoke({ installation, action, input, tab, ctx }) {
    const installationId = getInstallationId(installation);
    if (typeof installationId !== "string") {
      throw new Error("Page hook installation is missing installationId");
    }
    return executeInTab({
      tabId: tab.tabId,
      world: installation.step.world,
      func: (installedHookKey, installedId, installedAction, installedInput, installedCtx) => {
        const api = globalThis[installedHookKey];
        if (!api || typeof api.invoke !== "function") {
          throw new Error(`Page hook ${installedHookKey} does not expose invoke()`);
        }
        return api.invoke(installedId, installedAction, installedInput, installedCtx);
      },
      args: [hookKey, installationId, action, input, ctx]
    });
  }

  async function verify({ installation, action, result, tab }) {
    const installationId = getInstallationId(installation);
    if (typeof installationId !== "string") {
      throw new Error("Page hook installation is missing installationId");
    }
    return Boolean(
      await executeInTab({
        tabId: tab.tabId,
        world: installation.step.world,
        func: (installedHookKey, installedId, installedAction, installedResult) => {
          const api = globalThis[installedHookKey];
          if (!api || typeof api.verify !== "function") {
            throw new Error(`Page hook ${installedHookKey} does not expose verify()`);
          }
          return api.verify(installedId, installedAction, installedResult);
        },
        args: [hookKey, installationId, action, result]
      })
    );
  }

  async function snapshotState({ tabId, world = "main" }) {
    return executeInTab({
      tabId,
      world,
      func: (installedHookKey) => {
        const api = globalThis[installedHookKey];
        return api?.state ?? null;
      },
      args: [hookKey]
    });
  }

  return {
    install,
    invoke,
    verify,
    snapshotState
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
    dispose
  };
}

if (globalThis.chrome?.runtime?.onMessage && globalThis.chrome?.offscreen?.createDocument) {
  startBackgroundRunnerBridge();
}
