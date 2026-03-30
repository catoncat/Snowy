import { BrowserVfs } from "@bbl-next/browser-vfs";
import { CONFIG_RESOURCE_FIELDS, CapabilityError } from "@bbl-next/contracts";
import {
  BUILTIN_CAPABILITIES,
  CapabilityRegistry,
  FamilyProviderRegistry,
  dispatchCapabilityCall,
} from "@bbl-next/core";
import { InMemorySessionStorage, VfsSessionStorage, createKernel } from "@bbl-next/kernel";
import { SiteSkillRegistry, SiteSkillRuntime } from "@bbl-next/site-runtime";

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

async function resolveMaybe(value) {
  if (typeof value === "function") {
    return value();
  }
  return value;
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

function normalizeConfigValues(values) {
  const out = {};
  if (!isPlainObject(values)) {
    return out;
  }
  for (const field of CONFIG_RESOURCE_FIELDS) {
    if (isPlainObject(values[field])) {
      out[field] = { ...values[field] };
    }
  }
  return out;
}

function mergeConfigValues(baseValues, patchValues) {
  const next = normalizeConfigValues(baseValues);
  for (const field of CONFIG_RESOURCE_FIELDS) {
    if (isPlainObject(patchValues[field])) {
      next[field] = {
        ...(next[field] ?? {}),
        ...patchValues[field],
      };
    }
  }
  return next;
}

function normalizeConfigPatch(patch) {
  if (!isPlainObject(patch)) {
    throw new CapabilityError("E_BAD_INPUT", "config.update requires a patch object");
  }

  const normalized = {};
  for (const [field, value] of Object.entries(patch)) {
    if (!CONFIG_RESOURCE_FIELDS.includes(field)) {
      throw new CapabilityError("E_BAD_INPUT", `config.update does not support field: ${field}`);
    }
    if (!isPlainObject(value)) {
      throw new CapabilityError("E_BAD_INPUT", `config.update field ${field} must be an object`);
    }
    normalized[field] = { ...value };
  }

  if (Object.keys(normalized).length === 0) {
    throw new CapabilityError("E_BAD_INPUT", "config.update requires at least one config field");
  }

  return normalized;
}

function createTabsFamilyProvider({ chromeApi }) {
  return {
    family: "tabs",
    async invoke({ binding, input }) {
      switch (binding.operation) {
        case "list": {
          if (!chromeApi?.tabs?.query) {
            throw new CapabilityError("E_RUNTIME", "chrome.tabs.query is required for tabs.list");
          }
          const tabs = await chromeApi.tabs.query({});
          return Array.isArray(tabs)
            ? tabs
                .filter((tab) => typeof tab?.id === "number" && typeof tab?.url === "string")
                .map((tab) => toCanonicalTab(tab))
            : [];
        }
        case "get_active":
          return toCanonicalTab(await requireActiveTab(chromeApi, "tabs.get_active"));
        case "navigate": {
          if (!isPlainObject(input) || typeof input.url !== "string" || !input.url.trim()) {
            throw new CapabilityError("E_BAD_INPUT", "tabs.navigate requires a non-empty url");
          }
          if (!chromeApi?.tabs?.update) {
            throw new CapabilityError(
              "E_RUNTIME",
              "chrome.tabs.update is required for tabs.navigate",
            );
          }

          const nextUrl = input.url.trim();
          const activeTab = await requireActiveTab(chromeApi, "tabs.navigate");
          const updatedTab = await chromeApi.tabs.update(activeTab.id, {
            url: nextUrl,
          });

          return toCanonicalTab(
            updatedTab && typeof updatedTab.id === "number" && typeof updatedTab.url === "string"
              ? updatedTab
              : {
                  ...activeTab,
                  url: nextUrl,
                  active: true,
                },
          );
        }
        default:
          throw new CapabilityError(
            "E_RUNTIME",
            `Unsupported tabs operation: ${binding.operation}`,
          );
      }
    },
  };
}

function createConfigControlPlane({ configSummary }) {
  const state = {
    values: {},
    updatedAt: null,
  };

  async function getBootstrapSummary() {
    const resolved = (await resolveMaybe(configSummary)) ?? {};
    const baseValues = normalizeConfigValues(resolved.values);
    const values = mergeConfigValues(baseValues, state.values);
    const hasValues = Object.keys(values).length > 0;
    const status = hasValues || resolved.status === "ready" ? "ready" : "placeholder";
    const fields =
      Array.isArray(resolved.fields) && resolved.fields.length > 0
        ? resolved.fields.filter((field) => CONFIG_RESOURCE_FIELDS.includes(field))
        : [...CONFIG_RESOURCE_FIELDS];

    return {
      status,
      fields: fields.length > 0 ? fields : [...CONFIG_RESOURCE_FIELDS],
      values,
      note:
        status === "ready"
          ? null
          : typeof resolved.note === "string"
            ? resolved.note
            : "Config control plane is not implemented yet.",
      updatedAt:
        typeof state.updatedAt === "string"
          ? state.updatedAt
          : typeof resolved.updatedAt === "string"
            ? resolved.updatedAt
            : null,
    };
  }

  async function update(patch) {
    const normalizedPatch = normalizeConfigPatch(patch);
    const current = await getBootstrapSummary();
    const values = mergeConfigValues(current.values, normalizedPatch);
    const updatedAt = new Date().toISOString();
    state.values = values;
    state.updatedAt = updatedAt;

    return {
      config: {
        status: "ready",
        fields: current.fields,
        values,
        note: null,
        updatedAt,
      },
    };
  }

  return {
    getBootstrapSummary,
    update,
  };
}

function createConfigFamilyProvider(configControlPlane) {
  return {
    family: "config",
    async invoke({ binding, input }) {
      switch (binding.operation) {
        case "update":
          if (!isPlainObject(input)) {
            throw new CapabilityError("E_BAD_INPUT", "Capability input must be an object");
          }
          return configControlPlane.update(input.patch);
        default:
          throw new CapabilityError(
            "E_RUNTIME",
            `Unsupported config operation: ${binding.operation}`,
          );
      }
    },
  };
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
        const configControlPlane = createConfigControlPlane({ configSummary });

        providers.register(createTabsFamilyProvider({ chromeApi }));
        providers.register(createConfigFamilyProvider(configControlPlane));

        const runnerHost = createBridgeRunnerHost({ invokeRunner });
        const kernel = createKernel({
          storage,
          llm: llmAdapter ?? {
            complete: async () => "",
          },
          registry,
          providers,
          runnerHost,
        });

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
    const [{ kernel, runnerHost }, session] = await Promise.all([
      ensureServices(),
      ensureSession(),
    ]);
    const runtime = new SiteSkillRuntime({
      registry: new SiteSkillRegistry([
        {
          skillId,
          matches: [tab.url],
          actions: [
            {
              name: action,
              module,
              injectionSteps: plan.steps,
              ...(verifier ? { verifier } : {}),
              ...(intervention ? { intervention } : {}),
            },
          ],
        },
      ]),
      runnerHost,
      ...(pageHookBridge
        ? {
            installer: createSiteRuntimeInstaller(pageHookBridge),
          }
        : {}),
    });

    const result = await runtime.invoke({
      skillId,
      action,
      tab,
      input,
      ctx,
    });

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
    invokeSiteSkill,
    listInterventions,
    readInterventionAudit,
    resolveIntervention,
    cancelIntervention,
  };
}
