export const RUNNER_BACKGROUND_TARGET = "bbl-next.runner.background";
export const RUNNER_OFFSCREEN_TARGET = "bbl-next.runner.offscreen";
export const RUNNER_OFFSCREEN_DOCUMENT_PATH = "src/offscreen.html";
export const RUNNER_OFFSCREEN_REASONS = ["WORKERS"];
export const RUNNER_OFFSCREEN_JUSTIFICATION =
  "Run the offscreen JS runner host for isolated skill execution.";
export const RUNNER_BRIDGE_TIMEOUT_MS = 5_000;
export const PAGE_HOOK_GLOBAL_KEY = "__BBL_NEXT_PAGE_HOOK__";
export const PAGE_HOOK_DEFAULT_FILE = "src/page-hook.js";

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

function defaultBootstrapSummaryBuilder({
  generatedAt,
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
  bootstrapSummaryBuilder = defaultBootstrapSummaryBuilder
} = {}) {
  let creating = null;
  let requestSequence = 0;
  const state = {
    hostReady: false,
    hostLastSeenAt: undefined,
    hostRecoveredAt: undefined,
    hostRecoveryReason: undefined
  };

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

    const activeTabs = await chromeApi.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    const activeTab = Array.isArray(activeTabs) ? activeTabs[0] : undefined;

    if (!activeTab || typeof activeTab.id !== "number") {
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
    tab,
    world = "main",
    skillsSummary,
    configSummary
  } = {}) {
    const generatedAt = isoNow();
    const diagnosticsResult = await diagnostics({
      tabId: typeof tab?.tabId === "number" ? tab.tabId : undefined,
      world
    });
    if (!diagnosticsResult.ok) {
      return diagnosticsResult;
    }

    const runtimeDiagnostics = diagnosticsResult.data;
    const runnerHealth = runtimeDiagnostics.runner?.health;
    const hasActiveTab = tab?.active === true && typeof tab?.tabId === "number" && typeof tab?.url === "string";
    const runtimeStatus =
      runtimeDiagnostics.status === "degraded"
        ? hasActiveTab || runtimeDiagnostics.bridge.offscreenPresent
          ? "degraded"
          : "empty"
        : hasActiveTab
          ? "healthy"
          : "empty";
    const runtimeError = runtimeDiagnostics.runner?.error ?? runtimeDiagnostics.site?.error ?? null;

    const hostItems = runtimeDiagnostics.bridge.offscreenPresent || runtimeDiagnostics.runner?.reachable
      ? [
          {
            hostId: "local",
            kind: "local",
            connected: Boolean(runtimeDiagnostics.runner?.reachable),
            state: runnerHealth?.status ?? (runtimeDiagnostics.runner?.reachable ? "idle" : "unavailable"),
            isDefault: true
          }
        ]
      : [];

    return {
      ok: true,
      data: bootstrapSummaryBuilder({
        generatedAt,
        runtime: {
          status: runtimeStatus,
          mode: "active-tab-only",
          activeTab: hasActiveTab
            ? {
                tabId: tab.tabId,
                url: tab.url,
                title: tab.title,
                world
              }
            : null,
          lastError: runtimeError
            ? {
                code: runtimeError.code,
                message: runtimeError.message
              }
            : null,
          actionCapabilities: {
            total: 0,
            namespaces: []
          }
        },
        skills: {
          status: (skillsSummary?.installedCount ?? 0) > 0 ? "healthy" : "empty",
          installedCount: skillsSummary?.installedCount ?? 0,
          enabledCount: skillsSummary?.enabledCount ?? 0,
          trustedCount: skillsSummary?.trustedCount ?? 0,
          recentChange: skillsSummary?.recentChange ?? null
        },
        hosts: {
          status:
            hostItems.length === 0
              ? "empty"
              : hostItems.some((entry) => entry.state === "degraded")
                ? "degraded"
                : "healthy",
          defaultHostId: hostItems.length > 0 ? "local" : null,
          totalCount: hostItems.length,
          connectedCount: hostItems.filter((entry) => entry.connected).length,
          items: hostItems
        },
        config: {
          status: configSummary?.status ?? "placeholder",
          fields: configSummary?.fields ?? ["model", "automation", "permissions", "preferences"],
          note: configSummary?.note ?? "Config control plane is not implemented yet."
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
      case "site.runtime.invoke":
        return invokeSiteRuntime(message);
      case "runtime.diagnostics":
        return diagnostics({
          tabId: message.tabId,
          world: message.world
        });
      case "runtime.bootstrap":
        return bootstrap({
          tab: message.tab,
          world: message.world,
          skillsSummary: message.skillsSummary,
          configSummary: message.configSummary
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
