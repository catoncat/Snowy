// @ts-nocheck
import { BrowserVfs } from "@bbl-next/browser-vfs";
import { CONFIG_RESOURCE_FIELDS, CapabilityError } from "@bbl-next/contracts";
import type { ConfigBootstrapSummary, LlmProfileConfig } from "@bbl-next/contracts";
import {
  BUILTIN_CAPABILITIES,
  CapabilityRegistry,
  FamilyProviderRegistry,
  createConfigCapabilityProvider,
  createConfigControlPlane,
  createTabsCapabilityProvider,
  dispatchCapabilityCall,
} from "@bbl-next/core";
import {
  InMemorySessionStorage,
  LlmProviderRegistry,
  VfsSessionStorage,
  createKernel,
  createKernelLlmFromProvider,
  createOpenAiCompatibleProvider,
  runLoop,
} from "@bbl-next/kernel";
import {
  type SiteFetchWithSessionInput,
  type SiteFetchWithSessionResult,
  invokeSingleActionSiteSkill,
} from "@bbl-next/site-runtime";
export {
  SIDEPANEL_MANAGEMENT_ACTION_KINDS,
  SIDEPANEL_MANAGEMENT_RESOURCE_IDS,
  isSidepanelManagementActionKind,
  isSidepanelManagementResourceId,
} from "./sidepanel-management-contract.js";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const LLM_PROVIDER_ROUTING_LANES = ["primary", "compaction", "title"];

async function resolveMaybe(value) {
  if (typeof value === "function") {
    return value();
  }
  return value;
}

const DEFAULT_INTERVENTION_TIMEOUT_MS = 5 * 60 * 1000;
const INTERVENTION_SYNC_CHANNEL_NAME = "bbl-next.interventions.v1";
const SKILL_STATUS_BY_ACTION = {
  "skills.install": "installed",
  "skills.enable": "enabled",
  "skills.disable": "disabled",
  "skills.uninstall": "archived",
};

function createInterventionSyncChannel(explicitChannel) {
  if (explicitChannel) {
    return explicitChannel;
  }
  if (typeof globalThis.BroadcastChannel === "function") {
    return new globalThis.BroadcastChannel(INTERVENTION_SYNC_CHANNEL_NAME);
  }
  return null;
}

function createInMemorySkillManager() {
  const records = new Map();

  function cloneSkillRecord(record) {
    return {
      skillId: record.skillId,
      status: record.status,
      trusted: record.trusted,
      recentChange: record.recentChange,
      lastChangedAt: record.lastChangedAt,
    };
  }

  return {
    async list() {
      return [...records.values()].map((record) => cloneSkillRecord(record));
    },
    async listActiveIds() {
      return [...records.values()]
        .filter((record) => record.status !== "archived")
        .map((record) => record.skillId);
    },
    async manage({ action, skillId }) {
      const previous = records.get(skillId);
      const status = SKILL_STATUS_BY_ACTION[action];
      if (!status) {
        throw new CapabilityError("E_RUNTIME", `Unsupported skill lifecycle action: ${action}`);
      }

      const nextRecord = {
        skillId,
        status,
        trusted: previous?.trusted ?? false,
        recentChange: action,
        lastChangedAt: new Date().toISOString(),
      };
      records.set(skillId, nextRecord);

      return {
        skill: {
          skillId,
          status,
          trusted: nextRecord.trusted,
          recentChange: action,
        },
      };
    },
  };
}

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

function pickRuntimeSession(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return null;
  }
  return (
    [...sessions]
      .filter((session) => session?.title === "mv3-shell runtime session")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
  );
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
    case "query":
      if (
        !isPlainObject(input) ||
        typeof input.selector !== "string" ||
        input.selector.length === 0
      ) {
        throw new CapabilityError("E_BAD_INPUT", "page.query requires a non-empty selector");
      }
      return {
        skillId: "bbl.page",
        action: "query",
        tab,
        input: {
          selector: input.selector,
        },
        plan: {
          skillId: "bbl.page",
          action: "query",
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
          id: "bbl.page.query",
          source: "exports.default = async ({ input }) => ({ selector: input.selector });",
        },
        verifier: "page_query",
      };
    case "click":
      if (!isPlainObject(input) || typeof input.uid !== "string" || input.uid.length === 0) {
        throw new CapabilityError("E_BAD_INPUT", "page.click requires a non-empty uid");
      }
      return {
        skillId: "bbl.page",
        action: "click",
        tab,
        input: {
          uid: input.uid,
        },
        plan: {
          skillId: "bbl.page",
          action: "click",
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
          id: "bbl.page.click",
          source: "exports.default = async ({ input }) => ({ uid: input.uid });",
        },
        verifier: "page_click",
      };
    case "fill":
      if (!isPlainObject(input) || typeof input.uid !== "string" || input.uid.length === 0) {
        throw new CapabilityError("E_BAD_INPUT", "page.fill requires a non-empty uid");
      }
      if (typeof input.value !== "string") {
        throw new CapabilityError("E_BAD_INPUT", "page.fill requires input.value");
      }
      return {
        skillId: "bbl.page",
        action: "fill",
        tab,
        input: {
          uid: input.uid,
          value: input.value,
        },
        plan: {
          skillId: "bbl.page",
          action: "fill",
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
          id: "bbl.page.fill",
          source:
            "exports.default = async ({ input }) => ({ uid: input.uid, value: input.value });",
        },
        verifier: "page_fill",
      };
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

function normalizeSiteFetchWithSessionInput(input: unknown): SiteFetchWithSessionInput {
  if (!isPlainObject(input)) {
    throw new CapabilityError("E_BAD_INPUT", "site.fetch_with_session requires an object input");
  }
  if (typeof input.url !== "string" || !input.url.trim()) {
    throw new CapabilityError("E_BAD_INPUT", "site.fetch_with_session requires a non-empty url");
  }
  if (input.method != null && (typeof input.method !== "string" || !input.method.trim())) {
    throw new CapabilityError("E_BAD_INPUT", "site.fetch_with_session method must be a string");
  }
  if (input.body != null && typeof input.body !== "string") {
    throw new CapabilityError("E_BAD_INPUT", "site.fetch_with_session body must be a string");
  }
  if (input.headers != null && !isPlainObject(input.headers)) {
    throw new CapabilityError("E_BAD_INPUT", "site.fetch_with_session headers must be an object");
  }

  const normalizedHeaders =
    input.headers == null
      ? undefined
      : Object.fromEntries(
          Object.entries(input.headers).map(([key, value]) => {
            if (typeof value !== "string") {
              throw new CapabilityError(
                "E_BAD_INPUT",
                `site.fetch_with_session header ${key} must be a string`,
              );
            }
            return [key, value];
          }),
        );

  return {
    url: input.url.trim(),
    ...(input.method ? { method: input.method.trim().toUpperCase() } : {}),
    ...(normalizedHeaders && Object.keys(normalizedHeaders).length > 0
      ? { headers: normalizedHeaders }
      : {}),
    ...(typeof input.body === "string" ? { body: input.body } : {}),
  };
}

function buildSiteFetchWithSessionRequest({
  input,
  tab,
  scriptPath,
}: {
  input: unknown;
  tab: {
    tabId: number;
    url: string;
    active: boolean;
    title?: string;
  };
  scriptPath: string;
}) {
  const normalizedInput = normalizeSiteFetchWithSessionInput(input);
  return {
    skillId: "bbl.site",
    action: "fetch_with_session",
    tab,
    input: normalizedInput,
    plan: {
      skillId: "bbl.site",
      action: "fetch_with_session",
      steps: [
        {
          world: "main",
          scriptId: "bbl-next.page-hook.site",
          jsPath: scriptPath,
          runAt: "document_idle",
        },
      ],
    },
    module: {
      id: "bbl.site.fetch_with_session",
      source: "exports.default = async ({ input }) => input;",
    },
    verifier: "site_fetch_with_session",
  };
}

function toSiteFetchWithSessionResult(result: unknown): SiteFetchWithSessionResult {
  if (!isPlainObject(result)) {
    throw new CapabilityError("E_RUNTIME", "site.fetch_with_session returned a non-object result");
  }
  if (typeof result.url !== "string" || !result.url) {
    throw new CapabilityError("E_RUNTIME", "site.fetch_with_session result is missing url");
  }
  if (typeof result.status !== "number") {
    throw new CapabilityError("E_RUNTIME", "site.fetch_with_session result is missing status");
  }
  if (typeof result.body !== "string") {
    throw new CapabilityError("E_RUNTIME", "site.fetch_with_session result is missing body");
  }
  return {
    url: result.url,
    status: result.status,
    body: result.body,
    ok: typeof result.responseOk === "boolean" ? result.responseOk : result.ok === true,
  };
}

function normalizeScreenshotRequest(input: unknown) {
  if (input != null && !isPlainObject(input)) {
    throw new CapabilityError("E_BAD_INPUT", "page.screenshot requires an object input");
  }

  const format = input?.format == null ? "png" : input.format;
  if (format !== "png" && format !== "jpeg") {
    throw new CapabilityError("E_BAD_INPUT", "page.screenshot format must be png or jpeg");
  }

  if (input?.quality != null) {
    if (
      typeof input.quality !== "number" ||
      !Number.isFinite(input.quality) ||
      input.quality < 0 ||
      input.quality > 100
    ) {
      throw new CapabilityError("E_BAD_INPUT", "page.screenshot quality must be between 0 and 100");
    }
  }

  return {
    format,
    ...(format === "jpeg" && input?.quality != null ? { quality: input.quality } : {}),
  };
}

function normalizeChatRunStatus(status) {
  return status === "running" || status === "stopped" ? status : "idle";
}

function createChatMessageItem({ id, role, text, state = "complete" }) {
  return {
    id,
    kind: "message",
    role,
    text,
    state,
  };
}

function createChatToolItem({ id, toolName, summary, detail }) {
  return {
    id,
    kind: "tool",
    toolName,
    summary,
    detail,
    expanded: false,
  };
}

function summarizeChatToolDetail(detail) {
  const normalized = String(detail ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "Tool completed";
  }
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
}

function toChatTranscriptItem(message) {
  if (!message || typeof message !== "object") {
    return null;
  }
  if (message.role === "user" || message.role === "assistant") {
    if (typeof message.toolName === "string" && message.toolName.length > 0) {
      return createChatToolItem({
        id: message.toolCallId ?? message.entryId,
        toolName: message.toolName,
        summary: summarizeChatToolDetail(message.content),
        detail: message.content,
      });
    }
    return createChatMessageItem({
      id: message.entryId,
      role: message.role,
      text: message.content,
    });
  }
  return null;
}

async function emitRuntimeChatEvent(chromeApi, event) {
  if (typeof chromeApi?.runtime?.sendMessage !== "function") {
    return;
  }
  await chromeApi.runtime.sendMessage({
    type: "bbl-next.runtime.chat.event",
    event,
  });
}

export function createRemoteExecAdapter(sendExec: any): any {
  return {
    exec(request) {
      return Promise.resolve()
        .then(() => sendExec(request))
        .catch((error) => ({
          ok: false,
          error: {
            code:
              error && typeof error === "object" && typeof error.code === "string"
                ? error.code
                : "E_RUNTIME",
            message: error instanceof Error ? error.message : "Remote exec failed",
            details: {
              kind: "exec",
              hostId: request.hostId,
              reason: "remote_exec_failed",
            },
          },
        }));
    },
  };
}

export function createRemoteHostProbe(sendProbe: any): any {
  return (request) =>
    Promise.resolve()
      .then(() => sendProbe(request))
      .then((result) => {
        if (result && typeof result === "object" && result.ok === false) {
          return result;
        }
        const data =
          result && typeof result === "object" && result.ok === true && "data" in result
            ? result.data
            : result;
        const checkedAt =
          data && typeof data === "object" && typeof data.checkedAt === "string"
            ? data.checkedAt
            : undefined;
        const status =
          data && typeof data === "object" && typeof data.status === "string"
            ? data.status
            : data && typeof data === "object" && data.health && typeof data.health === "object"
              ? data.health.status
              : "healthy";

        return {
          ok: true,
          data: {
            hostId: request.hostId,
            connected:
              data && typeof data === "object" && typeof data.connected === "boolean"
                ? data.connected
                : true,
            health: {
              status,
              ...(checkedAt ? { checkedAt } : {}),
            },
          },
        };
      })
      .catch((error) => ({
        ok: false,
        error: {
          code:
            error && typeof error === "object" && typeof error.code === "string"
              ? error.code
              : "E_RUNTIME",
          message: error instanceof Error ? error.message : "Remote host probe failed",
          details: {
            kind: "health",
            hostId: request.hostId,
            reason: "remote_probe_failed",
          },
        },
      }));
}

export function createRemoteHostTransport({
  hostId = "remote",
  sendExec,
  sendProbe,
  availability,
  isAvailable,
  describeAvailability,
}: any = {}): any {
  if (typeof sendExec !== "function") {
    return null;
  }

  const execAdapter = createRemoteExecAdapter(sendExec);
  const probeAdapter =
    typeof sendProbe === "function" ? createRemoteHostProbe(sendProbe) : undefined;

  async function resolveAvailability(request) {
    if (typeof availability === "function") {
      return (await availability(request)) ?? null;
    }
    if (typeof describeAvailability === "function") {
      return (await describeAvailability(request)) ?? null;
    }
    if (typeof isAvailable === "function") {
      const available = await isAvailable(request);
      return { available: Boolean(available) };
    }
    return { available: true };
  }

  return {
    hostId: typeof hostId === "string" && hostId.trim().length > 0 ? hostId.trim() : "remote",
    async describeAvailability(request) {
      return resolveAvailability(request);
    },
    async isAvailable(request) {
      const result = await resolveAvailability(request);
      if (result && typeof result === "object" && "available" in result) {
        return result.available !== false;
      }
      return Boolean(result);
    },
    exec(request) {
      return execAdapter.exec(request);
    },
    ...(probeAdapter ? { probe: probeAdapter } : {}),
  };
}

const REMOTE_TRANSPORT_CONFIG_STORAGE_KEY = "bbl-next.remote-transport.config.v1";
const REMOTE_TRANSPORT_DEFAULT_EXEC_PATH = "/exec";
const REMOTE_TRANSPORT_DEFAULT_PROBE_PATH = "/health";
const REMOTE_TRANSPORT_DEFAULT_HOST_ID = "remote";
const LLM_CONFIG_STORAGE_KEY = "bbl-next.llm.config.v1";
const CONFIG_CONTROL_PLANE_STORAGE_KEY = "bbl-next.config.control-plane.v1";

function hasOwnKey(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function normalizeRemoteTransportPath(path, fallback) {
  if (typeof path !== "string" || !path.trim()) {
    return fallback;
  }
  const normalized = path.trim();
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeRemoteTransportBaseUrl(baseUrl) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return null;
  }
  try {
    const url = new URL(baseUrl.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (url.username || url.password) {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function remoteTransportBaseUrlHasUserInfo(baseUrl) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return false;
  }
  try {
    const url = new URL(baseUrl.trim());
    return Boolean(url.username || url.password);
  } catch {
    return false;
  }
}

function normalizeRemoteTransportHostId(hostId, fallbackHostId = REMOTE_TRANSPORT_DEFAULT_HOST_ID) {
  if (typeof hostId === "string" && hostId.trim()) {
    return hostId.trim();
  }
  return fallbackHostId;
}

function cloneRemoteTransportConfig(
  config,
  { fallbackHostId = REMOTE_TRANSPORT_DEFAULT_HOST_ID, requireHostId = false } = {},
) {
  if (!isPlainObject(config)) {
    return null;
  }

  const baseUrl = normalizeRemoteTransportBaseUrl(config.baseUrl);
  if (!baseUrl) {
    return null;
  }

  const hostId = normalizeRemoteTransportHostId(config.hostId, "");
  if (requireHostId && !hostId) {
    return null;
  }

  const next = {
    hostId: hostId || fallbackHostId,
    baseUrl,
    execPath: normalizeRemoteTransportPath(config.execPath, REMOTE_TRANSPORT_DEFAULT_EXEC_PATH),
    probePath: normalizeRemoteTransportPath(config.probePath, REMOTE_TRANSPORT_DEFAULT_PROBE_PATH),
  };
  if (typeof config.authToken === "string" && config.authToken.trim()) {
    next.authToken = config.authToken.trim();
  }
  return next;
}

function cloneRemoteTransportConfigs(config, { requireHostIds = false } = {}) {
  if (config == null) {
    return [];
  }

  const values = Array.isArray(config) ? config : [config];
  const entries = [];
  const seenHostIds = new Set();

  for (const [index, value] of values.entries()) {
    const fallbackHostId = index === 0 ? REMOTE_TRANSPORT_DEFAULT_HOST_ID : `remote-${index + 1}`;
    const normalized = cloneRemoteTransportConfig(value, {
      fallbackHostId,
      requireHostId: requireHostIds || Array.isArray(config),
    });
    if (!normalized) {
      return null;
    }
    if (seenHostIds.has(normalized.hostId)) {
      return null;
    }
    seenHostIds.add(normalized.hostId);
    entries.push(normalized);
  }

  return entries;
}

function buildRemoteTransportSummary(config) {
  const normalized = cloneRemoteTransportConfig(config);
  if (!normalized) {
    return null;
  }
  return {
    hostId: normalized.hostId,
    baseUrl: normalized.baseUrl,
    execPath: normalized.execPath,
    probePath: normalized.probePath,
    ...(normalized.authToken ? { authScheme: "bearer" } : {}),
  };
}

function buildRemoteTransportSummaries(config) {
  const normalized = cloneRemoteTransportConfigs(config);
  if (!normalized) {
    return [];
  }
  return normalized.map((entry) => buildRemoteTransportSummary(entry)).filter(Boolean);
}

async function loadRemoteTransportConfig(chromeApi) {
  const storageArea = chromeApi?.storage?.local;
  if (typeof storageArea?.get !== "function") {
    return null;
  }
  const result = await storageArea.get(REMOTE_TRANSPORT_CONFIG_STORAGE_KEY);
  const stored = result?.[REMOTE_TRANSPORT_CONFIG_STORAGE_KEY];
  const normalized = cloneRemoteTransportConfigs(stored);
  if (!normalized || normalized.length === 0) {
    return null;
  }
  return Array.isArray(stored) ? normalized : normalized[0];
}

async function saveRemoteTransportConfig(chromeApi, config) {
  const normalized = cloneRemoteTransportConfigs(config);
  if (!normalized || normalized.length === 0) {
    return null;
  }

  const storageArea = chromeApi?.storage?.local;
  const stored = normalized.length === 1 ? normalized[0] : normalized;
  if (typeof storageArea?.set === "function") {
    await storageArea.set({
      [REMOTE_TRANSPORT_CONFIG_STORAGE_KEY]: stored,
    });
  }
  return stored;
}

async function clearRemoteTransportConfig(chromeApi) {
  const storageArea = chromeApi?.storage?.local;
  if (typeof storageArea?.remove === "function") {
    await storageArea.remove(REMOTE_TRANSPORT_CONFIG_STORAGE_KEY);
    return;
  }
  if (typeof storageArea?.set === "function") {
    await storageArea.set({
      [REMOTE_TRANSPORT_CONFIG_STORAGE_KEY]: null,
    });
  }
}

function validateRemoteTransportPatch(patch) {
  if (patch === null) {
    return;
  }
  if (!isPlainObject(patch)) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "config.update automation.remoteTransport must be an object or null",
    );
  }
  if (hasOwnKey(patch, "hostId") && patch.hostId != null && typeof patch.hostId !== "string") {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "config.update automation.remoteTransport.hostId must be a string or null",
    );
  }
  if (hasOwnKey(patch, "hostId") && typeof patch.hostId === "string" && !patch.hostId.trim()) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "config.update automation.remoteTransport.hostId must not be empty",
    );
  }
  if (hasOwnKey(patch, "baseUrl") && patch.baseUrl != null && typeof patch.baseUrl !== "string") {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "config.update automation.remoteTransport.baseUrl must be a string",
    );
  }
  if (
    hasOwnKey(patch, "baseUrl") &&
    typeof patch.baseUrl === "string" &&
    remoteTransportBaseUrlHasUserInfo(patch.baseUrl)
  ) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "config.update automation.remoteTransport.baseUrl must not include username or password",
    );
  }
  if (
    hasOwnKey(patch, "execPath") &&
    patch.execPath != null &&
    typeof patch.execPath !== "string"
  ) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "config.update automation.remoteTransport.execPath must be a string",
    );
  }
  if (
    hasOwnKey(patch, "probePath") &&
    patch.probePath != null &&
    typeof patch.probePath !== "string"
  ) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "config.update automation.remoteTransport.probePath must be a string",
    );
  }
  if (
    hasOwnKey(patch, "authToken") &&
    patch.authToken != null &&
    typeof patch.authToken !== "string"
  ) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "config.update automation.remoteTransport.authToken must be a string or null",
    );
  }
}

function validateRemoteTransportsPatch(patch) {
  if (patch === null) {
    return;
  }
  if (!Array.isArray(patch)) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "config.update automation.remoteTransports must be an array or null",
    );
  }

  const seenHostIds = new Set();
  for (const [index, entry] of patch.entries()) {
    if (!isPlainObject(entry)) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        `config.update automation.remoteTransports[${index}] must be an object`,
      );
    }
    validateRemoteTransportPatch(entry);
    const hostId = normalizeRemoteTransportHostId(entry.hostId, "");
    if (!hostId) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        `config.update automation.remoteTransports[${index}].hostId requires a non-empty string`,
      );
    }
    if (seenHostIds.has(hostId)) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        `config.update automation.remoteTransports contains duplicate hostId: ${hostId}`,
      );
    }
    seenHostIds.add(hostId);
  }
}

async function syncRemoteTransportConfigFromConfigPatch(chromeApi, patch) {
  if (!isPlainObject(patch) || !isPlainObject(patch.automation)) {
    return patch;
  }

  const hasSingleRemoteTransport = hasOwnKey(patch.automation, "remoteTransport");
  const hasMultipleRemoteTransports = hasOwnKey(patch.automation, "remoteTransports");
  if (!hasSingleRemoteTransport && !hasMultipleRemoteTransports) {
    return patch;
  }
  if (hasSingleRemoteTransport && hasMultipleRemoteTransports) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "config.update automation.remoteTransport and automation.remoteTransports are mutually exclusive",
    );
  }

  const nextPatch = {
    ...patch,
    automation: {
      ...patch.automation,
    },
  };

  if (hasMultipleRemoteTransports) {
    validateRemoteTransportsPatch(patch.automation.remoteTransports);
    const remoteTransportEntries = patch.automation.remoteTransports;
    if (remoteTransportEntries === null || remoteTransportEntries.length === 0) {
      await clearRemoteTransportConfig(chromeApi);
      nextPatch.automation.remoteTransport = null;
      nextPatch.automation.remoteTransports = [];
      return nextPatch;
    }

    const normalizedEntries = cloneRemoteTransportConfigs(remoteTransportEntries, {
      requireHostIds: true,
    });
    if (!normalizedEntries || normalizedEntries.length === 0) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        "config.update automation.remoteTransports requires valid http(s) baseUrl entries",
      );
    }

    await saveRemoteTransportConfig(chromeApi, normalizedEntries);
    const summaries = buildRemoteTransportSummaries(normalizedEntries);
    nextPatch.automation.remoteTransport = summaries.length === 1 ? summaries[0] : null;
    nextPatch.automation.remoteTransports = summaries;
    return nextPatch;
  }

  validateRemoteTransportPatch(patch.automation.remoteTransport);
  if (patch.automation.remoteTransport === null) {
    await clearRemoteTransportConfig(chromeApi);
    nextPatch.automation.remoteTransport = null;
    nextPatch.automation.remoteTransports = [];
    return nextPatch;
  }

  const currentConfig = await loadRemoteTransportConfig(chromeApi);
  const remoteTransportPatch = patch.automation.remoteTransport;
  const currentSingleConfig = currentConfig && !Array.isArray(currentConfig) ? currentConfig : null;
  const normalized = cloneRemoteTransportConfig({
    hostId: hasOwnKey(remoteTransportPatch, "hostId")
      ? remoteTransportPatch.hostId
      : currentSingleConfig?.hostId,
    baseUrl: hasOwnKey(remoteTransportPatch, "baseUrl")
      ? remoteTransportPatch.baseUrl
      : currentSingleConfig?.baseUrl,
    execPath: hasOwnKey(remoteTransportPatch, "execPath")
      ? remoteTransportPatch.execPath
      : currentSingleConfig?.execPath,
    probePath: hasOwnKey(remoteTransportPatch, "probePath")
      ? remoteTransportPatch.probePath
      : currentSingleConfig?.probePath,
    authToken: hasOwnKey(remoteTransportPatch, "authToken")
      ? remoteTransportPatch.authToken
      : currentSingleConfig?.authToken,
  });

  if (!normalized) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "config.update automation.remoteTransport requires a valid http(s) baseUrl",
    );
  }

  await saveRemoteTransportConfig(chromeApi, normalized);
  nextPatch.automation.remoteTransport = buildRemoteTransportSummary(normalized);
  nextPatch.automation.remoteTransports = buildRemoteTransportSummaries(normalized);
  return nextPatch;
}

function createRemoteTransportRequestError(message, code = "E_REMOTE_HTTP") {
  const error = new Error(message);
  // @ts-expect-error test/runtime code field
  error.code = code;
  return error;
}

async function sendRemoteTransportRequest({
  fetchImpl = globalThis.fetch,
  url,
  authToken,
  request,
}) {
  if (typeof fetchImpl !== "function") {
    throw createRemoteTransportRequestError(
      "fetch is unavailable for remote transport",
      "E_RUNTIME",
    );
  }

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(request),
  });

  const text = await response.text();
  const payload = text.length > 0 ? JSON.parse(text) : null;
  if (!response.ok) {
    if (
      payload &&
      typeof payload === "object" &&
      payload.error &&
      typeof payload.error === "object"
    ) {
      throw createRemoteTransportRequestError(
        payload.error.message ?? `Remote transport request failed with status ${response.status}`,
        payload.error.code ?? "E_REMOTE_HTTP",
      );
    }
    throw createRemoteTransportRequestError(
      `Remote transport request failed with status ${response.status}`,
    );
  }
  return payload;
}

export function createConfiguredRemoteHostTransport({
  config,
  fetchImpl = globalThis.fetch,
  hostId = undefined,
} = {}) {
  const normalized = cloneRemoteTransportConfig(config);
  if (!normalized) {
    return null;
  }

  const baseUrl = normalized.baseUrl;
  return createRemoteHostTransport({
    hostId: normalizeRemoteTransportHostId(hostId, normalized.hostId),
    sendExec: (request) =>
      sendRemoteTransportRequest({
        fetchImpl,
        url: `${baseUrl}${normalized.execPath}`,
        authToken: normalized.authToken,
        request,
      }),
    sendProbe: (request) =>
      sendRemoteTransportRequest({
        fetchImpl,
        url: `${baseUrl}${normalized.probePath}`,
        authToken: normalized.authToken,
        request,
      }),
    describeAvailability: async () =>
      typeof fetchImpl === "function"
        ? { available: true }
        : {
            available: false,
            error: {
              code: "E_RUNTIME",
              message: "fetch is unavailable for remote transport",
            },
          },
  });
}

export async function loadConfiguredRemoteHostTransport({
  chromeApi = globalThis.chrome,
  fetchImpl = globalThis.fetch,
  hostId = undefined,
} = {}) {
  const configured = await loadRemoteTransportConfig(chromeApi);
  if (!configured) {
    return null;
  }
  if (Array.isArray(configured)) {
    return configured
      .map((entry, index) =>
        createConfiguredRemoteHostTransport({
          config: entry,
          fetchImpl,
          hostId: index === 0 ? hostId : undefined,
        }),
      )
      .filter(Boolean);
  }
  return createConfiguredRemoteHostTransport({
    config: configured,
    fetchImpl,
    hostId,
  });
}

async function loadLlmProfileConfig(chromeApi): Promise<LlmProfileConfig | null> {
  const storageArea = chromeApi?.storage?.local;
  if (typeof storageArea?.get !== "function") {
    return null;
  }
  const result = await storageArea.get(LLM_CONFIG_STORAGE_KEY);
  const stored = result?.[LLM_CONFIG_STORAGE_KEY];
  if (!stored || typeof stored !== "object" || !Array.isArray(stored.profiles)) {
    return null;
  }
  return stored as LlmProfileConfig;
}

async function saveLlmProfileConfig(chromeApi, config: LlmProfileConfig): Promise<void> {
  const storageArea = chromeApi?.storage?.local;
  if (typeof storageArea?.set !== "function") {
    return;
  }
  await storageArea.set({ [LLM_CONFIG_STORAGE_KEY]: config });
}

function cloneLlmProfileConfig(config) {
  if (!config || typeof config !== "object") {
    return null;
  }
  return {
    ...config,
    laneProfiles: isPlainObject(config.laneProfiles)
      ? Object.fromEntries(
          Object.entries(config.laneProfiles).map(([lane, profiles]) => [
            lane,
            Array.isArray(profiles) ? [...profiles] : [],
          ]),
        )
      : undefined,
    profiles: Array.isArray(config.profiles)
      ? config.profiles.map((profile) => ({ ...profile }))
      : [],
  };
}

function syncLlmProfileConfig(target, source) {
  const next = cloneLlmProfileConfig(source);
  if (!next) {
    return null;
  }
  if (!target || typeof target !== "object") {
    return next;
  }

  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, next);
  return target;
}

function createEmptyConfigSummary() {
  return {
    status: "placeholder",
    fields: [...CONFIG_RESOURCE_FIELDS],
    values: {},
    note: "Config control plane is not implemented yet.",
    updatedAt: null,
  };
}

function cloneConfigSummary(summary) {
  if (!isPlainObject(summary)) {
    return null;
  }

  const values = {};
  const sourceValues = isPlainObject(summary.values) ? summary.values : {};
  for (const field of CONFIG_RESOURCE_FIELDS) {
    if (isPlainObject(sourceValues[field])) {
      values[field] = { ...sourceValues[field] };
    }
  }

  const hasValues = Object.keys(values).length > 0;
  return {
    status: summary.status === "ready" || hasValues ? "ready" : "placeholder",
    fields: [...CONFIG_RESOURCE_FIELDS],
    values,
    note:
      hasValues || summary.status === "ready"
        ? null
        : typeof summary.note === "string"
          ? summary.note
          : "Config control plane is not implemented yet.",
    updatedAt: typeof summary.updatedAt === "string" ? summary.updatedAt : null,
  };
}

function normalizeSupportedConfigPatch(patch) {
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

async function loadConfigControlPlaneSummary(chromeApi): Promise<ConfigBootstrapSummary | null> {
  const storageArea = chromeApi?.storage?.local;
  if (typeof storageArea?.get !== "function") {
    return null;
  }
  const result = await storageArea.get(CONFIG_CONTROL_PLANE_STORAGE_KEY);
  return cloneConfigSummary(result?.[CONFIG_CONTROL_PLANE_STORAGE_KEY]);
}

async function saveConfigControlPlaneSummary(
  chromeApi,
  summary,
): Promise<ConfigBootstrapSummary | null> {
  const normalized = cloneConfigSummary(summary);
  if (!normalized) {
    return null;
  }

  const storageArea = chromeApi?.storage?.local;
  if (typeof storageArea?.set === "function") {
    await storageArea.set({ [CONFIG_CONTROL_PLANE_STORAGE_KEY]: normalized });
  }
  return normalized;
}

function toConfigModelProvider(providerId) {
  return providerId === "openai_compatible" ? "openai" : providerId;
}

function toProfileProviderId(provider) {
  return provider === "openai" ? "openai_compatible" : provider;
}

function createDefaultLlmProfile(profileId = "default") {
  return {
    id: profileId,
    providerId: "openai_compatible",
    llmBase: "https://api.openai.com/v1",
    llmKey: "",
    llmModel: "",
  };
}

function createEmptyLlmProfileConfig() {
  return {
    profiles: [],
    defaultProfile: "default",
  };
}

function normalizeRoutingLaneProfiles(laneProfiles, { includeEmpty = false } = {}) {
  if (!isPlainObject(laneProfiles)) {
    return {};
  }

  const normalized = {};
  for (const lane of LLM_PROVIDER_ROUTING_LANES) {
    if (!Object.prototype.hasOwnProperty.call(laneProfiles, lane)) {
      continue;
    }
    const profiles = laneProfiles[lane];
    if (!Array.isArray(profiles)) {
      continue;
    }
    const values = [
      ...new Set(profiles.map((value) => String(value || "").trim()).filter(Boolean)),
    ];
    if (includeEmpty || values.length > 0) {
      normalized[lane] = values;
    }
  }
  return normalized;
}

function laneProfilesEqual(left, right) {
  const lanes = [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])];
  return lanes.every((lane) => {
    const leftProfiles = Array.isArray(left?.[lane]) ? left[lane] : [];
    const rightProfiles = Array.isArray(right?.[lane]) ? right[lane] : [];
    return (
      leftProfiles.length === rightProfiles.length &&
      leftProfiles.every((profile, index) => profile === rightProfiles[index])
    );
  });
}

function buildConfigModelValues(profileConfig) {
  const normalized = cloneLlmProfileConfig(profileConfig);
  if (!normalized || !Array.isArray(normalized.profiles) || normalized.profiles.length === 0) {
    return undefined;
  }

  const activeProfileId =
    typeof normalized.defaultProfile === "string" && normalized.defaultProfile.trim()
      ? normalized.defaultProfile.trim()
      : normalized.profiles[0]?.id;
  const activeProfile =
    normalized.profiles.find((profile) => profile.id === activeProfileId) ?? normalized.profiles[0];
  if (!activeProfile) {
    return undefined;
  }

  const model = {};
  if (typeof activeProfile.providerId === "string" && activeProfile.providerId.trim()) {
    model.provider = toConfigModelProvider(activeProfile.providerId.trim());
  }
  if (typeof activeProfile.llmModel === "string" && activeProfile.llmModel.trim()) {
    model.model = activeProfile.llmModel.trim();
  }
  model.routing = {
    defaultProfile:
      typeof normalized.defaultProfile === "string" && normalized.defaultProfile.trim()
        ? normalized.defaultProfile.trim()
        : activeProfile.id,
    ...(typeof normalized.fallbackProfile === "string" && normalized.fallbackProfile.trim()
      ? { fallbackProfile: normalized.fallbackProfile.trim() }
      : {}),
    laneProfiles: normalizeRoutingLaneProfiles(normalized.laneProfiles, { includeEmpty: true }),
  };

  return Object.keys(model).length > 0 ? model : undefined;
}

function buildConfigControlPlaneSummary({ baseSummary, persistedSummary, profileConfig }) {
  const base = cloneConfigSummary(baseSummary) ?? createEmptyConfigSummary();
  const persisted = cloneConfigSummary(persistedSummary);
  const values = {};

  for (const field of CONFIG_RESOURCE_FIELDS) {
    if (isPlainObject(base.values[field])) {
      values[field] = { ...base.values[field] };
    }
    if (persisted && isPlainObject(persisted.values[field])) {
      values[field] = {
        ...(values[field] ?? {}),
        ...persisted.values[field],
      };
    }
  }

  const modelValues = buildConfigModelValues(profileConfig);
  if (modelValues) {
    values.model = {
      ...(values.model ?? {}),
      ...modelValues,
    };
  }

  const hasValues = Object.keys(values).length > 0;
  return {
    status:
      hasValues || base.status === "ready" || persisted?.status === "ready"
        ? "ready"
        : "placeholder",
    fields: [...CONFIG_RESOURCE_FIELDS],
    values,
    note: hasValues
      ? null
      : (persisted?.note ?? base.note ?? "Config control plane is not implemented yet."),
    updatedAt: persisted?.updatedAt ?? base.updatedAt ?? null,
  };
}

function applyConfigModelPatchToProfileConfig(currentConfig, modelPatch) {
  if (!isPlainObject(modelPatch)) {
    return null;
  }

  const next = cloneLlmProfileConfig(currentConfig) ?? createEmptyLlmProfileConfig();
  const defaultProfileId =
    typeof next.defaultProfile === "string" && next.defaultProfile.trim()
      ? next.defaultProfile.trim()
      : "default";
  next.defaultProfile = defaultProfileId;

  let profile = next.profiles.find((entry) => entry.id === defaultProfileId);
  if (!profile) {
    profile = createDefaultLlmProfile(defaultProfileId);
    next.profiles.unshift(profile);
  }

  let changed = false;
  if (typeof modelPatch.provider === "string" && modelPatch.provider.trim()) {
    const providerId = toProfileProviderId(modelPatch.provider.trim());
    if (profile.providerId !== providerId) {
      profile.providerId = providerId;
      changed = true;
    }
  }
  if (typeof modelPatch.model === "string" && modelPatch.model.trim()) {
    const llmModel = modelPatch.model.trim();
    if (profile.llmModel !== llmModel) {
      profile.llmModel = llmModel;
      changed = true;
    }
  }
  if (typeof modelPatch.baseUrl === "string" && modelPatch.baseUrl.trim()) {
    const llmBase = modelPatch.baseUrl.trim();
    if (profile.llmBase !== llmBase) {
      profile.llmBase = llmBase;
      changed = true;
    }
  } else if (!profile.llmBase) {
    profile.llmBase = "https://api.openai.com/v1";
    changed = true;
  }

  const routingPatch = isPlainObject(modelPatch.routing) ? modelPatch.routing : null;
  if (routingPatch) {
    if (typeof routingPatch.defaultProfile === "string" && routingPatch.defaultProfile.trim()) {
      const defaultProfile = routingPatch.defaultProfile.trim();
      if (next.defaultProfile !== defaultProfile) {
        next.defaultProfile = defaultProfile;
        changed = true;
      }
    }
    if (typeof routingPatch.fallbackProfile === "string" && routingPatch.fallbackProfile.trim()) {
      const fallbackProfile = routingPatch.fallbackProfile.trim();
      if (next.fallbackProfile !== fallbackProfile) {
        next.fallbackProfile = fallbackProfile;
        changed = true;
      }
    }
    if (isPlainObject(routingPatch.laneProfiles)) {
      const currentLaneProfiles = normalizeRoutingLaneProfiles(next.laneProfiles, {
        includeEmpty: true,
      });
      const nextLaneProfiles = { ...currentLaneProfiles };
      const normalizedPatchLaneProfiles = normalizeRoutingLaneProfiles(routingPatch.laneProfiles, {
        includeEmpty: true,
      });

      for (const lane of LLM_PROVIDER_ROUTING_LANES) {
        if (!Object.prototype.hasOwnProperty.call(routingPatch.laneProfiles, lane)) {
          continue;
        }
        const laneProfiles = normalizedPatchLaneProfiles[lane] ?? [];
        if (laneProfiles.length > 0) {
          nextLaneProfiles[lane] = laneProfiles;
        } else {
          delete nextLaneProfiles[lane];
        }
      }

      if (!laneProfilesEqual(currentLaneProfiles, nextLaneProfiles)) {
        next.laneProfiles = Object.keys(nextLaneProfiles).length > 0 ? nextLaneProfiles : undefined;
        changed = true;
      }
    }
  }

  return changed ? next : null;
}

async function persistConfigSummaryFromProfileConfig(chromeApi, profileConfig) {
  const current = (await loadConfigControlPlaneSummary(chromeApi)) ?? createEmptyConfigSummary();
  const modelValues = buildConfigModelValues(profileConfig);
  if (!modelValues) {
    return current;
  }

  const next = {
    ...current,
    status: "ready",
    note: null,
    updatedAt: new Date().toISOString(),
    values: {
      ...current.values,
      model: {
        ...(current.values.model ?? {}),
        ...modelValues,
      },
    },
  };
  return saveConfigControlPlaneSummary(chromeApi, next);
}

async function loadManagedProfileConfig({
  chromeApi,
  initialProfileConfig,
}: {
  chromeApi: typeof globalThis.chrome;
  initialProfileConfig?: LlmProfileConfig;
}): Promise<LlmProfileConfig | null> {
  const current =
    cloneLlmProfileConfig(initialProfileConfig) ?? (await loadLlmProfileConfig(chromeApi));
  const persistedSummary = await loadConfigControlPlaneSummary(chromeApi);
  const modelPatch = isPlainObject(persistedSummary?.values?.model)
    ? persistedSummary.values.model
    : undefined;
  const updated = applyConfigModelPatchToProfileConfig(current, modelPatch);
  if (!updated) {
    return cloneLlmProfileConfig(current);
  }
  await saveLlmProfileConfig(chromeApi, updated);
  return updated;
}

export function createBackgroundRuntimeServices({
  invokeRunner,
  pageHookBridge,
  chromeApi = globalThis.chrome,
  sessionStorage = undefined,
  llmAdapter = undefined,
  profileConfig = undefined,
  configSummary = undefined,
  onLoopTelemetry = undefined,
  workspaceId = "mv3-shell",
  interventionTimeoutMs = DEFAULT_INTERVENTION_TIMEOUT_MS,
  interventionEscalationMs = undefined,
  interventionSyncChannel = undefined,
  pageHookScriptPath = "src/page-hook.js",
}: any = {}): any {
  let servicesPromise = null;
  let sessionPromise = null;
  let chatRunStatus = "idle";
  let activeChatRun = null;
  const skillManager = createInMemorySkillManager();
  const resolvedInterventionSyncChannel = createInterventionSyncChannel(interventionSyncChannel);
  const interventionSyncSourceId = crypto.randomUUID();

  async function persistAndBroadcastInterventions(sessionId, opts = undefined) {
    const { kernel } = await ensureServices();
    await kernel.persistInterventions(sessionId, opts);
    if (typeof resolvedInterventionSyncChannel?.postMessage === "function") {
      resolvedInterventionSyncChannel.postMessage({
        type: "bbl-next.intervention.sync",
        sourceId: interventionSyncSourceId,
        sessionId,
      });
    }
  }

  function handleInterventionSync(event) {
    const message = event?.data ?? event;
    if (
      !message ||
      message.type !== "bbl-next.intervention.sync" ||
      message.sourceId === interventionSyncSourceId ||
      typeof message.sessionId !== "string" ||
      !sessionPromise
    ) {
      return;
    }
    void (async () => {
      const session = await sessionPromise;
      if (!session || session.id !== message.sessionId) {
        return;
      }
      const { kernel } = await ensureServices();
      await kernel.rehydrateInterventions(session.id);
    })();
  }

  if (typeof resolvedInterventionSyncChannel?.addEventListener === "function") {
    resolvedInterventionSyncChannel.addEventListener("message", handleInterventionSync);
  } else if (resolvedInterventionSyncChannel && "onmessage" in resolvedInterventionSyncChannel) {
    resolvedInterventionSyncChannel.onmessage = handleInterventionSync;
  }

  async function setManagedProfileConfig(activeServices, nextProfileConfig) {
    const nextManagedProfileConfig = syncLlmProfileConfig(
      activeServices?.profileConfig,
      nextProfileConfig,
    );
    profileConfig = nextManagedProfileConfig;
    if (activeServices) {
      activeServices.profileConfig = nextManagedProfileConfig;
      activeServices.kernel.setProfileConfig(nextManagedProfileConfig);
    }
    await persistConfigSummaryFromProfileConfig(chromeApi, nextManagedProfileConfig);
    return nextManagedProfileConfig;
  }

  async function syncProfileConfigFromConfigPatch(patch, activeServices) {
    const modelPatch = isPlainObject(patch) ? patch.model : undefined;
    if (!isPlainObject(modelPatch)) {
      return;
    }

    const current =
      cloneLlmProfileConfig(activeServices?.profileConfig) ??
      cloneLlmProfileConfig(profileConfig) ??
      (await loadLlmProfileConfig(chromeApi)) ??
      createEmptyLlmProfileConfig();
    const updated = applyConfigModelPatchToProfileConfig(current, modelPatch);
    if (!updated) {
      return;
    }

    await saveLlmProfileConfig(chromeApi, updated);
    await setManagedProfileConfig(activeServices, updated);
  }

  async function ensureServices() {
    if (!servicesPromise) {
      servicesPromise = (async () => {
        const storage = await createSessionStorage({
          sessionStorage,
          workspaceId,
        });
        const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
        const providers = new FamilyProviderRegistry();
        const managedProfileConfig: LlmProfileConfig | null = await loadManagedProfileConfig({
          chromeApi,
          initialProfileConfig: profileConfig,
        });
        const configControlPlane = createConfigControlPlane({
          summary: async () =>
            buildConfigControlPlaneSummary({
              baseSummary: await resolveMaybe(configSummary),
              persistedSummary: await loadConfigControlPlaneSummary(chromeApi),
              profileConfig: managedProfileConfig,
            }),
          persist: async (summary) => {
            await saveConfigControlPlaneSummary(chromeApi, summary);
          },
        });

        providers.register(createTabsCapabilityProvider(createChromeTabsTransport({ chromeApi })));
        providers.register(createConfigCapabilityProvider(configControlPlane));
        providers.register({
          family: "site",
          async invoke({ binding, input }) {
            switch (binding.operation) {
              case "fetch_with_session":
                return invokeSiteFetchWithSession(input);
              default:
                throw new CapabilityError(
                  "E_RUNTIME",
                  `Unsupported site operation: ${binding.operation}`,
                );
            }
          },
        });

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
        const llmProviderRegistry = new LlmProviderRegistry();
        llmProviderRegistry.register(createOpenAiCompatibleProvider());

        const resolvedLlmAdapter =
          llmAdapter ??
          (managedProfileConfig
            ? createKernelLlmFromProvider(llmProviderRegistry, managedProfileConfig)
            : { complete: async () => "" });

        const kernel = createKernel({
          storage,
          llm: resolvedLlmAdapter,
          registry,
          providers,
          providerRegistry: llmProviderRegistry,
          profileConfig: managedProfileConfig ?? undefined,
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
          llmProviderRegistry,
          profileConfig: managedProfileConfig,
        };
      })();
    }
    return servicesPromise;
  }

  async function ensureSession() {
    if (!sessionPromise) {
      sessionPromise = ensureServices().then(async ({ kernel }) => {
        const existing = pickRuntimeSession(await kernel.listSessions());
        const session =
          existing ??
          (await kernel.createSession({
            title: "mv3-shell runtime session",
          }));
        await kernel.rehydrateInterventions(session.id);
        return session;
      });
    }
    return sessionPromise;
  }

  async function dispatchCapability({
    capabilityId,
    input = {},
    skillId = "mv3-shell.background",
    permissions = ["*"],
  }) {
    const [services, session] = await Promise.all([ensureServices(), ensureSession()]);
    if (capabilityId === "config.update") {
      if (!isPlainObject(input)) {
        throw new CapabilityError("E_BAD_INPUT", "Capability input must be an object");
      }
      const validatedPatch = normalizeSupportedConfigPatch(input.patch);
      const sanitizedPatch = await syncRemoteTransportConfigFromConfigPatch(
        chromeApi,
        validatedPatch,
      );
      await syncProfileConfigFromConfigPatch(validatedPatch, services);
      return services.configControlPlane.update(sanitizedPatch);
    }

    const { registry, providers } = services;
    return dispatchCapabilityCall({
      registry,
      providers,
      sessionId: session.id,
      capabilityId,
      input,
      skillId,
      permissions,
      listSkills: async () => skillManager.listActiveIds(),
      manageSkill: async (request) => skillManager.manage(request),
    });
  }

  async function getKernelRuntimeState() {
    const [{ kernel }, session] = await Promise.all([ensureServices(), ensureSession()]);
    return {
      session,
      runState: kernel.getRunState(session.id),
      activeProfile: kernel.getActiveProfile(),
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
    await persistAndBroadcastInterventions(session.id);
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
    const items = kernel.listInterventions({
      sessionId: session.id,
    });
    await persistAndBroadcastInterventions(session.id);
    return items;
  }

  async function readInterventionAudit(limit) {
    if (!sessionPromise) {
      return [];
    }
    const [{ kernel }, session] = await Promise.all([ensureServices(), sessionPromise]);
    const entries = kernel.readInterventionAudit({
      sessionId: session.id,
      limit,
    });
    await persistAndBroadcastInterventions(session.id);
    return entries;
  }

  async function readReplayContinuityMarkers(limit) {
    if (!sessionPromise) {
      return [];
    }
    const [{ kernel }, session] = await Promise.all([ensureServices(), sessionPromise]);
    const entries = await kernel.sessions.getEntries(session.id);
    const markers = entries
      .filter((entry) => {
        if (entry?.type !== "compaction") {
          return false;
        }
        const payload = entry.payload;
        return (
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          typeof payload.summary === "string" &&
          typeof payload.firstKeptEntryId === "string" &&
          (payload.previousSummary === undefined || typeof payload.previousSummary === "string")
        );
      })
      .map((entry) => ({
        entryId: entry.entryId,
        sessionId: session.id,
        timestamp: entry.timestamp,
        summary: entry.payload.summary,
        firstKeptEntryId: entry.payload.firstKeptEntryId,
        ...(typeof entry.payload.previousSummary === "string"
          ? { previousSummary: entry.payload.previousSummary }
          : {}),
      }));
    const max =
      typeof limit === "number" && Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : null;
    return max == null ? markers : markers.slice(-max);
  }

  async function resolveIntervention({ id, resolution } = {}) {
    if (typeof id !== "string" || !id.trim()) {
      throw new CapabilityError("E_BAD_INPUT", "intervention.resolve requires a request id");
    }
    const { kernel } = await ensureServices();
    const record = kernel.resolveIntervention(
      id,
      isPlainObject(resolution) ? resolution : undefined,
    );
    if (record.sessionId) {
      await persistAndBroadcastInterventions(record.sessionId);
    }
    return record;
  }

  async function cancelIntervention({ id, reason } = {}) {
    if (typeof id !== "string" || !id.trim()) {
      throw new CapabilityError("E_BAD_INPUT", "intervention.cancel requires a request id");
    }
    const { kernel } = await ensureServices();
    const record = kernel.cancelIntervention(
      id,
      typeof reason === "string" && reason.trim() ? { reason: reason.trim() } : undefined,
    );
    if (record.sessionId) {
      await persistAndBroadcastInterventions(record.sessionId);
    }
    return record;
  }

  async function listSkills() {
    return skillManager.list();
  }

  async function buildChatBootstrap() {
    const [{ kernel }, session] = await Promise.all([ensureServices(), ensureSession()]);
    const context = await kernel.buildContext(session.id);

    return {
      sessionId: session.id,
      messages: context.messages.map((message) => toChatTranscriptItem(message)).filter(Boolean),
      runState: {
        status: normalizeChatRunStatus(chatRunStatus),
      },
    };
  }

  async function emitChatRunState(sessionId, status) {
    chatRunStatus = normalizeChatRunStatus(status);
    await emitRuntimeChatEvent(chromeApi, {
      type: "run.state",
      sessionId,
      status: chatRunStatus,
    });
  }

  async function sendChatPrompt({ text } = {}) {
    const prompt = typeof text === "string" ? text.trim() : "";
    if (!prompt) {
      throw new CapabilityError("E_BAD_INPUT", "runtime.chat.send requires a non-empty text");
    }

    if (activeChatRun && chatRunStatus === "running") {
      throw new CapabilityError(
        "E_RUNTIME",
        "runtime.chat.send requires the current run to finish",
      );
    }

    const [services, session] = await Promise.all([ensureServices(), ensureSession()]);
    const { kernel, registry, profileConfig: managedProfileConfig } = services;
    const activeProfile = kernel.getActiveProfile();
    const providerRegistry = kernel.getProviderRegistry();

    const runId = `chat-${crypto.randomUUID()}`;
    const assistantMessageId = `assistant-${crypto.randomUUID()}`;
    const controller = new AbortController();
    activeChatRun = {
      id: runId,
      sessionId: session.id,
      assistantMessageId,
      controller,
    };

    await emitChatRunState(session.id, "running");

    const hasLlmConfig =
      activeProfile?.ok === true &&
      providerRegistry &&
      managedProfileConfig &&
      Array.isArray(managedProfileConfig.profiles) &&
      managedProfileConfig.profiles.length > 0;

    void (async () => {
      let finalAssistantText = "";
      try {
        if (!hasLlmConfig) {
          // Fallback: no LLM configured, emit a helpful message
          const fallbackText =
            "No LLM provider is configured. Please set an API key via config.update to enable the agent loop.";
          finalAssistantText = fallbackText;

          await emitRuntimeChatEvent(chromeApi, {
            type: "assistant.delta",
            sessionId: session.id,
            messageId: assistantMessageId,
            chunk: fallbackText,
          });

          await kernel.appendMessage(session.id, {
            role: "user",
            text: prompt,
          });
          await kernel.appendMessage(session.id, {
            role: "assistant",
            text: fallbackText,
          });

          await emitRuntimeChatEvent(chromeApi, {
            type: "assistant.done",
            sessionId: session.id,
            messageId: assistantMessageId,
            text: fallbackText,
          });

          if (activeChatRun?.id === runId) {
            activeChatRun = null;
            await emitChatRunState(session.id, "idle");
          }
          return;
        }

        // Real LLM loop via runLoop()
        const provider = providerRegistry.get(activeProfile.route.provider);
        if (!provider) {
          throw new CapabilityError("E_RUNTIME", "LLM provider not available");
        }

        const result = await runLoop(
          {
            kernel,
            registry,
            provider,
            profileConfig: managedProfileConfig,
          },
          {
            sessionId: session.id,
            prompt,
            signal: controller.signal,
            onDelta(chunk) {
              finalAssistantText += chunk;
              void emitRuntimeChatEvent(chromeApi, {
                type: "assistant.delta",
                sessionId: session.id,
                messageId: assistantMessageId,
                chunk,
              });
            },
            onToolCall(toolName, _args) {
              const toolMsgId = `tool-${crypto.randomUUID()}`;
              void emitRuntimeChatEvent(chromeApi, {
                type: "tool.call",
                sessionId: session.id,
                messageId: toolMsgId,
                toolName,
              });
            },
            onToolResult(toolName, resultData) {
              const toolMsgId = `tool-${crypto.randomUUID()}`;
              const summary = summarizeChatToolDetail(
                resultData && typeof resultData === "object" && "data" in resultData
                  ? JSON.stringify(resultData.data)
                  : String(resultData ?? ""),
              );
              void emitRuntimeChatEvent(chromeApi, {
                type: "tool.result",
                sessionId: session.id,
                messageId: toolMsgId,
                toolName,
                summary,
                detail:
                  typeof resultData === "string" ? resultData : JSON.stringify(resultData ?? null),
              });
            },
            async onStepTelemetry(entry) {
              if (typeof onLoopTelemetry !== "function") {
                return;
              }
              try {
                await onLoopTelemetry(entry);
              } catch {
                // Telemetry should never break the primary loop.
              }
            },
          },
        );

        await emitRuntimeChatEvent(chromeApi, {
          type: "assistant.done",
          sessionId: session.id,
          messageId: assistantMessageId,
          text: finalAssistantText,
          terminalStatus: result.terminalStatus,
          stepCount: result.stepCount,
        });

        if (activeChatRun?.id === runId) {
          activeChatRun = null;
          await emitChatRunState(session.id, "idle");
        }
      } catch (error) {
        if (controller.signal.aborted) {
          if (activeChatRun?.id === runId) {
            activeChatRun = null;
          }
          return;
        }
        if (activeChatRun?.id === runId) {
          activeChatRun = null;
          chatRunStatus = "idle";
        }
        await emitRuntimeChatEvent(chromeApi, {
          type: "run.error",
          sessionId: session.id,
          message: error instanceof Error ? error.message : String(error),
        });
        await emitChatRunState(session.id, "idle");
      }
    })();

    return {
      sessionId: session.id,
      accepted: true,
      runState: {
        status: normalizeChatRunStatus(chatRunStatus),
      },
    };
  }

  async function stopChatRun() {
    const session = await ensureSession();
    if (activeChatRun?.controller) {
      activeChatRun.controller.abort();
      activeChatRun = null;
    }
    await emitChatRunState(session.id, "stopped");
    return {
      sessionId: session.id,
      runState: {
        status: normalizeChatRunStatus(chatRunStatus),
      },
    };
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
    let executed: any;
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
      escalationMs: interventionEscalationMs,
    });
    await persistAndBroadcastInterventions(session.id);

    return {
      ...result,
      intervention: requested,
    };
  }

  async function invokeSiteFetchWithSession(input: unknown): Promise<SiteFetchWithSessionResult> {
    const request = buildSiteFetchWithSessionRequest({
      input,
      tab: toCanonicalTab(await requireActiveTab(chromeApi, "site.fetch_with_session")),
      scriptPath: pageHookScriptPath,
    });
    const result = await invokeSiteSkill({
      skillId: request.skillId,
      action: request.action,
      tab: request.tab,
      input: request.input,
      plan: request.plan,
      module: request.module,
      verifier: request.verifier,
    });
    return toSiteFetchWithSessionResult(result.result);
  }

  async function invokePageAction({ action, input = {}, ctx = {} } = {}) {
    if (action === "screenshot") {
      if (!chromeApi?.tabs?.captureVisibleTab) {
        throw new CapabilityError(
          "E_RUNTIME",
          "chrome.tabs.captureVisibleTab is required for page.screenshot",
        );
      }

      const activeTab = await requireActiveTab(chromeApi, "page.screenshot");
      const screenshotOptions = normalizeScreenshotRequest(input);
      const dataUrl = await chromeApi.tabs.captureVisibleTab(activeTab.windowId, screenshotOptions);

      return {
        result: {
          dataUrl,
          format: screenshotOptions.format,
        },
        verified: true,
        trace: ["invoke:screenshot"],
        timelineEvents: [],
        rawEvents: [],
      };
    }

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
    let executed: any;
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
      escalationMs: interventionEscalationMs,
    });
    await persistAndBroadcastInterventions(session.id);

    return {
      ...result,
      intervention: requested,
    };
  }

  function getLoopStatus() {
    return {
      status: normalizeChatRunStatus(chatRunStatus),
      hasActiveRun: activeChatRun !== null,
      activeRunId: activeChatRun?.id ?? null,
    };
  }

  async function updateLlmConfig(patch) {
    if (!patch || typeof patch !== "object") {
      throw new CapabilityError("E_BAD_INPUT", "llm.config.update requires a config patch");
    }

    const activeServices = servicesPromise ? await servicesPromise : null;
    const current = cloneLlmProfileConfig(activeServices?.profileConfig) ??
      cloneLlmProfileConfig(profileConfig) ??
      (await loadLlmProfileConfig(chromeApi)) ?? {
        profiles: [],
        defaultProfile: "default",
      };

    const updated: LlmProfileConfig = { ...current };

    // Support quick API key setup: { apiKey, baseUrl?, model? }
    if (typeof patch.apiKey === "string") {
      const defaultProfile = updated.profiles.find((p) => p.id === "default") ?? {
        id: "default",
        providerId: "openai_compatible",
        llmBase: "",
        llmKey: "",
        llmModel: "",
      };
      defaultProfile.llmKey = patch.apiKey;
      if (typeof patch.baseUrl === "string") {
        defaultProfile.llmBase = patch.baseUrl;
      } else if (!defaultProfile.llmBase) {
        defaultProfile.llmBase = "https://api.openai.com/v1";
      }
      if (typeof patch.model === "string") {
        defaultProfile.llmModel = patch.model;
      } else if (!defaultProfile.llmModel) {
        defaultProfile.llmModel = "gpt-4o";
      }
      updated.profiles = updated.profiles.filter((p) => p.id !== "default");
      updated.profiles.unshift(defaultProfile);
      updated.defaultProfile = "default";
    }

    if (Array.isArray(patch.profiles)) {
      updated.profiles = patch.profiles;
    }
    if (typeof patch.defaultProfile === "string") {
      updated.defaultProfile = patch.defaultProfile;
    }
    if (typeof patch.fallbackProfile === "string") {
      updated.fallbackProfile = patch.fallbackProfile;
    }

    await saveLlmProfileConfig(chromeApi, updated);

    await setManagedProfileConfig(activeServices, updated);

    return { updated: true, profileCount: updated.profiles.length };
  }

  return {
    bootstrapChat: buildChatBootstrap,
    dispatchCapability,
    ensureServices,
    ensureSession,
    getConfigBootstrapSummary,
    getInterventionState,
    getKernelRuntimeState,
    getLoopStatus,
    invokePageAction,
    invokeSiteSkill,
    listSkills,
    listInterventions,
    readInterventionAudit,
    readReplayContinuityMarkers,
    resolveIntervention,
    cancelIntervention,
    sendChatPrompt,
    stopChatRun,
    updateLlmConfig,
  };
}
