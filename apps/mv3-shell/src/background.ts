// @ts-nocheck
import {
  AI_SURFACE_RESOURCE_IDS,
  CONFIG_AUDIT_STATUSES,
  CONFIG_RESOURCE_FIELDS,
  BOOTSTRAP_RESOURCE_KEYS as CONTRACT_BOOTSTRAP_RESOURCE_KEYS,
  CapabilityError,
  HOST_AUDIT_KINDS,
  HOST_AUDIT_STATUSES,
  LOOP_AUDIT_KINDS,
  LOOP_AUDIT_STATUSES,
  SKILL_AUDIT_KINDS,
} from "@bbl-next/contracts";
import { createBootstrapSummary, readAiSurfaceResource } from "@bbl-next/core";
import { invokeSingleActionSiteSkill } from "@bbl-next/site-runtime";
import { createPageHookBridge } from "./page-hook-bridge.js";
import {
  createBackgroundRuntimeServices,
  loadConfiguredRemoteHostTransport,
} from "./runtime-services.js";

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
const REMOTE_HOST_ID = "remote";
const AUDIT_STORAGE_KEY = "bbl-next.audit.tail.v1";
const LEGACY_AUDIT_STORAGE_KEYS = ["bbl-next.audit.host.v1"];
const AUDIT_RETENTION_DEFAULTS = {
  maxEntries: 500,
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
};

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

function cloneValue(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function isAiSurfaceResourceId(value) {
  return typeof value === "string" && AI_SURFACE_RESOURCE_IDS.includes(value);
}

function normalizeAuditEntry(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (typeof value.kind !== "string" || typeof value.status !== "string") {
    return null;
  }
  const baseEntry = {
    timestamp: typeof value.timestamp === "string" ? value.timestamp : isoNow(),
    sessionId: typeof value.sessionId === "string" ? value.sessionId : null,
    kind: value.kind,
    status: value.status,
  };

  if (HOST_AUDIT_KINDS.includes(value.kind)) {
    if (!HOST_AUDIT_STATUSES.includes(value.status) || typeof value.hostId !== "string") {
      return null;
    }
    const entry = {
      ...baseEntry,
      hostId: value.hostId,
    };
    if (typeof value.error === "string" && value.error.length > 0) {
      entry.error = value.error;
    }
    return entry;
  }

  if (value.kind === "config.update") {
    if (!CONFIG_AUDIT_STATUSES.includes(value.status)) {
      return null;
    }
    const changedFields = Array.isArray(value.changedFields)
      ? value.changedFields.filter((field) => CONFIG_RESOURCE_FIELDS.includes(field))
      : [];
    const entry = {
      ...baseEntry,
      changedFields,
    };
    if (typeof value.error === "string" && value.error.length > 0) {
      entry.error = value.error;
    }
    return entry;
  }

  if (SKILL_AUDIT_KINDS.includes(value.kind)) {
    if (
      !["installed", "enabled", "disabled", "archived"].includes(value.status) ||
      typeof value.skillId !== "string"
    ) {
      return null;
    }
    const entry = {
      ...baseEntry,
      skillId: value.skillId,
      ...(typeof value.trusted === "boolean" ? { trusted: value.trusted } : {}),
    };
    if (typeof value.error === "string" && value.error.length > 0) {
      entry.error = value.error;
    }
    return entry;
  }

  if (LOOP_AUDIT_KINDS.includes(value.kind)) {
    if (!LOOP_AUDIT_STATUSES.includes(value.status) || typeof value.capabilityId !== "string") {
      return null;
    }
    const entry = {
      ...baseEntry,
      capabilityId: value.capabilityId,
      durationMs: typeof value.durationMs === "number" ? value.durationMs : 0,
    };
    if (typeof value.error === "string" && value.error.length > 0) {
      entry.error = value.error;
    }
    return entry;
  }

  return null;
}

function trimByRetention(entries, retention) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return entries;
  }
  const { maxEntries, maxAgeMs } = retention;
  let result = entries;
  if (typeof maxAgeMs === "number" && maxAgeMs > 0) {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    result = result.filter(
      (entry) => typeof entry?.timestamp === "string" && entry.timestamp >= cutoff,
    );
  }
  if (typeof maxEntries === "number" && maxEntries > 0 && result.length > maxEntries) {
    result = result.slice(-maxEntries);
  }
  return result;
}

function createChromeAuditStore(
  chromeApi,
  storageKey = AUDIT_STORAGE_KEY,
  legacyStorageKeys = LEGACY_AUDIT_STORAGE_KEYS,
  retention = AUDIT_RETENTION_DEFAULTS,
) {
  const storageArea = chromeApi?.storage?.local;
  if (typeof storageArea?.get !== "function" || typeof storageArea?.set !== "function") {
    return undefined;
  }
  return {
    retention,
    async load() {
      const keys = [storageKey, ...legacyStorageKeys];
      const loaded = await storageArea.get(keys);
      let raw = [];
      if (Array.isArray(loaded?.[storageKey])) {
        raw = loaded[storageKey];
      } else {
        raw = [];
        for (const legacyKey of legacyStorageKeys) {
          if (Array.isArray(loaded?.[legacyKey])) {
            raw = loaded[legacyKey];
            break;
          }
        }
      }
      return trimByRetention(raw, retention);
    },
    async save(entries) {
      const trimmed = trimByRetention(entries, retention);
      await storageArea.set({
        [storageKey]: trimmed,
      });
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
    recent: [],
  };
}

function cloneInterventionRecord(entry) {
  return {
    id: entry.id,
    kind: entry.kind,
    trigger: entry.trigger,
    status: entry.status,
    title: entry.title,
    message: entry.message,
    sessionId: entry.sessionId ?? null,
    skillId: entry.skillId ?? undefined,
    action: entry.action ?? undefined,
    tabId: entry.tabId ?? null,
    payload: entry.payload,
    requestedAt: entry.requestedAt,
    updatedAt: entry.updatedAt,
    expiresAt: entry.expiresAt,
    escalation: entry.escalation ? { ...entry.escalation } : null,
    resolution: entry.resolution,
  };
}

function buildInterventionObservabilitySummary(summary, items) {
  const records = Array.isArray(items) ? items.map((entry) => cloneInterventionRecord(entry)) : [];
  const active = records.filter((entry) => entry.status === "requested");
  const recent = records.filter((entry) => entry.status !== "requested");
  return {
    ...(summary && typeof summary === "object" && "sessionId" in summary
      ? { sessionId: summary.sessionId ?? null }
      : {}),
    status:
      typeof summary?.status === "string"
        ? summary.status
        : records.length === 0
          ? "empty"
          : active.length > 0
            ? "requested"
            : "settled",
    totalCount: typeof summary?.totalCount === "number" ? summary.totalCount : records.length,
    activeCount: typeof summary?.activeCount === "number" ? summary.activeCount : active.length,
    recentCount: recent.length,
    active,
    recent,
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

function unsupportedHostOperation({ hostId, kind = "exec" } = {}) {
  return {
    ok: false,
    error: {
      code: "E_CAPABILITY_NOT_FOUND",
      message: `Execution host adapter does not implement ${kind}`,
      details: {
        kind,
        hostId: hostId ?? null,
        reason: "operation_not_supported",
      },
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

function localHostCapabilities() {
  return {
    read: true,
    write: true,
    edit: true,
    exec: false,
  };
}

function remoteHostCapabilities() {
  return {
    read: false,
    write: false,
    edit: false,
    exec: true,
  };
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
      interventions: input.runtime?.interventions,
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

async function readInterventionObservabilitySnapshot(runtimeServiceApi) {
  const [summary, items] = await Promise.all([
    typeof runtimeServiceApi.getInterventionState === "function"
      ? runtimeServiceApi.getInterventionState()
      : emptyInterventionState(),
    typeof runtimeServiceApi.listInterventions === "function"
      ? runtimeServiceApi.listInterventions()
      : [],
  ]);

  return {
    items,
    summary: buildInterventionObservabilitySummary(summary, items),
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
      skillId: entry,
      status: "installed",
      enabled: false,
      trusted: false,
      source: "lifecycle",
      recentChange: null,
      lastChangedAt: null,
      version: null,
      kind: null,
      description: null,
      permissions: [],
      tags: [],
      matches: [],
      requiresActiveTab: false,
      actions: [],
    };
  }
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const id =
    typeof entry.id === "string"
      ? entry.id
      : typeof entry.skillId === "string"
        ? entry.skillId
        : null;
  if (!id) {
    return null;
  }
  const status =
    typeof entry.status === "string"
      ? entry.status
      : entry.enabled === true || entry.state === "enabled"
        ? "enabled"
        : "installed";
  return {
    skillId: id,
    status,
    enabled: status === "enabled",
    trusted: entry.trusted === true,
    source:
      entry.source === "package" || entry.source === "definition" ? entry.source : "lifecycle",
    recentChange: typeof entry.recentChange === "string" ? entry.recentChange : null,
    lastChangedAt: typeof entry.lastChangedAt === "string" ? entry.lastChangedAt : null,
    ...(typeof entry.packageUri === "string" ? { packageUri: entry.packageUri } : {}),
    ...(typeof entry.entry === "string" ? { entry: entry.entry } : {}),
    version: Number.isInteger(entry.version) ? entry.version : null,
    kind: typeof entry.kind === "string" ? entry.kind : null,
    description: typeof entry.description === "string" ? entry.description : null,
    permissions: Array.isArray(entry.permissions)
      ? entry.permissions.filter((item) => typeof item === "string")
      : [],
    tags: Array.isArray(entry.tags) ? entry.tags.filter((item) => typeof item === "string") : [],
    matches: Array.isArray(entry.matches)
      ? entry.matches.filter((item) => typeof item === "string")
      : [],
    requiresActiveTab: entry.requiresActiveTab === true,
    actions: Array.isArray(entry.actions)
      ? entry.actions
          .filter((action) => action && typeof action === "object")
          .map((action) => ({
            ...action,
            ...(Array.isArray(action.injectionSteps)
              ? {
                  injectionSteps: action.injectionSteps
                    .filter((step) => step && typeof step === "object" && !Array.isArray(step))
                    .map((step) => ({ ...step })),
                }
              : {}),
          }))
      : [],
  };
}

function pickLatestSkillChange(skillEntries) {
  return skillEntries.reduce((latest, entry) => {
    if (!entry.recentChange) {
      return latest;
    }
    if (!latest) {
      return entry;
    }
    if (!latest.lastChangedAt) {
      return entry;
    }
    if (!entry.lastChangedAt) {
      return latest;
    }
    return entry.lastChangedAt >= latest.lastChangedAt ? entry : latest;
  }, null);
}

function createTimeoutPromise(kind, requestId, timeoutMs) {
  let timerId: ReturnType<typeof setTimeout> | undefined;
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
  sessionStorage = undefined,
  profileConfig = undefined,
  runtimeServices = undefined,
  interventionTimeoutMs = undefined,
  auditStore = undefined,
  auditStorageKey = AUDIT_STORAGE_KEY,
  auditRetention = AUDIT_RETENTION_DEFAULTS,
  remoteTransport = undefined,
  remoteTransports = undefined,
  skillDefinitions = [],
}: any = {}): any {
  const effectivePageHookBridge =
    pageHookBridge ??
    (typeof chromeApi?.scripting?.executeScript === "function"
      ? createPageHookBridge({ chromeApi })
      : undefined);
  let creating = null;
  let requestSequence = 0;
  const resolvedRetention = auditRetention ?? AUDIT_RETENTION_DEFAULTS;
  const AUDIT_MAX_ENTRIES = resolvedRetention.maxEntries;
  const TELEMETRY_MAX_ENTRIES = 128;
  const OBSERVABILITY_EXPORT_MAX_ENTRIES = 256;
  const auditEntries = [];
  const loopTelemetryEntries = [];
  const observabilityTimelineEvents = [];
  const observabilityRawEvents = [];
  let observabilityRawEventSequence = 0;
  const resolvedAuditStore =
    auditStore ??
    createChromeAuditStore(
      chromeApi,
      auditStorageKey,
      LEGACY_AUDIT_STORAGE_KEYS,
      resolvedRetention,
    );
  const state = {
    defaultHostId: null,
    hostReady: false,
    hostLastSeenAt: undefined,
    hostRecoveredAt: undefined,
    hostRecoveryReason: undefined,
    remoteHosts: {},
    lastRuntimeError: null,
    lastRuntimeErrorClearedAt: null,
  };
  const hasExplicitRemoteTransportConfig =
    remoteTransport !== undefined || remoteTransports !== undefined;
  let activeRemoteTransports = new Map();
  let configuredRemoteTransportLoaded = hasExplicitRemoteTransportConfig;
  let composedRuntimeServices = null;

  function normalizeRemoteTransportEntries(...inputs) {
    const entries = [];
    let fallbackIndex = 0;

    for (const input of inputs) {
      if (input == null) {
        continue;
      }
      const values = Array.isArray(input) ? input : [input];
      for (const value of values) {
        const hasTransportWrapper =
          value && typeof value === "object" && "transport" in value && value.transport;
        const transport = hasTransportWrapper ? value.transport : value;
        if (!transport || typeof transport !== "object") {
          continue;
        }
        const hostIdCandidate = hasTransportWrapper ? value.hostId : transport.hostId;
        const fallbackHostId = fallbackIndex === 0 ? REMOTE_HOST_ID : `remote-${fallbackIndex + 1}`;
        const hostId =
          typeof hostIdCandidate === "string" && hostIdCandidate.trim().length > 0
            ? hostIdCandidate.trim()
            : fallbackHostId;
        entries.push({
          hostId,
          transport,
        });
        fallbackIndex += 1;
      }
    }

    return entries;
  }

  function createEmptyRemoteHostState() {
    return {
      connected: false,
      healthStatus: "unknown",
      checkedAt: undefined,
      error: null,
    };
  }

  function getRemoteHostState(hostId) {
    if (!state.remoteHosts[hostId]) {
      state.remoteHosts[hostId] = createEmptyRemoteHostState();
    }
    return state.remoteHosts[hostId];
  }

  function setActiveRemoteTransports(entries) {
    const nextRemoteTransports = new Map();
    for (const entry of entries) {
      nextRemoteTransports.set(entry.hostId, entry.transport);
      getRemoteHostState(entry.hostId);
    }
    for (const hostId of Object.keys(state.remoteHosts)) {
      if (!nextRemoteTransports.has(hostId)) {
        delete state.remoteHosts[hostId];
      }
    }
    if (state.defaultHostId !== LOCAL_HOST_ID && !nextRemoteTransports.has(state.defaultHostId)) {
      state.defaultHostId = null;
    }
    activeRemoteTransports = nextRemoteTransports;
    return activeRemoteTransports;
  }

  if (hasExplicitRemoteTransportConfig) {
    setActiveRemoteTransports(normalizeRemoteTransportEntries(remoteTransport, remoteTransports));
  }

  function hasRemoteHost(hostId) {
    if (typeof hostId === "string" && hostId.trim().length > 0) {
      return activeRemoteTransports.has(hostId);
    }
    return activeRemoteTransports.size > 0;
  }

  function isRemoteHostId(hostId) {
    return typeof hostId === "string" && hostId !== LOCAL_HOST_ID && hasRemoteHost(hostId);
  }

  function getRemoteHostIds() {
    return [...activeRemoteTransports.keys()];
  }

  function getRemoteTransport(hostId) {
    return activeRemoteTransports.get(hostId) ?? null;
  }

  async function syncConfiguredRemoteTransport(force = false) {
    if (hasExplicitRemoteTransportConfig) {
      configuredRemoteTransportLoaded = true;
      return activeRemoteTransports;
    }
    if (configuredRemoteTransportLoaded && !force) {
      return activeRemoteTransports;
    }

    const configuredRemoteTransport = await loadConfiguredRemoteHostTransport({
      chromeApi,
    });
    configuredRemoteTransportLoaded = true;
    return setActiveRemoteTransports(normalizeRemoteTransportEntries(configuredRemoteTransport));
  }

  function createRemoteTransportError(error, action, hostId) {
    const normalized = toBridgeError(error, "E_RUNTIME");
    const details = {
      ...(normalized.details && typeof normalized.details === "object" ? normalized.details : {}),
      kind: "transport",
      hostId,
      reason: "transport_unavailable",
      action,
    };
    return {
      ...normalized,
      details,
    };
  }

  async function describeRemoteTransportAvailability(hostId, action) {
    await syncConfiguredRemoteTransport();
    const resolvedRemoteTransport = getRemoteTransport(hostId);
    if (
      !resolvedRemoteTransport ||
      typeof resolvedRemoteTransport.describeAvailability !== "function"
    ) {
      return null;
    }
    try {
      return (
        (await resolvedRemoteTransport.describeAvailability({
          hostId,
          action,
        })) ?? null
      );
    } catch (error) {
      return {
        available: false,
        error: createRemoteTransportError(error, action, hostId),
      };
    }
  }

  async function getRemoteTransportAvailability(hostId, action) {
    await syncConfiguredRemoteTransport();
    const resolvedRemoteTransport = getRemoteTransport(hostId);
    if (!resolvedRemoteTransport) {
      return {
        available: false,
        error: createRemoteTransportError(
          {
            code: "E_RUNTIME",
            message: "Remote transport is unavailable",
          },
          action,
          hostId,
        ),
      };
    }

    const describedAvailability = await describeRemoteTransportAvailability(hostId, action);
    if (describedAvailability && typeof describedAvailability === "object") {
      if (describedAvailability.available === false) {
        return {
          available: false,
          error: createRemoteTransportError(
            describedAvailability.error ?? {
              code: "E_RUNTIME",
              message: "Remote transport is unavailable",
            },
            action,
            hostId,
          ),
        };
      }
      if (describedAvailability.available === true) {
        return {
          available: true,
          error: null,
        };
      }
    }

    if (typeof resolvedRemoteTransport.isAvailable === "function") {
      try {
        const available = await resolvedRemoteTransport.isAvailable({
          hostId,
          action,
        });
        return available
          ? {
              available: true,
              error: null,
            }
          : {
              available: false,
              error: createRemoteTransportError(
                {
                  code: "E_RUNTIME",
                  message: "Remote transport is unavailable",
                },
                action,
                hostId,
              ),
            };
      } catch (error) {
        return {
          available: false,
          error: createRemoteTransportError(error, action, hostId),
        };
      }
    }

    return {
      available: true,
      error: null,
    };
  }

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

  async function appendAudit(auditInput) {
    await auditReady;
    const entry = normalizeAuditEntry({
      timestamp: isoNow(),
      sessionId: await resolveAuditSessionId(),
      ...auditInput,
      ...(auditInput?.error
        ? {
            error:
              typeof auditInput.error === "string"
                ? auditInput.error
                : (auditInput.error.message ?? String(auditInput.error)),
          }
        : {}),
    });
    if (!entry) {
      throw new Error(`Invalid audit entry for ${auditInput?.kind ?? "unknown"}`);
    }
    auditEntries.push(entry);
    if (auditEntries.length > AUDIT_MAX_ENTRIES) {
      auditEntries.splice(0, auditEntries.length - AUDIT_MAX_ENTRIES);
    }
    await persistAuditEntries();
    return entry;
  }

  function appendLoopTelemetry(entry) {
    if (!entry || typeof entry !== "object") {
      return;
    }
    loopTelemetryEntries.push({ ...entry });
    if (loopTelemetryEntries.length > TELEMETRY_MAX_ENTRIES) {
      loopTelemetryEntries.splice(0, loopTelemetryEntries.length - TELEMETRY_MAX_ENTRIES);
    }
  }

  function appendObservabilityExportEvents(value) {
    if (!value || typeof value !== "object") {
      return;
    }

    if (Array.isArray(value.timelineEvents)) {
      for (const event of value.timelineEvents) {
        if (!event || typeof event !== "object") {
          continue;
        }
        observabilityTimelineEvents.push(cloneValue(event));
      }
      if (observabilityTimelineEvents.length > OBSERVABILITY_EXPORT_MAX_ENTRIES) {
        observabilityTimelineEvents.splice(
          0,
          observabilityTimelineEvents.length - OBSERVABILITY_EXPORT_MAX_ENTRIES,
        );
      }
    }

    if (Array.isArray(value.rawEvents)) {
      for (const entry of value.rawEvents) {
        if (!entry || typeof entry !== "object") {
          continue;
        }
        observabilityRawEventSequence += 1;
        observabilityRawEvents.push({
          ...cloneValue(entry),
          index: observabilityRawEventSequence,
        });
      }
      if (observabilityRawEvents.length > OBSERVABILITY_EXPORT_MAX_ENTRIES) {
        observabilityRawEvents.splice(
          0,
          observabilityRawEvents.length - OBSERVABILITY_EXPORT_MAX_ENTRIES,
        );
      }
    }
  }

  function getLoopTelemetry(limit) {
    const max = typeof limit === "number" && limit > 0 ? limit : TELEMETRY_MAX_ENTRIES;
    return loopTelemetryEntries.slice(-max);
  }

  function readRuntimeHistoryResource(limit) {
    const entries = getLoopTelemetry(limit);
    return {
      ok: true,
      data: readAiSurfaceResource({
        resourceId: "runtime.history",
        runtimeHistory: {
          generatedAt: isoNow(),
          entries: entries.map((entry) => ({ ...entry })),
        },
      }),
    };
  }

  function getAuditTail(limit) {
    const max = typeof limit === "number" && limit > 0 ? limit : AUDIT_MAX_ENTRIES;
    return auditEntries.slice(-max);
  }

  function toInterventionEscalationAuditEntry(entry) {
    const escalation = entry?.details?.escalation;
    if (!escalation || typeof escalation !== "object" || Array.isArray(escalation)) {
      return null;
    }
    const thresholdMs =
      typeof escalation.thresholdMs === "number" && escalation.thresholdMs > 0
        ? escalation.thresholdMs
        : null;
    const reason = escalation.reason === "timeout" ? "timeout" : "stale";
    if (thresholdMs == null) {
      return null;
    }
    return {
      timestamp: entry.timestamp,
      sessionId: entry.sessionId ?? null,
      kind: "intervention.escalation",
      interventionId: entry.interventionId,
      status: reason === "timeout" ? "timed_out" : "attention_required",
      escalation: {
        reason,
        thresholdMs,
        ...(typeof escalation.overdueMs === "number" ? { overdueMs: escalation.overdueMs } : {}),
        ...(typeof escalation.expiresAt === "string" || escalation.expiresAt === null
          ? { expiresAt: escalation.expiresAt ?? null }
          : {}),
        ...(typeof escalation.tabId === "number" || escalation.tabId === null
          ? { tabId: escalation.tabId ?? null }
          : {}),
      },
    };
  }

  async function readCombinedAuditTail(limit) {
    await auditReady;
    const controlPlaneEntries = getAuditTail(AUDIT_MAX_ENTRIES);
    const interventionEntries =
      typeof getRuntimeServices().readInterventionAudit === "function"
        ? await getRuntimeServices().readInterventionAudit(AUDIT_MAX_ENTRIES)
        : [];
    const projectedInterventionEntries = interventionEntries
      .map((entry) => toInterventionEscalationAuditEntry(entry))
      .filter(Boolean);
    const merged = [...controlPlaneEntries, ...projectedInterventionEntries].sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp),
    );
    const max = typeof limit === "number" && limit > 0 ? limit : AUDIT_MAX_ENTRIES;
    return merged.slice(-max);
  }

  async function readAuditTail(limit) {
    return readCombinedAuditTail(limit);
  }

  async function readAuditResource(limit) {
    const entries = await readCombinedAuditTail(limit);
    return readAiSurfaceResource({
      resourceId: "audit.tail",
      auditTail: {
        entries,
        ...(typeof limit === "number" ? { limit } : {}),
      },
    });
  }

  function createDiagnosticsEntriesSummary(entries, limit = 10) {
    const max = typeof limit === "number" && limit > 0 ? limit : 10;
    const sliced = entries.slice(-max).map((entry) => ({ ...entry }));
    return {
      status: sliced.length > 0 ? "available" : "empty",
      totalCount: sliced.length,
      entries: sliced,
    };
  }

  function createDiagnosticsRunSummary(runtimeKernelState) {
    if (!runtimeKernelState?.runState) {
      return null;
    }
    return {
      phase: runtimeKernelState.runState.phase,
      queuedPrompts: {
        steer: Array.isArray(runtimeKernelState.runState.queue?.steer)
          ? runtimeKernelState.runState.queue.steer.length
          : 0,
        followUp: Array.isArray(runtimeKernelState.runState.queue?.followUp)
          ? runtimeKernelState.runState.queue.followUp.length
          : 0,
      },
      retry: runtimeKernelState.runState.retry
        ? {
            active: runtimeKernelState.runState.retry.active === true,
            attempt: runtimeKernelState.runState.retry.attempt ?? 0,
            maxAttempts: runtimeKernelState.runState.retry.maxAttempts ?? 0,
          }
        : {
            active: false,
            attempt: 0,
            maxAttempts: 0,
          },
    };
  }

  function buildDiagnosticsProviderRoute(activeProfile) {
    if (!activeProfile) {
      return {
        status: "empty",
        profile: null,
        provider: null,
        llmModel: null,
        orderedProfiles: [],
      };
    }

    if (activeProfile.ok) {
      return {
        status: "configured",
        profile: activeProfile.route.profile,
        provider: activeProfile.route.provider,
        llmModel: activeProfile.route.llmModel,
        orderedProfiles: Array.isArray(activeProfile.route.orderedProfiles)
          ? [...activeProfile.route.orderedProfiles]
          : [],
      };
    }

    return {
      status: "unavailable",
      profile: activeProfile.profile,
      provider: null,
      llmModel: null,
      orderedProfiles: [activeProfile.profile],
      reason: activeProfile.reason,
      message: activeProfile.message,
    };
  }

  function createLegacyKernelDiagnosticsSnapshot(runtimeKernelState, interventionState) {
    return {
      session: runtimeKernelState?.session
        ? {
            id: runtimeKernelState.session.id,
            createdAt: runtimeKernelState.session.createdAt ?? isoNow(),
            title: runtimeKernelState.session.title ?? null,
            model: runtimeKernelState.session.model ?? null,
          }
        : null,
      run: createDiagnosticsRunSummary(runtimeKernelState),
      loop: {
        stepCount: 0,
        noProgress: null,
        maxSteps: 0,
      },
      interventions: interventionState ?? emptyInterventionState(),
      provider: {
        route: buildDiagnosticsProviderRoute(runtimeKernelState?.activeProfile ?? null),
        registered: [],
      },
    };
  }

  function createDiagnosticsErrorSummary() {
    const lastError = getRuntimeError();
    const recentAudit = createDiagnosticsEntriesSummary(
      getAuditTail(10).filter((entry) => typeof entry.error === "string" && entry.error.length > 0),
    );

    return {
      status: lastError
        ? "active"
        : state.lastRuntimeErrorClearedAt
          ? "cleared"
          : recentAudit.totalCount > 0
            ? "recent"
            : "empty",
      lastError: lastError ? { ...lastError } : null,
      clearedAt: state.lastRuntimeErrorClearedAt,
      recentAudit,
    };
  }

  async function captureKernelDiagnosticsSnapshot(runtimeServiceApi) {
    const canUseExplicitKernelFacade =
      runtimeServices &&
      typeof runtimeServices.ensureServices === "function" &&
      typeof runtimeServices.ensureSession === "function";
    const canUseBaseKernelFacade =
      !runtimeServices &&
      typeof runtimeServiceApi?.ensureServices === "function" &&
      typeof runtimeServiceApi?.ensureSession === "function";

    if (canUseExplicitKernelFacade || canUseBaseKernelFacade) {
      const [{ kernel }, session] = await Promise.all([
        runtimeServiceApi.ensureServices(),
        runtimeServiceApi.ensureSession(),
      ]);
      if (kernel && typeof kernel.captureDiagnostics === "function" && session?.id) {
        return kernel.captureDiagnostics(session.id);
      }
    }

    const runtimeKernelState =
      typeof runtimeServiceApi?.getKernelRuntimeState === "function"
        ? await runtimeServiceApi.getKernelRuntimeState()
        : null;
    const interventionSnapshot = await readInterventionObservabilitySnapshot(runtimeServiceApi);
    return createLegacyKernelDiagnosticsSnapshot(runtimeKernelState, interventionSnapshot.summary);
  }

  function setRuntimeError(error) {
    if (error) {
      state.lastRuntimeError = {
        code: error.code ?? "E_RUNTIME",
        message: error.message ?? String(error),
        capturedAt: isoNow(),
      };
      state.lastRuntimeErrorClearedAt = null;
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
        sessionStorage,
        profileConfig,
        interventionTimeoutMs,
        skillDefinitions,
        onLoopTelemetry: async (entry) => {
          appendLoopTelemetry(entry);
          await appendAudit({
            kind: "loop.step",
            capabilityId: entry.capabilityId,
            status: entry.ok ? "executed" : "failed",
            durationMs: entry.durationMs,
            ...(entry.errorCode ? { error: entry.errorCode } : {}),
          });
        },
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

  function createRunnerHostProxy() {
    return {
      async invoke(request) {
        const response = await invoke(request);
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

  async function createBackgroundAutomationTab(automationTarget) {
    if (!automationTarget || automationTarget.lane !== "background") {
      throw new CapabilityError(
        "E_BAD_INPUT",
        "Background automation target requires lane=background",
      );
    }
    if (typeof automationTarget.url !== "string" || !automationTarget.url.trim()) {
      throw new CapabilityError("E_BAD_INPUT", "Background automation target requires a url");
    }
    if (typeof chromeApi?.tabs?.create !== "function") {
      throw new CapabilityError(
        "E_RUNTIME",
        "chrome.tabs.create is required for background automation",
      );
    }

    const createdTab = await chromeApi.tabs.create({
      url: automationTarget.url.trim(),
      active: false,
    });
    if (!createdTab || typeof createdTab.id !== "number" || typeof createdTab.url !== "string") {
      throw new CapabilityError(
        "E_RUNTIME",
        "Background automation tab creation did not return tab metadata",
      );
    }

    return {
      tabId: createdTab.id,
      url: createdTab.url,
      active: createdTab.active === true,
      ...(typeof createdTab.title === "string" ? { title: createdTab.title } : {}),
    };
  }

  async function teardownBackgroundAutomationTab(tabId, cleanup) {
    if ((cleanup ?? "close-tab") !== "close-tab" || typeof chromeApi?.tabs?.remove !== "function") {
      return;
    }
    try {
      await chromeApi.tabs.remove(tabId);
    } catch {
      // Cleanup must remain best-effort and must not hide the invoke result.
    }
  }

  async function invokeBackgroundAutomationLane(message) {
    if (!effectivePageHookBridge) {
      throw new CapabilityError("E_RUNTIME", "Page hook bridge is not configured");
    }

    const automationTarget = message.automationTarget;
    const backgroundTab = await createBackgroundAutomationTab(automationTarget);
    try {
      const result = await invokeSingleActionSiteSkill({
        request: {
          skillId: message.skillId,
          action: message.action,
          tab: backgroundTab,
          lane: "background",
          ...(message.input !== undefined ? { input: message.input } : {}),
          ...(message.ctx ? { ctx: message.ctx } : {}),
          plan: message.plan,
          module: message.module,
          ...(message.verifier ? { verifier: message.verifier } : {}),
          ...(message.stabilization ? { stabilization: message.stabilization } : {}),
          ...(message.intervention ? { intervention: message.intervention } : {}),
        },
        runnerHost: createRunnerHostProxy(),
        installer: effectivePageHookBridge,
      });
      appendObservabilityExportEvents(result);
      return result;
    } finally {
      await teardownBackgroundAutomationTab(backgroundTab.tabId, automationTarget?.cleanup);
    }
  }

  async function resolveMaybe(value) {
    if (typeof value === "function") {
      return value();
    }
    return value;
  }

  async function routeRuntimeCapability(capabilityId, input = {}, options = {}) {
    try {
      const response = {
        ok: true,
        data: await getRuntimeServices().dispatchCapability({
          capabilityId,
          input,
          permissions: options.permissions ?? [capabilityId],
        }),
      };
      appendObservabilityExportEvents(response.data);
      return response;
    } catch (error) {
      return {
        ok: false,
        error: toBridgeError(error),
      };
    }
  }

  async function routeAuditedRuntimeCapability({ capabilityId, input = {}, buildAuditEntry }) {
    const response = await routeRuntimeCapability(capabilityId, input);
    if (response.ok && typeof buildAuditEntry === "function") {
      const auditEntry = buildAuditEntry(response.data);
      if (auditEntry) {
        await appendAudit(auditEntry);
      }
    }
    return response;
  }

  function getTraceDurationMs(traceEntry) {
    const startedAt = Date.parse(traceEntry?.startedAt ?? "");
    const endedAt = Date.parse(traceEntry?.endedAt ?? "");
    if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt >= startedAt) {
      return endedAt - startedAt;
    }
    return 0;
  }

  async function appendSkillInvocationAudit(response, durationMs) {
    await appendAudit({
      kind: "loop.step",
      capabilityId: "skills.invoke",
      status: response.ok ? "executed" : "failed",
      durationMs,
      ...(response.ok ? {} : { error: response.error?.message ?? response.error?.code }),
    });
    if (!response.ok || !Array.isArray(response.data?.trace)) {
      return;
    }
    for (const traceEntry of response.data.trace) {
      if (typeof traceEntry?.capabilityId !== "string") {
        continue;
      }
      await appendAudit({
        kind: "loop.step",
        capabilityId: traceEntry.capabilityId,
        status: traceEntry.status === "failed" ? "failed" : "executed",
        durationMs: getTraceDurationMs(traceEntry),
        ...(typeof traceEntry.errorCode === "string" ? { error: traceEntry.errorCode } : {}),
      });
    }
  }

  async function routeSkillInvocation({ skillId, action, args }) {
    const startedAt = Date.now();
    const response = await routeRuntimeCapability(
      "skills.invoke",
      {
        skillId,
        action,
        args,
      },
      { permissions: ["*"] },
    );
    await appendSkillInvocationAudit(response, Date.now() - startedAt);
    return response;
  }

  async function routeRuntimeService(call) {
    try {
      const response = {
        ok: true,
        data: await call(),
      };
      appendObservabilityExportEvents(response.data);
      return response;
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
    if (hostId === LOCAL_HOST_ID) {
      return hostId;
    }
    if (isRemoteHostId(hostId)) {
      return hostId;
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

  function getDefaultExecHostId() {
    if (
      typeof state.defaultHostId === "string" &&
      state.defaultHostId.trim() &&
      state.defaultHostId !== LOCAL_HOST_ID
    ) {
      return state.defaultHostId;
    }
    return getRemoteHostIds()[0] ?? null;
  }

  function resolveHostExecHostId(hostId) {
    if (typeof hostId === "string" && hostId.trim()) {
      return resolveHostId(hostId, "host.exec");
    }
    const defaultExecHostId = getDefaultExecHostId();
    if (typeof defaultExecHostId === "string" && defaultExecHostId.trim()) {
      return defaultExecHostId;
    }
    return invalidHostSubstrate("host.exec requires hostId or a default exec-capable host");
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
      capabilities: localHostCapabilities(),
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

  function toRemoteHostSnapshot(hostId, remoteState) {
    const connected = remoteState.connected === true;
    const healthStatus =
      remoteState.healthStatus ??
      (remoteState.error ? "degraded" : connected ? "healthy" : "unknown");
    const health = {
      status: healthStatus,
      ...(remoteState.checkedAt ? { checkedAt: remoteState.checkedAt } : {}),
    };
    const snapshot = {
      hostId,
      kind: "remote",
      connected,
      state:
        remoteState.error || healthStatus === "degraded"
          ? "degraded"
          : connected
            ? "connected"
            : "disconnected",
      isDefault: state.defaultHostId === hostId,
      capabilities: remoteHostCapabilities(),
      health,
    };
    if (remoteState.error) {
      return {
        ...snapshot,
        error: remoteState.error,
      };
    }
    return snapshot;
  }

  async function describeRemoteHost(hostId, action = "hosts.get") {
    const availability = await getRemoteTransportAvailability(hostId, action);
    if (!availability.available && availability.error) {
      setRemoteHostSnapshot(hostId, {
        connected: false,
        healthStatus: "degraded",
        error: availability.error,
      });
    }
    return toRemoteHostSnapshot(hostId, getRemoteHostState(hostId));
  }

  function setRemoteHostSnapshot(
    hostId,
    {
      connected = false,
      healthStatus = connected ? "healthy" : "unknown",
      checkedAt = isoNow(),
      error = null,
    } = {},
  ) {
    const remoteHostState = getRemoteHostState(hostId);
    remoteHostState.connected = connected;
    remoteHostState.healthStatus = healthStatus;
    remoteHostState.checkedAt = checkedAt;
    remoteHostState.error = error;
  }

  async function probeRemoteHostControlState(hostId, action = "hosts.health") {
    await syncConfiguredRemoteTransport();
    const resolvedRemoteTransport = getRemoteTransport(hostId);
    const availability = await getRemoteTransportAvailability(hostId, action);
    if (!availability.available) {
      setRemoteHostSnapshot(hostId, {
        connected: false,
        healthStatus: "degraded",
        error: availability.error,
      });
      return {
        ok: false,
        error: getRemoteHostState(hostId).error,
      };
    }
    if (typeof resolvedRemoteTransport?.probe !== "function") {
      return null;
    }
    try {
      const response = await resolvedRemoteTransport.probe({
        kind: "health",
        requestId: nextRequestId(),
        hostId,
        action,
      });
      if (response && typeof response === "object" && response.ok === false) {
        setRemoteHostSnapshot(hostId, {
          connected: false,
          healthStatus: "degraded",
          error: response.error ?? {
            code: "E_RUNTIME",
            message: "Remote host probe failed",
          },
        });
        return {
          ok: false,
          error: getRemoteHostState(hostId).error,
        };
      }
      const payload =
        response && typeof response === "object" && response.ok === true && "data" in response
          ? response.data
          : response;
      const connected =
        payload && typeof payload === "object" && typeof payload.connected === "boolean"
          ? payload.connected
          : true;
      const healthStatus =
        payload &&
        typeof payload === "object" &&
        payload.health &&
        typeof payload.health === "object"
          ? payload.health.status
          : payload && typeof payload === "object" && typeof payload.status === "string"
            ? payload.status
            : connected
              ? "healthy"
              : "unknown";
      const checkedAt =
        payload &&
        typeof payload === "object" &&
        payload.health &&
        typeof payload.health === "object"
          ? payload.health.checkedAt
          : payload && typeof payload === "object" && typeof payload.checkedAt === "string"
            ? payload.checkedAt
            : isoNow();
      setRemoteHostSnapshot(hostId, {
        connected,
        healthStatus,
        checkedAt,
        error: null,
      });
      return {
        ok: true,
        data: await describeRemoteHost(hostId, action),
      };
    } catch (error) {
      setRemoteHostSnapshot(hostId, {
        connected: false,
        healthStatus: "degraded",
        error: toBridgeError(error),
      });
      return {
        ok: false,
        error: getRemoteHostState(hostId).error,
      };
    }
  }

  async function listExecutionHosts() {
    await syncConfiguredRemoteTransport();
    const items = [await describeLocalHost()];
    const remoteHosts = await Promise.all(
      getRemoteHostIds().map((hostId) => describeRemoteHost(hostId, "hosts.list")),
    );
    items.push(...remoteHosts);
    return items;
  }

  async function describeHostById(hostId, action = "hosts.get") {
    if (hostId === LOCAL_HOST_ID) {
      return describeLocalHost();
    }
    return describeRemoteHost(hostId, action);
  }

  async function listHosts() {
    return {
      ok: true,
      data: {
        defaultHostId: state.defaultHostId,
        defaultExecHostId: getDefaultExecHostId(),
        items: await listExecutionHosts(),
      },
    };
  }

  async function getHost({ hostId } = {}) {
    await syncConfiguredRemoteTransport();
    const resolvedHostId = resolveHostId(hostId, "hosts.get");
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    return {
      ok: true,
      data: await describeHostById(resolvedHostId, "hosts.get"),
    };
  }

  async function connectHost({ hostId } = {}) {
    await syncConfiguredRemoteTransport();
    const resolvedHostId = resolveHostId(hostId, "hosts.connect");
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    if (resolvedHostId !== LOCAL_HOST_ID) {
      const probe = await probeRemoteHostControlState(resolvedHostId, "hosts.connect");
      if (probe?.ok === false) {
        await appendAudit({
          kind: "hosts.connect",
          hostId: resolvedHostId,
          status: "failed",
          error: probe.error?.message,
        });
        return probe;
      }
      if (!probe) {
        setRemoteHostSnapshot(resolvedHostId, {
          connected: true,
          healthStatus: "healthy",
          error: null,
        });
      }
      if (!state.defaultHostId) {
        state.defaultHostId = resolvedHostId;
      }
      await appendAudit({ kind: "hosts.connect", hostId: resolvedHostId, status: "connected" });
      return {
        ok: true,
        data: {
          defaultHostId: state.defaultHostId,
          host: await describeRemoteHost(resolvedHostId, "hosts.connect"),
        },
      };
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
    await syncConfiguredRemoteTransport();
    const resolvedHostId = resolveHostId(hostId, "hosts.disconnect");
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    if (resolvedHostId !== LOCAL_HOST_ID) {
      setRemoteHostSnapshot(resolvedHostId, {
        connected: false,
        healthStatus: "unknown",
        error: null,
      });
      await appendAudit({
        kind: "hosts.disconnect",
        hostId: resolvedHostId,
        status: "disconnected",
      });
      return {
        ok: true,
        data: {
          defaultHostId: state.defaultHostId,
          host: await describeRemoteHost(resolvedHostId, "hosts.disconnect"),
        },
      };
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
        host: await describeHostById(resolvedHostId, "hosts.disconnect"),
      },
    };
  }

  async function setDefaultHost({ hostId } = {}) {
    await syncConfiguredRemoteTransport();
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
        host: await describeHostById(resolvedHostId, "hosts.set_default"),
      },
    };
  }

  async function hostHealth({ hostId } = {}) {
    await syncConfiguredRemoteTransport();
    const resolvedHostId = resolveHostId(hostId, "hosts.health");
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    if (resolvedHostId !== LOCAL_HOST_ID) {
      await probeRemoteHostControlState(resolvedHostId, "hosts.health");
    }
    const host = await describeHostById(resolvedHostId, "hosts.health");
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
    if (isRemoteHostId(resolvedHostId)) {
      return unsupportedHostOperation({
        hostId: resolvedHostId,
        kind: kind.replace("host.", ""),
      });
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

  async function routeHostExec(payload = {}) {
    await syncConfiguredRemoteTransport();
    const resolvedHostId = resolveHostExecHostId(payload.hostId);
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    if (isRemoteHostId(resolvedHostId)) {
      return routeRemoteExec({
        ...payload,
        hostId: resolvedHostId,
      });
    }
    return routeHostSubstrate("host.exec", {
      ...payload,
      hostId: resolvedHostId,
    });
  }

  async function routeRemoteExec(payload = {}) {
    await syncConfiguredRemoteTransport();
    const resolvedHostId = resolveHostSubstrateHostId(payload.hostId, "runner.remote_exec");
    if (typeof resolvedHostId !== "string") {
      return resolvedHostId;
    }
    const resolvedRemoteTransport = getRemoteTransport(resolvedHostId);
    if (!isRemoteHostId(resolvedHostId) || typeof resolvedRemoteTransport?.exec !== "function") {
      return unsupportedHostOperation({
        hostId: resolvedHostId,
        kind: "exec",
      });
    }
    const availability = await getRemoteTransportAvailability(resolvedHostId, "host.exec");
    if (!availability.available) {
      setRemoteHostSnapshot(resolvedHostId, {
        connected: false,
        healthStatus: "degraded",
        error: availability.error,
      });
      return {
        ok: false,
        error: getRemoteHostState(resolvedHostId).error,
      };
    }
    try {
      const response = await resolvedRemoteTransport.exec({
        kind: "exec",
        requestId: payload.requestId ?? nextRequestId(),
        hostId: resolvedHostId,
        command: payload.command,
        timeoutMs: payload.timeoutMs,
      });
      if (response && typeof response === "object" && response.ok === false) {
        setRemoteHostSnapshot(resolvedHostId, {
          connected: false,
          healthStatus: "degraded",
          error: response.error ?? {
            code: "E_RUNTIME",
            message: "Remote exec bridge failed",
          },
        });
        return {
          ok: false,
          error: getRemoteHostState(resolvedHostId).error,
        };
      }
      setRemoteHostSnapshot(resolvedHostId, {
        connected: true,
        healthStatus: "healthy",
        error: null,
      });
      return {
        ok: true,
        data: response,
      };
    } catch (error) {
      setRemoteHostSnapshot(resolvedHostId, {
        connected: false,
        healthStatus: "degraded",
        error: toBridgeError(error),
      });
      return {
        ok: false,
        error: getRemoteHostState(resolvedHostId).error,
      };
    }
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
    const runtimeServiceApi = getRuntimeServices();
    const kernelDiagnostics = await captureKernelDiagnosticsSnapshot(runtimeServiceApi);

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

    let site: any;
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
    const runtimeError = runner.error ?? site.error ?? null;
    if (runtimeError) {
      setRuntimeError(runtimeError);
    }

    return {
      ok: true,
      data: {
        capturedAt,
        status: degraded ? "degraded" : "healthy",
        kernel: kernelDiagnostics,
        bridge: buildBridgeState({
          offscreenPresent,
          offscreenPath,
        }),
        runner,
        site,
        debug: {
          error: createDiagnosticsErrorSummary(),
        },
      },
    };
  }

  async function buildBootstrapResourceInput({ world = "main" } = {}) {
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
    const runtimeLoopRun = runtimeDiagnostics.kernel?.run ?? null;
    const kernelSession = runtimeDiagnostics.kernel?.session ?? null;
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
    await syncConfiguredRemoteTransport();
    const remoteHosts = hasRemoteHost()
      ? await Promise.all(
          getRemoteHostIds().map((hostId) => describeRemoteHost(hostId, "runtime.summary")),
        )
      : [];
    const hostItems = [
      {
        hostId: localHost.hostId,
        kind: localHost.kind,
        connected: localHost.connected,
        state: localHost.state,
        isDefault: localHost.isDefault,
        capabilities: localHost.capabilities,
      },
      ...remoteHosts.map((remoteHost) => ({
        hostId: remoteHost.hostId,
        kind: remoteHost.kind,
        connected: remoteHost.connected,
        state: remoteHost.state,
        isDefault: remoteHost.isDefault,
        capabilities: remoteHost.capabilities,
      })),
    ];

    const runtimeSkillEntries =
      typeof getRuntimeServices().listSkills === "function"
        ? await getRuntimeServices().listSkills()
        : null;
    const rawSkillsSummary =
      Array.isArray(runtimeSkillEntries) && runtimeSkillEntries.length > 0
        ? runtimeSkillEntries
        : await resolveMaybe(listSkills);
    const skillEntries = Array.isArray(rawSkillsSummary)
      ? rawSkillsSummary.map((entry) => normalizeSkillSummaryInput(entry)).filter(Boolean)
      : [];
    const activeSkillEntries = skillEntries.filter((entry) => entry.status !== "archived");
    const latestSkillChange = pickLatestSkillChange(skillEntries);
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
    const interventionState = runtimeDiagnostics.kernel?.interventions ?? emptyInterventionState();

    return {
      generatedAt,
      activeTab: activeTabSummary,
      runtime: {
        status: runtimeStatus,
        mode: currentMode,
        sessionId: sessionId ?? kernelSession?.id ?? null,
        activeTab: activeTabSummary,
        loopState:
          runtimeLoopRun?.phase ?? runnerHealth?.status ?? (activeTabSummary ? "idle" : null),
        lastError: effectiveError
          ? {
              code: effectiveError.code,
              message: effectiveError.message,
            }
          : null,
        interventions: {
          status: interventionState.status,
          totalCount: interventionState.totalCount,
          activeCount: interventionState.activeCount,
          recentCount: interventionState.recentCount,
          active: interventionState.active.map((entry) => cloneInterventionRecord(entry)),
          recent: interventionState.recent.map((entry) => cloneInterventionRecord(entry)),
        },
        actionCapabilities: {
          total: 0,
          namespaces: [],
        },
      },
      skills: {
        status: activeSkillEntries.length > 0 ? "healthy" : "empty",
        installedCount: activeSkillEntries.length,
        enabledCount: activeSkillEntries.filter((entry) => entry.enabled).length,
        trustedCount: activeSkillEntries.filter((entry) => entry.trusted).length,
        recentChange: latestSkillChange?.recentChange ?? null,
        items: activeSkillEntries.map((entry) => ({ ...entry })),
      },
      hosts: {
        status: hostItems.some((entry) => entry.state === "degraded")
          ? "degraded"
          : hostItems.some((entry) => entry.connected)
            ? "healthy"
            : "empty",
        defaultHostId: state.defaultHostId,
        defaultExecHostId: getDefaultExecHostId(),
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
    };
  }

  async function bootstrap({ world = "main" } = {}) {
    const summary = bootstrapSummaryBuilder(await buildBootstrapResourceInput({ world }));

    return {
      ok: true,
      data: summary,
    };
  }

  async function readInterventionResource(limit) {
    const entries =
      typeof getRuntimeServices().readInterventionAudit === "function"
        ? await getRuntimeServices().readInterventionAudit(limit)
        : [];
    return readAiSurfaceResource({
      resourceId: "audit.intervention",
      interventionAudit: {
        entries,
      },
    });
  }

  async function readObservabilityReplayResource(limit) {
    const runtimeServiceApi = getRuntimeServices();
    const [interventionEntries, continuityMarkers] = await Promise.all([
      typeof runtimeServiceApi.readInterventionAudit === "function"
        ? runtimeServiceApi.readInterventionAudit(AUDIT_MAX_ENTRIES)
        : [],
      typeof runtimeServiceApi.readReplayContinuityMarkers === "function"
        ? runtimeServiceApi.readReplayContinuityMarkers(AUDIT_MAX_ENTRIES)
        : [],
    ]);
    return readAiSurfaceResource({
      resourceId: "observability.replay",
      observabilityReplay: {
        loopEntries: getLoopTelemetry(TELEMETRY_MAX_ENTRIES),
        auditEntries: getAuditTail(AUDIT_MAX_ENTRIES),
        interventionEntries,
        continuityMarkers,
        ...(typeof limit === "number" ? { limit } : {}),
      },
    });
  }

  async function invokePageActionResource(action, input) {
    const result = await getRuntimeServices().invokePageAction({
      action,
      input,
    });
    appendObservabilityExportEvents(result);
    return result.result;
  }

  async function readResource({ resourceId, world = "main", limit } = {}) {
    if (!isAiSurfaceResourceId(resourceId)) {
      return {
        ok: false,
        error: {
          code: "E_BAD_INPUT",
          message: `Unknown AI surface resource: ${String(resourceId)}`,
        },
      };
    }

    switch (resourceId) {
      case "runtime.history":
        return readRuntimeHistoryResource(limit);
      case "audit.tail":
        return {
          ok: true,
          data: await readAuditResource(limit),
        };
      case "audit.intervention":
        return {
          ok: true,
          data: await readInterventionResource(limit),
        };
      case "observability.replay":
        return {
          ok: true,
          data: await readObservabilityReplayResource(limit),
        };
      default:
        return {
          ok: true,
          data: readAiSurfaceResource({
            resourceId,
            bootstrap: await buildBootstrapResourceInput({ world }),
            timelineEvents: observabilityTimelineEvents,
            rawEvents: observabilityRawEvents,
            limit,
          }),
        };
    }
  }

  async function route(message) {
    if (!message || message.target !== RUNNER_BACKGROUND_TARGET) {
      return undefined;
    }
    switch (message.kind) {
      case "runner.ensure_host":
        return ensureHost();
      case "runner.remote_exec":
        return routeRemoteExec({
          requestId: message.requestId,
          hostId: message.hostId,
          command: message.command,
          timeoutMs: message.timeoutMs,
        });
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
        return routeHostExec({
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
        return (async () => {
          const response = await routeAuditedRuntimeCapability({
            capabilityId: "config.update",
            input: {
              patch: message.patch,
            },
            buildAuditEntry: () => ({
              kind: "config.update",
              status: "updated",
              changedFields: Object.keys(message.patch ?? {}).filter((field) =>
                CONFIG_RESOURCE_FIELDS.includes(field),
              ),
            }),
          });
          if (response.ok) {
            await syncConfiguredRemoteTransport(true);
          }
          return response;
        })();
      case "skills.list":
        return routeRuntimeCapability("skills.list");
      case "skills.invoke":
        return routeSkillInvocation({
          skillId: message.skillId,
          action: message.action,
          args: message.args,
        });
      case "skills.install":
      case "skills.enable":
      case "skills.disable":
      case "skills.uninstall":
        return routeAuditedRuntimeCapability({
          capabilityId: message.kind,
          input: {
            skillId: message.skillId,
            ...(message.kind === "skills.install" && "setupPlan" in message
              ? { setupPlan: message.setupPlan }
              : {}),
            ...(message.kind === "skills.install" && "metadata" in message
              ? { metadata: message.metadata }
              : {}),
          },
          buildAuditEntry: (data) => ({
            kind: message.kind,
            skillId: data?.skill?.skillId ?? message.skillId,
            status: data?.skill?.status,
            trusted: data?.skill?.trusted,
          }),
        });
      case "page.press_key":
        return routeRuntimeService(() =>
          invokePageActionResource("press_key", {
            key: message.key,
          }),
        );
      case "page.query":
        return routeRuntimeService(() =>
          invokePageActionResource("query", {
            selector: message.selector,
          }),
        );
      case "page.click":
        return routeRuntimeService(() =>
          invokePageActionResource("click", {
            uid: message.uid,
          }),
        );
      case "page.fill":
        return routeRuntimeService(() =>
          invokePageActionResource("fill", {
            uid: message.uid,
            value: message.value,
          }),
        );
      case "page.screenshot":
        return routeRuntimeService(() =>
          invokePageActionResource("screenshot", {
            format: message.format,
            quality: message.quality,
          }),
        );
      case "site.fetch_with_session":
        return routeRuntimeCapability("site.fetch_with_session", {
          url: message.url,
          ...(message.method !== undefined ? { method: message.method } : {}),
          ...(message.headers !== undefined ? { headers: message.headers } : {}),
          ...(message.body !== undefined ? { body: message.body } : {}),
        });
      case "tabs.list":
        return routeRuntimeCapability("tabs.list");
      case "tabs.get_active":
        return routeRuntimeCapability("tabs.get_active");
      case "tabs.navigate":
        return routeRuntimeCapability("tabs.navigate", {
          url: message.url,
        });
      case "resource.read":
        if (message.resourceId === "loop.telemetry") {
          return readRuntimeHistoryResource(message.limit);
        }
        return readResource({
          resourceId: message.resourceId,
          world: message.world,
          limit: message.limit,
        });
      case "audit.tail":
        return readResource({
          resourceId: "audit.tail",
          limit: message.limit,
        });
      case "audit.host":
        return {
          ok: true,
          data: {
            entries: (await readAuditTail(message.limit)).filter((entry) =>
              HOST_AUDIT_KINDS.includes(entry.kind),
            ),
          },
        };
      case "audit.intervention":
        return readResource({
          resourceId: "audit.intervention",
          limit: message.limit,
        });
      case "intervention.list": {
        const snapshot = await readInterventionObservabilitySnapshot(getRuntimeServices());
        return {
          ok: true,
          data: {
            items: snapshot.items,
            summary: snapshot.summary,
          },
        };
      }
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
        return routeRuntimeService(() =>
          message?.automationTarget?.lane === "background"
            ? invokeBackgroundAutomationLane(message)
            : getRuntimeServices().invokeSiteSkill(message),
        );
      case "runtime.chat.bootstrap":
        return routeRuntimeService(() => getRuntimeServices().bootstrapChat());
      case "runtime.chat.send":
        return routeRuntimeService(() =>
          getRuntimeServices().sendChatPrompt({
            text: message.text,
          }),
        );
      case "runtime.chat.stop":
        return routeRuntimeService(() =>
          getRuntimeServices().stopChatRun({
            sessionId: message.sessionId,
          }),
        );
      case "loop.start":
        return routeRuntimeService(() =>
          getRuntimeServices().sendChatPrompt({
            text: message.text ?? message.prompt,
          }),
        );
      case "loop.stop":
        return routeRuntimeService(() =>
          getRuntimeServices().stopChatRun({
            sessionId: message.sessionId,
          }),
        );
      case "loop.status":
        return routeRuntimeService(() => Promise.resolve(getRuntimeServices().getLoopStatus()));
      case "llm.config.update":
        return routeRuntimeService(() =>
          getRuntimeServices().updateLlmConfig(message.patch ?? message.config),
        );
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

export function startBackgroundRunnerBridge(options: any = {}): any {
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
