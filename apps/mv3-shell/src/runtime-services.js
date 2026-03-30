import { BrowserVfs } from "@bbl-next/browser-vfs";
import { CapabilityError } from "@bbl-next/contracts";
import {
  BUILTIN_CAPABILITIES,
  CapabilityRegistry,
  FamilyProviderRegistry,
  createConfigCapabilityProvider,
  createConfigControlPlane,
  createTabsCapabilityProvider,
  dispatchCapabilityCall,
} from "@bbl-next/core";
import { InMemorySessionStorage, VfsSessionStorage, createKernel } from "@bbl-next/kernel";
import { invokeSingleActionSiteSkill } from "@bbl-next/site-runtime";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const DEFAULT_INTERVENTION_TIMEOUT_MS = 5 * 60 * 1000;

function createBridgeRunnerHost({ invokeRunner }) {
  return {
    async invoke(request) {
      const response = await invokeRunner(request);
      if (!response.ok) {
        const error = response.error ?? {
          code: "E_RUNTIME",
          message: "Runner bridge unavailable",
        };
        throw new CapabilityError(error.code, error.message, error.details);
      }
      if (response.data?.ok !== true) {
        const error = response.data?.error ?? {
          code: "E_RUNTIME",
          message: "Runner invocation failed",
        };
        throw new CapabilityError(error.code, error.message, error.details);
      }
      return response.data.result;
    },
  };
}

function createSiteRuntimeInstaller(pageHookBridge) {
  if (!pageHookBridge) {
    return undefined;
  }
  return {
    install(step, currentTab) {
      return pageHookBridge.install(step, currentTab);
    },
    invoke(request) {
      return pageHookBridge.invoke(request);
    },
    verify(request) {
      return pageHookBridge.verify(request);
    },
  };
}

function toKernelStepFailure(error) {
  const code = error instanceof CapabilityError ? error.code : "E_RUNTIME";
  const message = error instanceof Error ? error.message : String(error);
  const details = error instanceof CapabilityError ? error.details : undefined;
  return {
    ok: false,
    error: message,
    retryable: code === "E_RUNTIME",
    data: {
      code,
      details,
    },
  };
}

function unwrapKernelStepResult(executed, fallbackMessage) {
  if (executed.result?.ok) {
    return executed.result.data;
  }

  const failure = isPlainObject(executed.result?.data) ? executed.result.data : {};
  throw new CapabilityError(
    typeof failure.code === "string" ? failure.code : "E_RUNTIME",
    executed.result?.error ?? fallbackMessage,
    failure.details,
  );
}

function activateKernelRun(kernel, sessionId) {
  const state = kernel.getRunState(sessionId);
  switch (state.phase) {
    case "idle":
      kernel.startRun(sessionId);
      break;
    case "paused":
      kernel.resume(sessionId);
      break;
    case "running":
      break;
    default:
      throw new CapabilityError("E_RUNTIME", `Kernel run is unavailable while ${state.phase}`);
  }
}

function settleKernelRun(kernel, sessionId) {
  if (kernel.getRunState(sessionId).phase === "running") {
    kernel.pause(sessionId);
  }
}

async function createSessionStorage({ sessionStorage, workspaceId }) {
  if (sessionStorage) {
    return sessionStorage;
  }
  if (typeof indexedDB === "undefined") {
    return new InMemorySessionStorage();
  }
  const vfs = await BrowserVfs.create({ workspaceId });
  return new VfsSessionStorage(vfs);
}

function toCanonicalTab(activeTab) {
  return {
    tabId: activeTab.id,
    url: activeTab.url,
    active: activeTab.active === true,
    title: typeof activeTab.title === "string" ? activeTab.title : undefined,
  };
}

async function queryActiveTab(chromeApi) {
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

async function requireActiveTab(chromeApi, actionKind) {
  const activeTab = await queryActiveTab(chromeApi);
  if (!activeTab) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      `${actionKind} requires an active tab with url metadata`,
    );
  }
  return activeTab;
}

function createChromeTabsTransport({ chromeApi }) {
  return {
    async list() {
      if (!chromeApi?.tabs?.query) {
        throw new CapabilityError("E_RUNTIME", "chrome.tabs.query is required for tabs.list");
      }
      const tabs = await chromeApi.tabs.query({});
      return Array.isArray(tabs)
        ? tabs
            .filter((tab) => typeof tab?.id === "number" && typeof tab?.url === "string")
            .map((tab) => toCanonicalTab(tab))
        : [];
    },
    async getActive(actionKind) {
      return toCanonicalTab(await requireActiveTab(chromeApi, actionKind));
    },
    async navigate(url) {
      if (!chromeApi?.tabs?.update) {
        throw new CapabilityError("E_RUNTIME", "chrome.tabs.update is required for tabs.navigate");
      }
      const activeTab = await requireActiveTab(chromeApi, "tabs.navigate");
      const updatedTab = await chromeApi.tabs.update(activeTab.id, {
        url,
      });

      return toCanonicalTab(
        updatedTab && typeof updatedTab.id === "number" && typeof updatedTab.url === "string"
          ? updatedTab
          : {
              ...activeTab,
              url,
              active: true,
            },
      );
    },
  };
}

async function resolveRuntimeInvokeTab(chromeApi, requestedTab, actionKind) {
  if (!requestedTab || typeof requestedTab.tabId !== "number") {
    throw new CapabilityError("E_BAD_INPUT", `${actionKind} requires tab metadata`);
  }

  const activeTab = await requireActiveTab(chromeApi, actionKind);
  if (activeTab.id !== requestedTab.tabId) {
    throw new CapabilityError("E_BAD_INPUT", `${actionKind} target must be the active tab`);
  }

  return toCanonicalTab(activeTab);
}

function buildPageActionRequest({ action, input, tab, scriptPath }) {
  switch (action) {
    case "press_key":
      if (!isPlainObject(input) || typeof input.key !== "string" || input.key.length === 0) {
        throw new CapabilityError("E_BAD_INPUT", "page.press_key requires a non-empty key");
      }
      return {
        skillId: "bbl.page",
        action: "press_key",
        tab,
        input: {
          key: input.key,
        },
        plan: {
          skillId: "bbl.page",
          action: "press_key",
          steps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.page",
              jsPath: scriptPath,
              runAt: "document_idle",
            },
          ],
        },
        module: {
          id: "bbl.page.press_key",
          source: "exports.default = async ({ input }) => ({ key: input.key });",
        },
        verifier: "page_press_key",
      };
    default:
      throw new CapabilityError("E_BAD_INPUT", `Unsupported page action: ${action}`);
  }
}

export function createBackgroundRuntimeServices({
  invokeRunner,
  pageHookBridge,
  chromeApi = globalThis.chrome,
  sessionStorage = undefined,
  llmAdapter = undefined,
  configSummary = undefined,
  workspaceId = "mv3-shell",
  interventionTimeoutMs = DEFAULT_INTERVENTION_TIMEOUT_MS,
  pageHookScriptPath = "src/page-hook.js",
} = {}) {
  let servicesPromise = null;
  let sessionPromise = null;

  async function ensureServices() {
    if (!servicesPromise) {
      servicesPromise = (async () => {
        const storage = await createSessionStorage({
          sessionStorage,
          workspaceId,
        });
        const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
        const providers = new FamilyProviderRegistry();
        const configControlPlane = createConfigControlPlane({ summary: configSummary });

        providers.register(createTabsCapabilityProvider(createChromeTabsTransport({ chromeApi })));
        providers.register(createConfigCapabilityProvider(configControlPlane));

        const runnerHost = createBridgeRunnerHost({ invokeRunner });
        let kernelRef = null;
        const executeRunnerStep = async ({ step }) => {
          try {
            const invocation = await runnerHost.invoke({
              module: step.module,
              input: step.input,
              ctx: step.ctx ?? {},
              ...(typeof step.timeoutMs === "number" ? { timeoutMs: step.timeoutMs } : {}),
            });
            return {
              ok: true,
              data: invocation.result,
            };
          } catch (error) {
            return toKernelStepFailure(error);
          }
        };
        const executeSiteStep = async ({ sessionId, step }) => {
          if (!kernelRef) {
            return toKernelStepFailure(
              new CapabilityError("E_RUNTIME", "Kernel site executor is not ready"),
            );
          }
          if (!isPlainObject(step.input)) {
            return toKernelStepFailure(
              new CapabilityError("E_BAD_INPUT", "Kernel site step requires structured input"),
            );
          }

          const payload = step.input;
          if (
            !payload.plan ||
            !Array.isArray(payload.plan.steps) ||
            !payload.module ||
            typeof payload.module.id !== "string" ||
            typeof payload.module.source !== "string"
          ) {
            return toKernelStepFailure(
              new CapabilityError("E_BAD_INPUT", "Kernel site step requires plan and module"),
            );
          }

          try {
            const result = await invokeSingleActionSiteSkill({
              request: {
                skillId: step.skillId,
                action: step.action,
                tab: step.tab,
                input: payload.input ?? {},
                ctx: isPlainObject(payload.ctx) ? payload.ctx : {},
                plan: payload.plan,
                module: payload.module,
                ...(typeof payload.verifier === "string" ? { verifier: payload.verifier } : {}),
                ...(isPlainObject(payload.intervention)
                  ? { intervention: payload.intervention }
                  : {}),
                executeRunner: async (request) => {
                  const runnerExecuted = await kernelRef.executeStep(sessionId, {
                    kind: "runner",
                    capabilityId: step.capabilityId
                      ? `${step.capabilityId}.runner`
                      : `site.runner.${step.skillId}.${step.action}`,
                    module: request.module,
                    input: request.input,
                    ctx: request.ctx,
                  });
                  return unwrapKernelStepResult(
                    runnerExecuted,
                    `Kernel runner step failed for ${step.skillId}.${step.action}`,
                  );
                },
              },
              runnerHost,
              ...(pageHookBridge
                ? {
                    installer: createSiteRuntimeInstaller(pageHookBridge),
                  }
                : {}),
            });

            return {
              ok: true,
              data: result,
              verified: result.verified,
            };
          } catch (error) {
            return toKernelStepFailure(error);
          }
        };
        const kernel = createKernel({
          storage,
          llm: llmAdapter ?? {
            complete: async () => "",
          },
          registry,
          providers,
          executeRunnerStep,
          executeSiteStep,
        });
        kernelRef = kernel;

        return {
          configControlPlane,
          storage,
          registry,
          providers,
          runnerHost,
          kernel,
        };
      })();
    }
    return servicesPromise;
  }

  async function ensureSession() {
    if (!sessionPromise) {
      sessionPromise = ensureServices().then(({ kernel }) =>
        kernel.createSession({
          title: "mv3-shell runtime session",
        }),
      );
    }
    return sessionPromise;
  }

  async function dispatchCapability({
    capabilityId,
    input = {},
    skillId = "mv3-shell.background",
    permissions = ["*"],
  }) {
    const [{ registry, providers }, session] = await Promise.all([
      ensureServices(),
      ensureSession(),
    ]);
    return dispatchCapabilityCall({
      registry,
      providers,
      sessionId: session.id,
      capabilityId,
      input,
      skillId,
      permissions,
    });
  }

  async function getKernelRuntimeState() {
    const [{ kernel }, session] = await Promise.all([ensureServices(), ensureSession()]);
    return {
      session,
      runState: kernel.getRunState(session.id),
    };
  }

  async function getConfigBootstrapSummary() {
    const { configControlPlane } = await ensureServices();
    return configControlPlane.getBootstrapSummary();
  }

  async function getInterventionState() {
    if (!sessionPromise) {
      return {
        sessionId: null,
        status: "empty",
        totalCount: 0,
        activeCount: 0,
        recentCount: 0,
        active: [],
      };
    }
    const [{ kernel }, session] = await Promise.all([ensureServices(), sessionPromise]);
    const summary = kernel.getInterventionSummary({
      sessionId: session.id,
    });
    return {
      sessionId: session.id,
      ...summary,
    };
  }

  async function listInterventions() {
    if (!sessionPromise) {
      return [];
    }
    const [{ kernel }, session] = await Promise.all([ensureServices(), sessionPromise]);
    return kernel.listInterventions({
      sessionId: session.id,
    });
  }

  async function readInterventionAudit(limit) {
    if (!sessionPromise) {
      return [];
    }
    const [{ kernel }, session] = await Promise.all([ensureServices(), sessionPromise]);
    return kernel.readInterventionAudit({
      sessionId: session.id,
      limit,
    });
  }

  async function resolveIntervention({ id, resolution } = {}) {
    if (typeof id !== "string" || !id.trim()) {
      throw new CapabilityError("E_BAD_INPUT", "intervention.resolve requires a request id");
    }
    const { kernel } = await ensureServices();
    return kernel.resolveIntervention(id, isPlainObject(resolution) ? resolution : undefined);
  }

  async function cancelIntervention({ id, reason } = {}) {
    if (typeof id !== "string" || !id.trim()) {
      throw new CapabilityError("E_BAD_INPUT", "intervention.cancel requires a request id");
    }
    const { kernel } = await ensureServices();
    return kernel.cancelIntervention(
      id,
      typeof reason === "string" && reason.trim() ? { reason: reason.trim() } : undefined,
    );
  }

  async function invokeSiteSkill({
    skillId,
    action,
    tab,
    input = {},
    ctx = {},
    plan,
    module,
    verifier,
    intervention,
  }) {
    if (!plan || !Array.isArray(plan.steps)) {
      throw new CapabilityError("E_BAD_INPUT", "Site runtime invoke requires an injection plan");
    }
    if (!module || typeof module.id !== "string" || typeof module.source !== "string") {
      throw new CapabilityError("E_BAD_INPUT", "Site runtime invoke requires a runner module");
    }
    if (plan.steps.length > 0 && !pageHookBridge) {
      throw new CapabilityError("E_RUNTIME", "Page hook bridge is not configured");
    }

    const [{ kernel }, session] = await Promise.all([ensureServices(), ensureSession()]);
    const resolvedTab = await resolveRuntimeInvokeTab(chromeApi, tab, "Site runtime invoke");
    activateKernelRun(kernel, session.id);
    let executed;
    try {
      executed = await kernel.executeStep(session.id, {
        kind: "site",
        capabilityId: "site.runtime.invoke",
        skillId,
        action,
        tab: resolvedTab,
        input: {
          input,
          ctx,
          plan,
          module,
          ...(verifier ? { verifier } : {}),
          ...(intervention ? { intervention } : {}),
        },
      });
    } finally {
      settleKernelRun(kernel, session.id);
    }
    const result = unwrapKernelStepResult(executed, `Site runtime invoke failed for ${skillId}`);

    if (!result.intervention) {
      return result;
    }

    const requested = kernel.requestIntervention(session.id, result.intervention, {
      timeoutMs: interventionTimeoutMs,
    });

    return {
      ...result,
      intervention: requested,
    };
  }

  async function invokePageAction({ action, input = {}, ctx = {} } = {}) {
    if (!pageHookBridge) {
      throw new CapabilityError("E_RUNTIME", "Page hook bridge is not configured");
    }

    const [{ kernel }, session] = await Promise.all([ensureServices(), ensureSession()]);
    const request = buildPageActionRequest({
      action,
      input,
      tab: toCanonicalTab(await requireActiveTab(chromeApi, `page.${action}`)),
      scriptPath: pageHookScriptPath,
    });
    activateKernelRun(kernel, session.id);
    let executed;
    try {
      executed = await kernel.executeStep(session.id, {
        kind: "site",
        capabilityId: `page.${action}`,
        skillId: request.skillId,
        action: request.action,
        tab: request.tab,
        input: {
          input: request.input,
          ctx,
          plan: request.plan,
          module: request.module,
          ...(request.verifier ? { verifier: request.verifier } : {}),
        },
      });
    } finally {
      settleKernelRun(kernel, session.id);
    }
    const result = unwrapKernelStepResult(executed, `Page action failed for page.${action}`);

    if (!result.intervention) {
      return result;
    }

    const requested = kernel.requestIntervention(session.id, result.intervention, {
      timeoutMs: interventionTimeoutMs,
    });

    return {
      ...result,
      intervention: requested,
    };
  }

  return {
    dispatchCapability,
    ensureServices,
    ensureSession,
    getConfigBootstrapSummary,
    getInterventionState,
    getKernelRuntimeState,
    invokePageAction,
    invokeSiteSkill,
    listInterventions,
    readInterventionAudit,
    resolveIntervention,
    cancelIntervention,
  };
}
