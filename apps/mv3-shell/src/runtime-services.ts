// @ts-nocheck
import { BrowserVfs, resolveMemUri, snapshotInfoToSkillVersionRef } from "@bbl-next/browser-vfs";
import {
  CONFIG_RESOURCE_FIELDS,
  CapabilityError,
  createSkillLifecycleVersionSurface,
} from "@bbl-next/contracts";
import type { ConfigBootstrapSummary, LlmProfileConfig } from "@bbl-next/contracts";
import {
  BUILTIN_CAPABILITIES,
  CapabilityRegistry,
  FamilyProviderRegistry,
  SkillInvocationService,
  createConfigCapabilityProvider,
  createConfigControlPlane,
  createMemfsCapabilityProvider,
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
  BACKGROUND_CONTROL_PLANE_ACTION_KINDS,
  BACKGROUND_CONTROL_PLANE_RESOURCE_IDS,
  createBackgroundControlPlaneRoutePlan,
  hasSidepanelManagementActionCoverage,
  isBackgroundControlPlaneActionKind,
} from "./background-control-plane-route-plan.js";
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
const PAGE_ACTION_HANDOFF_ACTIONS = new Set(["query", "click", "fill"]);
const DOGFOOD_EXTERNAL_PAGE_DEFAULT_TIMEOUT_MS = 120_000;
const DOGFOOD_EXTERNAL_PAGE_LEASE_MS = 30_000;
const SKILL_STATUS_BY_ACTION = {
  "skills.install": "installed",
  "skills.enable": "enabled",
  "skills.disable": "disabled",
  "skills.uninstall": "archived",
};
const SKILL_LIFECYCLE_STORAGE_KEY = "bbl-next.skills.lifecycle.v1";
const SKILL_LIFECYCLE_STATUSES = new Set(Object.values(SKILL_STATUS_BY_ACTION));
const BROWSER_VFS_STORAGE_KEY = "bbl-next.browser-vfs.nodes.v1";
const SKILL_PACKAGE_MANIFEST_FILE = "skill.json";
const DEFAULT_SKILL_PACKAGE_ENTRY = "handler.js";

function createInterventionSyncChannel(explicitChannel) {
  if (explicitChannel) {
    return explicitChannel;
  }
  if (typeof globalThis.BroadcastChannel === "function") {
    return new globalThis.BroadcastChannel(INTERVENTION_SYNC_CHANNEL_NAME);
  }
  return null;
}

function normalizeSkillLifecycleRecord(record) {
  if (!isPlainObject(record) || typeof record.skillId !== "string" || !record.skillId.trim()) {
    return null;
  }
  const status = SKILL_LIFECYCLE_STATUSES.has(record.status) ? record.status : "installed";
  return {
    skillId: record.skillId.trim(),
    status,
    trusted: record.trusted === true,
    recentChange: typeof record.recentChange === "string" ? record.recentChange : null,
    lastChangedAt: typeof record.lastChangedAt === "string" ? record.lastChangedAt : null,
  };
}

async function loadSkillLifecycleRecords(chromeApi) {
  const storageArea = chromeApi?.storage?.local;
  if (typeof storageArea?.get !== "function") {
    return [];
  }
  const result = await storageArea.get(SKILL_LIFECYCLE_STORAGE_KEY);
  const stored = result?.[SKILL_LIFECYCLE_STORAGE_KEY];
  const records = Array.isArray(stored) ? stored : [];
  return records.map((record) => normalizeSkillLifecycleRecord(record)).filter(Boolean);
}

async function saveSkillLifecycleRecords(chromeApi, records) {
  const storageArea = chromeApi?.storage?.local;
  if (typeof storageArea?.set !== "function") {
    return;
  }
  await storageArea.set({
    [SKILL_LIFECYCLE_STORAGE_KEY]: records.map((record) => ({ ...record })),
  });
}

function normalizeStoredVfsRecord(record) {
  if (
    !isPlainObject(record) ||
    typeof record.key !== "string" ||
    typeof record.scope !== "string" ||
    typeof record.path !== "string" ||
    typeof record.kind !== "string"
  ) {
    return null;
  }
  if (!["workspace", "library"].includes(record.scope)) {
    return null;
  }
  if (!["file", "dir"].includes(record.kind)) {
    return null;
  }
  return {
    key: record.key,
    scope: record.scope,
    ...(typeof record.workspaceId === "string" ? { workspaceId: record.workspaceId } : {}),
    path: record.path,
    kind: record.kind,
    ...(record.kind === "file" ? { content: String(record.content ?? "") } : {}),
    size: typeof record.size === "number" ? record.size : 0,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
    ...(isPlainObject(record.snapshot) ? { snapshot: record.snapshot } : {}),
  };
}

async function loadStoredVfsRecords(storageArea) {
  const result = await storageArea.get(BROWSER_VFS_STORAGE_KEY);
  const stored = result?.[BROWSER_VFS_STORAGE_KEY];
  const records = Array.isArray(stored) ? stored : [];
  return records.map((record) => normalizeStoredVfsRecord(record)).filter(Boolean);
}

async function saveStoredVfsRecords(storageArea, records) {
  await storageArea.set({
    [BROWSER_VFS_STORAGE_KEY]: records.map((record) => ({ ...record })),
  });
}

function createChromeStorageVfsStore(chromeApi) {
  const storageArea = chromeApi?.storage?.local;
  if (typeof storageArea?.get !== "function" || typeof storageArea?.set !== "function") {
    return undefined;
  }
  return {
    async load(scope, workspaceId) {
      const records = await loadStoredVfsRecords(storageArea);
      return records.filter(
        (record) =>
          record.scope === scope && (scope === "library" || record.workspaceId === workspaceId),
      );
    },
    async put(record) {
      const records = await loadStoredVfsRecords(storageArea);
      const next = records.filter((item) => item.key !== record.key);
      next.push({ ...record });
      await saveStoredVfsRecords(storageArea, next);
    },
    async delete(key) {
      const records = await loadStoredVfsRecords(storageArea);
      await saveStoredVfsRecords(
        storageArea,
        records.filter((record) => record.key !== key),
      );
    },
  };
}

async function createRuntimeBrowserVfs({ chromeApi, workspaceId }) {
  const store = createChromeStorageVfsStore(chromeApi);
  return BrowserVfs.create({
    workspaceId,
    ...(store ? { store } : {}),
  });
}

function normalizeInstallSetupPlan({ skillId, input }) {
  const setupPlan = isPlainObject(input) ? input.setupPlan : undefined;
  if (setupPlan === undefined) {
    return [];
  }
  if (!isPlainObject(setupPlan)) {
    throw new CapabilityError("E_BAD_INPUT", "skills.install setupPlan must be an object");
  }
  const baseUri = `mem://skills/${skillId}`;
  if (setupPlan.skillId !== skillId) {
    throw new CapabilityError("E_BAD_INPUT", "skills.install setupPlan skillId mismatch");
  }
  if (setupPlan.phase !== "install") {
    throw new CapabilityError("E_BAD_INPUT", "skills.install only supports install setup phase");
  }
  if (setupPlan.baseUri !== baseUri) {
    throw new CapabilityError("E_BAD_INPUT", "skills.install setupPlan baseUri mismatch");
  }
  if (!Array.isArray(setupPlan.writes)) {
    throw new CapabilityError("E_BAD_INPUT", "skills.install setupPlan writes must be an array");
  }

  const root = resolveMemUri(baseUri);
  return setupPlan.writes.map((write, index) => {
    if (
      !isPlainObject(write) ||
      typeof write.uri !== "string" ||
      !write.uri.trim() ||
      typeof write.content !== "string"
    ) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        `skills.install setupPlan writes[${index}] requires uri and content strings`,
      );
    }
    const uri = write.uri.trim();
    if (!uri.startsWith(`${baseUri}/`)) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        `skills.install setupPlan write is outside ${baseUri}: ${uri}`,
      );
    }
    const target = resolveMemUri(uri);
    if (target.scope !== root.scope || !target.path.startsWith(`${root.path}/`)) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        `skills.install setupPlan write is outside ${baseUri}: ${uri}`,
      );
    }
    return {
      uri,
      content: write.content,
    };
  });
}

async function snapshotCurrentPackageForUpdate({ skillId, vfs }) {
  const packageUri = `mem://skills/${skillId}`;
  if (!(await vfs.isPackageRoot(packageUri))) {
    return null;
  }
  const versionId = new Date().toISOString();
  const versionUri = `${packageUri}/@versions/${versionId}`;
  await vfs.snapshot(packageUri, versionUri, {
    trusted: true,
  });
  return {
    versionId,
    uri: versionUri,
    trusted: true,
  };
}

function normalizePackageRelativePath(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("mem://") || trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return null;
  }
  if (trimmed.includes("\\")) {
    return null;
  }
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return segments.join("/");
}

function normalizeManifestStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeManifestAction(value) {
  if (!isPlainObject(value) || typeof value.name !== "string" || !value.name.trim()) {
    return null;
  }
  const action = {
    name: value.name.trim(),
  };
  if (typeof value.title === "string" && value.title.trim()) {
    action.title = value.title.trim();
  }
  if (typeof value.description === "string" && value.description.trim()) {
    action.description = value.description.trim();
  }
  if (typeof value.verifier === "string" && value.verifier.trim()) {
    action.verifier = value.verifier.trim();
  }
  if (Array.isArray(value.injectionSteps)) {
    action.injectionSteps = value.injectionSteps
      .filter((step) => isPlainObject(step))
      .map((step) => ({ ...step }));
  }
  if (isPlainObject(value.inputSchema)) {
    action.inputSchema = { ...value.inputSchema };
  }
  if (isPlainObject(value.outputSchema)) {
    action.outputSchema = { ...value.outputSchema };
  }
  return action;
}

function normalizeManifestEventSubscription(value) {
  if (
    !isPlainObject(value) ||
    typeof value.event !== "string" ||
    !value.event.trim() ||
    typeof value.action !== "string" ||
    !value.action.trim()
  ) {
    return null;
  }
  const subscription = {
    event: value.event.trim(),
    action: value.action.trim(),
  };
  if (typeof value.description === "string" && value.description.trim()) {
    subscription.description = value.description.trim();
  }
  return subscription;
}

function normalizeSkillPackageManifest(skillId, packageUri, content) {
  let manifest = null;
  try {
    manifest = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isPlainObject(manifest) || manifest.id !== skillId) {
    return null;
  }
  const permissions = Array.isArray(manifest.permissions)
    ? manifest.permissions.filter((permission) => typeof permission === "string" && permission)
    : [];
  const entry =
    normalizePackageRelativePath(manifest.entry) ??
    normalizePackageRelativePath(DEFAULT_SKILL_PACKAGE_ENTRY);
  if (!entry) {
    return null;
  }

  return {
    id: skillId,
    packageUri,
    entry,
    permissions,
    tags: normalizeManifestStringList(manifest.tags),
    matches: normalizeManifestStringList(manifest.matches),
    requiresActiveTab: manifest.requiresActiveTab === true,
    actions: Array.isArray(manifest.actions)
      ? manifest.actions.map((action) => normalizeManifestAction(action)).filter(Boolean)
      : [],
    eventSubscriptions: Array.isArray(manifest.eventSubscriptions)
      ? manifest.eventSubscriptions
          .map((subscription) => normalizeManifestEventSubscription(subscription))
          .filter(Boolean)
      : [],
    name: typeof manifest.name === "string" ? manifest.name : "",
    description: typeof manifest.description === "string" ? manifest.description : "",
    version: Number.isInteger(manifest.version) ? manifest.version : null,
    kind: typeof manifest.kind === "string" ? manifest.kind : "prompt",
  };
}

async function registerBrowserVfsSkillPackages({
  browserVfs,
  runnerHost,
  skillInvocationService,
  packageCatalog,
}) {
  const packages = await browserVfs.discoverPackages();
  packageCatalog?.clear();
  for (const packageInfo of packages) {
    if (!packageInfo.hasMarker) {
      continue;
    }
    let manifestContent = "";
    try {
      manifestContent = await browserVfs.read(`${packageInfo.uri}/${SKILL_PACKAGE_MANIFEST_FILE}`);
    } catch {
      continue;
    }
    const manifest = normalizeSkillPackageManifest(
      packageInfo.id,
      packageInfo.uri,
      manifestContent,
    );
    if (!manifest) {
      continue;
    }

    packageCatalog?.set(manifest.id, manifest);
    skillInvocationService.register({
      id: manifest.id,
      permissions: manifest.permissions,
      async handler(ctx, action, args) {
        const source = await ctx.call("memfs.read", {
          uri: `${manifest.packageUri}/${manifest.entry}`,
        });
        if (typeof source !== "string") {
          throw new CapabilityError(
            "E_RUNTIME",
            `Skill package handler is not readable: ${manifest.id}`,
          );
        }
        const invocation = await runnerHost.invoke({
          module: {
            id: `${manifest.id}:${manifest.entry}`,
            source,
          },
          input: {
            action,
            args,
          },
          ctx: {
            skillId: manifest.id,
            package: {
              uri: manifest.packageUri,
              entry: manifest.entry,
            },
            manifest: {
              id: manifest.id,
              version: manifest.version,
              kind: manifest.kind,
              description: manifest.description,
            },
          },
          capabilityContext: ctx,
        });
        return invocation.result;
      },
    });
  }
}

async function buildPackageSkillVersionSurface(record, manifest, browserVfs) {
  const packageUri = manifest.packageUri;
  let versions = [];
  try {
    versions = (await browserVfs.listSnapshots(packageUri)).map((snapshot) =>
      snapshotInfoToSkillVersionRef(snapshot),
    );
  } catch {
    versions = [];
  }

  return createSkillLifecycleVersionSurface({
    skillId: record.skillId,
    lifecycle: {
      status: record.status,
      trusted: record.trusted === true,
    },
    activeVersion:
      manifest.version == null
        ? null
        : {
            versionId: String(manifest.version),
            uri: packageUri,
            trusted: record.trusted === true,
          },
    versions,
  });
}

function packageManifestToSkillSummary(record, manifest, versionSurface = null) {
  return {
    skillId: record.skillId,
    name: manifest.name || null,
    status: record.status,
    enabled: record.status === "enabled",
    trusted: record.trusted === true,
    source: "package",
    recentChange: record.recentChange ?? null,
    lastChangedAt: record.lastChangedAt ?? null,
    packageUri: manifest.packageUri,
    entry: manifest.entry,
    version: manifest.version,
    versionSurface,
    kind: manifest.kind,
    description: manifest.description || null,
    permissions: [...manifest.permissions],
    tags: [...manifest.tags],
    matches: [...manifest.matches],
    requiresActiveTab: manifest.requiresActiveTab === true,
    actions: manifest.actions.map((action) => ({
      ...action,
      ...(action.injectionSteps
        ? { injectionSteps: action.injectionSteps.map((step) => ({ ...step })) }
        : {}),
    })),
    eventSubscriptions: manifest.eventSubscriptions.map((subscription) => ({ ...subscription })),
  };
}

function lifecycleRecordToSkillSummary(record) {
  return {
    skillId: record.skillId,
    name: null,
    status: record.status,
    enabled: record.status === "enabled",
    trusted: record.trusted === true,
    source: "lifecycle",
    recentChange: record.recentChange ?? null,
    lastChangedAt: record.lastChangedAt ?? null,
    version: null,
    kind: null,
    description: null,
    permissions: [],
    tags: [],
    matches: [],
    requiresActiveTab: false,
    actions: [],
    eventSubscriptions: [],
  };
}

function createBrowserVfsMemfsTransport(vfs) {
  return {
    read: (uri) => vfs.read(uri),
    write: (uri, content) => vfs.write(uri, content),
    edit: (uri, editor) => vfs.edit(uri, editor),
    stat: (uri) => vfs.stat(uri),
    list: (uri) => vfs.list(uri),
    mkdir: (uri) => vfs.mkdir(uri),
    rm: (uri) => vfs.rm(uri),
    mv: (fromUri, toUri) => vfs.mv(fromUri, toUri),
    copy: (fromUri, toUri) => vfs.copy(fromUri, toUri),
    stage: (entries) => vfs.stage(entries),
    snapshot: (sourceUri, targetUri, options) => vfs.snapshot(sourceUri, targetUri, options),
    rehydrate: (snapshotUri, targetUri) => vfs.rehydrate(snapshotUri, targetUri),
  };
}

function createSkillLifecycleManager({ chromeApi, getVfs, refreshPackages } = {}) {
  const records = new Map();
  let loadPromise = null;

  async function ensureLoaded() {
    if (!loadPromise) {
      loadPromise = (async () => {
        for (const record of await loadSkillLifecycleRecords(chromeApi)) {
          records.set(record.skillId, record);
        }
      })();
    }
    await loadPromise;
  }

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
      await ensureLoaded();
      return [...records.values()].map((record) => cloneSkillRecord(record));
    },
    async listActiveIds() {
      await ensureLoaded();
      return [...records.values()]
        .filter((record) => record.status !== "archived")
        .map((record) => record.skillId);
    },
    async manage({ action, skillId, input }) {
      await ensureLoaded();
      const previous = records.get(skillId);

      if (action === "skills.rollback") {
        if (!previous || previous.status === "archived") {
          throw new CapabilityError(
            "E_BAD_INPUT",
            "skills.rollback requires an active installed skill",
          );
        }
        const vfs = await getVfs?.();
        if (!vfs) {
          throw new CapabilityError("E_RUNTIME", "BrowserVFS is required for skills.rollback");
        }

        const packageUri = `mem://skills/${skillId}`;
        const explicitVersionUri =
          isPlainObject(input) && typeof input.versionUri === "string" && input.versionUri.trim()
            ? input.versionUri.trim()
            : null;
        const target = explicitVersionUri
          ? (await vfs.listSnapshots(packageUri)).find(
              (snapshot) => snapshot.uri === explicitVersionUri,
            )
          : await vfs.selectRollbackTarget(packageUri);
        if (!target) {
          throw new CapabilityError(
            "E_BAD_INPUT",
            explicitVersionUri
              ? `skills.rollback snapshot not found: ${explicitVersionUri}`
              : `skills.rollback found no trusted rollback target for ${skillId}`,
          );
        }

        await vfs.rehydrate(target.uri, packageUri);
        const nextRecord = {
          skillId,
          status: previous.status,
          trusted: previous.trusted,
          recentChange: action,
          lastChangedAt: new Date().toISOString(),
        };
        records.set(skillId, nextRecord);
        await saveSkillLifecycleRecords(chromeApi, [...records.values()]);
        await refreshPackages?.();

        return {
          skill: {
            skillId,
            status: nextRecord.status,
            trusted: nextRecord.trusted,
            recentChange: action,
          },
          rollback: {
            skillId,
            versionId: target.versionId,
            versionUri: target.uri,
            targetUri: packageUri,
            trusted: target.trusted === true,
          },
        };
      }

      const status = SKILL_STATUS_BY_ACTION[action];
      if (!status) {
        throw new CapabilityError("E_RUNTIME", `Unsupported skill lifecycle action: ${action}`);
      }

      if (action === "skills.install") {
        const setupWrites = normalizeInstallSetupPlan({ skillId, input });
        let previousVersion = null;
        if (setupWrites.length > 0) {
          const vfs = await getVfs?.();
          if (!vfs) {
            throw new CapabilityError("E_RUNTIME", "BrowserVFS is required for skill setupPlan");
          }
          if (previous && previous.status !== "archived") {
            previousVersion = await snapshotCurrentPackageForUpdate({ skillId, vfs });
          }
          await vfs.stage(setupWrites);
        }
        await refreshPackages?.();
        const nextRecord = {
          skillId,
          status,
          trusted: previous?.trusted ?? false,
          recentChange: action,
          lastChangedAt: new Date().toISOString(),
        };
        records.set(skillId, nextRecord);
        await saveSkillLifecycleRecords(chromeApi, [...records.values()]);

        return {
          skill: {
            skillId,
            status,
            trusted: nextRecord.trusted,
            recentChange: action,
          },
          ...(previousVersion
            ? {
                update: {
                  previousVersion,
                },
              }
            : {}),
        };
      }

      const nextRecord = {
        skillId,
        status,
        trusted: previous?.trusted ?? false,
        recentChange: action,
        lastChangedAt: new Date().toISOString(),
      };
      records.set(skillId, nextRecord);
      await saveSkillLifecycleRecords(chromeApi, [...records.values()]);

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
      return true;
    case "paused":
      kernel.resume(sessionId);
      return true;
    case "running":
      return false;
    default:
      throw new CapabilityError("E_RUNTIME", `Kernel run is unavailable while ${state.phase}`);
  }
}

function settleKernelRun(kernel, sessionId, shouldPause) {
  if (shouldPause && kernel.getRunState(sessionId).phase === "running") {
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

function pickMostRecentSession(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return null;
  }
  return (
    [...sessions].sort((left, right) =>
      String(right?.createdAt ?? "").localeCompare(String(left?.createdAt ?? "")),
    )[0] ?? null
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
    case "info": {
      const maxElements =
        isPlainObject(input) && input.maxElements != null ? Number(input.maxElements) : undefined;
      const maxTextChars =
        isPlainObject(input) && input.maxTextChars != null ? Number(input.maxTextChars) : undefined;
      if (maxElements != null && !Number.isFinite(maxElements)) {
        throw new CapabilityError("E_BAD_INPUT", "page.info maxElements must be numeric");
      }
      if (maxTextChars != null && !Number.isFinite(maxTextChars)) {
        throw new CapabilityError("E_BAD_INPUT", "page.info maxTextChars must be numeric");
      }
      return {
        skillId: "bbl.page",
        action: "info",
        tab,
        input: {
          ...(maxElements == null ? {} : { maxElements }),
          ...(maxTextChars == null ? {} : { maxTextChars }),
        },
        plan: {
          skillId: "bbl.page",
          action: "info",
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
          id: "bbl.page.info",
          source:
            "exports.default = async ({ input }) => ({ maxElements: input.maxElements, maxTextChars: input.maxTextChars });",
        },
        verifier: "page_info",
      };
    }
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
    case "click_xy": {
      if (!isPlainObject(input)) {
        throw new CapabilityError("E_BAD_INPUT", "page.click_xy requires an object input");
      }
      const x = Number(input.x);
      const y = Number(input.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new CapabilityError("E_BAD_INPUT", "page.click_xy requires finite numeric x and y");
      }
      return {
        skillId: "bbl.page",
        action: "click_xy",
        tab,
        input: {
          x,
          y,
        },
        plan: {
          skillId: "bbl.page",
          action: "click_xy",
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
          id: "bbl.page.click_xy",
          source: "exports.default = async ({ input }) => ({ x: input.x, y: input.y });",
        },
        verifier: "page_click_xy",
      };
    }
    case "type_text":
      if (!isPlainObject(input) || typeof input.text !== "string") {
        throw new CapabilityError("E_BAD_INPUT", "page.type_text requires input.text");
      }
      return {
        skillId: "bbl.page",
        action: "type_text",
        tab,
        input: {
          text: input.text,
        },
        plan: {
          skillId: "bbl.page",
          action: "type_text",
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
          id: "bbl.page.type_text",
          source: "exports.default = async ({ input }) => ({ text: input.text });",
        },
        verifier: "page_type_text",
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
    case "scroll": {
      if (!isPlainObject(input)) {
        throw new CapabilityError("E_BAD_INPUT", "page.scroll requires an object input");
      }
      const deltaX = input.deltaX == null ? 0 : Number(input.deltaX);
      const deltaY = input.deltaY == null ? 0 : Number(input.deltaY);
      if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
        throw new CapabilityError("E_BAD_INPUT", "page.scroll requires finite numeric deltas");
      }
      const behavior =
        input.behavior === "smooth" || input.behavior === "instant" ? input.behavior : "auto";
      return {
        skillId: "bbl.page",
        action: "scroll",
        tab,
        input: {
          deltaX,
          deltaY,
          behavior,
        },
        plan: {
          skillId: "bbl.page",
          action: "scroll",
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
          id: "bbl.page.scroll",
          source:
            "exports.default = async ({ input }) => ({ deltaX: input.deltaX, deltaY: input.deltaY, behavior: input.behavior });",
        },
        verifier: "page_scroll",
      };
    }
    default:
      throw new CapabilityError("E_BAD_INPUT", `Unsupported page action: ${action}`);
  }
}

function normalizeSiteHandoffPolicy(value) {
  if (!isPlainObject(value)) {
    return null;
  }
  if (!["confirm", "takeover", "input"].includes(value.kind)) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "Site handoff kind must be confirm, takeover, or input",
    );
  }
  if (value.trigger != null && !["verify_failed", "runtime_blocked"].includes(value.trigger)) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "Site handoff trigger must be verify_failed or runtime_blocked",
    );
  }
  if (typeof value.title !== "string" || !value.title.trim()) {
    throw new CapabilityError("E_BAD_INPUT", "Site handoff requires title");
  }
  if (typeof value.message !== "string" || !value.message.trim()) {
    throw new CapabilityError("E_BAD_INPUT", "Site handoff requires message");
  }
  return {
    kind: value.kind,
    title: value.title,
    message: value.message,
    ...(value.trigger ? { trigger: value.trigger } : {}),
    ...(isPlainObject(value.payload) ? { payload: { ...value.payload } } : {}),
  };
}

function normalizeSiteHandoffPolicies(value) {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new CapabilityError("E_BAD_INPUT", "Site handoffs must be an array");
  }
  return value.map((item) => normalizeSiteHandoffPolicy(item)).filter(Boolean);
}

function buildImplicitPageActionHandoffs(action) {
  if (!PAGE_ACTION_HANDOFF_ACTIONS.has(action)) {
    return [];
  }
  return [
    {
      kind: "takeover",
      trigger: "verify_failed",
      title: "Page action needs human handoff",
      message: `Finish the page.${action} step manually before continuing.`,
    },
    {
      kind: "takeover",
      trigger: "runtime_blocked",
      title: "Page action needs human handoff",
      message: `Finish the page.${action} step manually before continuing.`,
    },
  ];
}

function buildInterventionRequestFromSiteHandoff(handoff) {
  if (!isPlainObject(handoff)) {
    throw new CapabilityError("E_BAD_INPUT", "Site handoff requires a structured request");
  }
  const trigger = handoff.trigger;
  if (trigger !== "verify_failed" && trigger !== "runtime_blocked") {
    throw new CapabilityError("E_BAD_INPUT", "Site handoff trigger is not supported");
  }
  const skillId = typeof handoff.skillId === "string" && handoff.skillId ? handoff.skillId : "site";
  const action = typeof handoff.action === "string" && handoff.action ? handoff.action : "action";
  const tabId = typeof handoff.tabId === "number" ? handoff.tabId : null;
  const counter =
    trigger === "verify_failed" && isPlainObject(handoff.payload) && handoff.payload.verifier
      ? handoff.payload.verifier
      : "request";

  return {
    id: `ivr:${skillId}:${action}:${trigger}:${String(tabId)}:${String(counter)}`,
    kind: handoff.kind,
    trigger,
    status: "requested",
    title: handoff.title,
    message: handoff.message,
    ...(skillId ? { skillId } : {}),
    ...(action ? { action } : {}),
    tabId,
    ...(isPlainObject(handoff.payload) ? { payload: { ...handoff.payload } } : {}),
  };
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

function createChatMessageItem({
  id,
  role,
  text,
  state = "complete",
  systemKind,
  expanded,
  contentBlocks,
  toolResults,
}) {
  return {
    id,
    kind: "message",
    role,
    text,
    state,
    ...(systemKind ? { systemKind } : {}),
    ...(typeof expanded === "boolean" ? { expanded } : {}),
    ...(contentBlocks ? { contentBlocks } : {}),
    ...(toolResults ? { toolResults } : {}),
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

const CHAT_TOOL_DEBUG_ONLY_KEYS = new Set([
  "afterScreenshot",
  "artifactPath",
  "browserActionEvidence",
  "beforeScreenshot",
  "dataUrl",
  "debugEvidence",
  "externalPageEvidence",
  "externalPageRequest",
  "networkEvents",
  "observability",
  "rawEventTail",
  "rawEvents",
  "screenshot",
  "screenshots",
  "screenshotDataUrl",
  "taskTabProof",
  "timelineEvents",
  "trace",
]);

function stripDebugOnlyFieldsForChat(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripDebugOnlyFieldsForChat(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const result = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (CHAT_TOOL_DEBUG_ONLY_KEYS.has(key)) {
      continue;
    }
    result[key] = stripDebugOnlyFieldsForChat(entryValue);
  }
  return result;
}

function serializeChatToolResult(resultData) {
  if (typeof resultData === "string") {
    return resultData;
  }
  return JSON.stringify(stripDebugOnlyFieldsForChat(resultData ?? null));
}

function normalizeChatContentBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    return undefined;
  }

  const normalized = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }
    if (block.type === "text" && typeof block.text === "string") {
      normalized.push({ type: "text", text: block.text });
      continue;
    }
    if (
      block.type === "toolCall" &&
      typeof block.id === "string" &&
      typeof block.name === "string" &&
      typeof block.arguments === "string"
    ) {
      normalized.push({
        type: "toolCall",
        id: block.id,
        name: block.name,
        arguments: block.arguments,
      });
    }
  }
  return normalized.length > 0 ? normalized : undefined;
}

function collectAbsorbedToolCallIds(messages) {
  const absorbed = new Set();
  for (const message of messages) {
    if (!message || message.role !== "assistant") {
      continue;
    }
    const blocks = normalizeChatContentBlocks(message.contentBlocks);
    if (!blocks) {
      continue;
    }
    for (const block of blocks) {
      if (block.type === "toolCall" && block.id) {
        absorbed.add(block.id);
      }
    }
  }
  return absorbed;
}

function buildToolResultMap(messages, absorbedToolCallIds) {
  const results = new Map();
  for (const message of messages) {
    const toolCallId = typeof message?.toolCallId === "string" ? message.toolCallId : "";
    const toolName = typeof message?.toolName === "string" ? message.toolName : "";
    if (!toolCallId || !toolName || !absorbedToolCallIds.has(toolCallId)) {
      continue;
    }
    results.set(toolCallId, String(message.content ?? ""));
  }
  return results;
}

function toolResultsForContentBlocks(contentBlocks, toolResultMap) {
  if (!contentBlocks) {
    return undefined;
  }
  const toolResults = {};
  let hasResult = false;
  for (const block of contentBlocks) {
    if (block.type !== "toolCall" || !toolResultMap.has(block.id)) {
      continue;
    }
    toolResults[block.id] = toolResultMap.get(block.id);
    hasResult = true;
  }
  return hasResult ? toolResults : undefined;
}

function toChatTranscriptItem(message, toolResultMap = new Map()) {
  if (!message || typeof message !== "object") {
    return null;
  }
  if (message.role === "compactionSummary") {
    return createChatMessageItem({
      id: `summary:${message.entryId}`,
      role: "system",
      text: message.content,
      systemKind: "compactionSummary",
      expanded: false,
    });
  }
  if (message.role === "system") {
    return createChatMessageItem({
      id: message.entryId,
      role: "system",
      text: message.content,
      systemKind: "system",
      expanded: true,
    });
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
    const contentBlocks = normalizeChatContentBlocks(message.contentBlocks);
    return createChatMessageItem({
      id: message.entryId,
      role: message.role,
      text: message.content,
      contentBlocks,
      toolResults: toolResultsForContentBlocks(contentBlocks, toolResultMap),
    });
  }
  return null;
}

function toChatTranscriptItems(messages) {
  const absorbedToolCallIds = collectAbsorbedToolCallIds(messages);
  const toolResultMap = buildToolResultMap(messages, absorbedToolCallIds);
  return messages
    .filter((message) => {
      const toolCallId = typeof message?.toolCallId === "string" ? message.toolCallId : "";
      const toolName = typeof message?.toolName === "string" ? message.toolName : "";
      return !(toolCallId && toolName && absorbedToolCallIds.has(toolCallId));
    })
    .map((message) => toChatTranscriptItem(message, toolResultMap))
    .filter(Boolean);
}

function toSessionMessageEntry(entry) {
  if (!entry || entry.type !== "message" || !entry.payload || typeof entry.payload !== "object") {
    return null;
  }
  const payload = entry.payload;
  if (payload.role !== "user" && payload.role !== "assistant" && payload.role !== "system") {
    return null;
  }
  if (typeof payload.text !== "string") {
    return null;
  }
  return {
    entryId: entry.entryId,
    timestamp: String(entry.timestamp ?? ""),
    role: payload.role,
    text: payload.text,
  };
}

function toSessionInfoEntry(entry) {
  if (
    !entry ||
    entry.type !== "session_info" ||
    !entry.payload ||
    typeof entry.payload !== "object"
  ) {
    return null;
  }
  const payload = entry.payload;
  if (typeof payload.key !== "string") {
    return null;
  }
  return {
    timestamp: String(entry.timestamp ?? ""),
    key: payload.key,
    value: payload.value,
  };
}

function trimSessionPreview(text) {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
}

function normalizeSessionTitleInput(value) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function normalizeGeneratedSessionTitle(value) {
  const firstLine =
    String(value ?? "")
      .split(/\r?\n/)
      .find((line) => line.trim()) ?? "";
  const normalized = firstLine
    .replace(/^#+\s*/g, "")
    .replace(/^(会话)?标题\s*[:：]\s*/i, "")
    .replace(/^[`"'“”‘’\s]+|[`"'“”‘’\s]+$/g, "")
    .replace(/[。.!！?？]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > 40 ? `${normalized.slice(0, 37)}...` : normalized;
}

function buildSessionTitleMessages(entries) {
  return entries
    .map((entry) => toSessionMessageEntry(entry))
    .filter((message) => {
      if (!message?.text?.trim()) {
        return false;
      }
      return message.role === "user" || message.role === "assistant";
    })
    .slice(0, 8)
    .map((message) => ({
      role: message.role,
      content: trimSessionPreview(message.text),
    }));
}

function cloneSessionPayload(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function extractSessionInfoTitle(entries) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const info = toSessionInfoEntry(entries[index]);
    if (info?.key !== "title") {
      continue;
    }
    const title = normalizeSessionTitleInput(info.value);
    if (title) {
      return title;
    }
  }
  return "";
}

function normalizeSessionSourceLabel(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractSessionInfoSourceLabel(entries) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const info = toSessionInfoEntry(entries[index]);
    if (info?.key !== "sourceLabel") {
      continue;
    }
    const sourceLabel = normalizeSessionSourceLabel(info.value);
    if (sourceLabel) {
      return sourceLabel;
    }
  }
  return "";
}

function normalizeForkedFrom(value) {
  if (!isPlainObject(value)) {
    return null;
  }
  const sessionId = typeof value.sessionId === "string" ? value.sessionId.trim() : "";
  const leafId = typeof value.leafId === "string" ? value.leafId.trim() : "";
  const sourceEntryId = typeof value.sourceEntryId === "string" ? value.sourceEntryId.trim() : "";
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (!sessionId && !leafId && !sourceEntryId && !reason) {
    return null;
  }
  return {
    sessionId,
    leafId,
    sourceEntryId,
    reason,
  };
}

function extractSessionInfoForkedFrom(entries) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const info = toSessionInfoEntry(entries[index]);
    if (info?.key !== "forkedFrom") {
      continue;
    }
    const forkedFrom = normalizeForkedFrom(info.value);
    if (forkedFrom) {
      return forkedFrom;
    }
  }
  return null;
}

function deriveSessionTitle(header, messages, sessionInfoTitle = "") {
  const customTitle = normalizeSessionTitleInput(sessionInfoTitle);
  if (customTitle) {
    return customTitle;
  }
  const explicitTitle = String(header?.title ?? "").trim();
  if (
    explicitTitle &&
    explicitTitle !== "mv3-shell runtime session" &&
    explicitTitle !== "新对话"
  ) {
    return explicitTitle;
  }
  const firstUser = messages.find((message) => message.role === "user" && message.text.trim());
  const title = trimSessionPreview(firstUser?.text ?? "");
  return title || "新对话";
}

function toChatSessionSummary(header, entries, activeSessionId) {
  const messages = entries.map((entry) => toSessionMessageEntry(entry)).filter(Boolean);
  const lastMessage = [...messages].reverse().find((message) => message.text.trim()) ?? null;
  const sessionInfoEntries = entries.map((entry) => toSessionInfoEntry(entry)).filter(Boolean);
  const lastInfo = sessionInfoEntries[sessionInfoEntries.length - 1] ?? null;
  const updatedAt = String(
    lastInfo?.timestamp || lastMessage?.timestamp || header?.createdAt || "",
  );
  return {
    id: header.id,
    title: deriveSessionTitle(header, messages, extractSessionInfoTitle(entries)),
    parentSessionId: header.parentSessionId ?? "",
    sourceLabel: extractSessionInfoSourceLabel(entries),
    forkedFrom: extractSessionInfoForkedFrom(entries),
    createdAt: header.createdAt,
    updatedAt,
    messageCount: messages.length,
    preview: trimSessionPreview(lastMessage?.text ?? ""),
    active: header.id === activeSessionId,
  };
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
      ? config.profiles.map((profile) => ({
          ...profile,
          providerOptions: isPlainObject(profile.providerOptions)
            ? { ...profile.providerOptions }
            : undefined,
        }))
      : [],
  };
}

function trimString(value) {
  return String(value ?? "").trim();
}

function normalizeModelProfileSummary(profile) {
  if (!isPlainObject(profile)) {
    return null;
  }
  const providerId = trimString(profile.providerId ?? profile.provider);
  const model = trimString(profile.llmModel ?? profile.model);
  const baseUrl = trimString(profile.llmBase ?? profile.baseUrl);
  const api = normalizeOpenAiApiMode(
    isPlainObject(profile.providerOptions) ? profile.providerOptions.api : profile.api,
  );
  const normalized = {
    id: trimString(profile.id),
    ...(providerId ? { provider: toConfigModelProvider(providerId) } : {}),
    ...(model ? { model } : {}),
    ...(baseUrl ? { baseUrl: normalizeLlmBaseForApi(baseUrl, api) } : {}),
    api,
  };
  return normalized.id ? normalized : null;
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
      values[field] = redactConfigSummaryField(field, sourceValues[field]);
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

function redactConfigSummaryField(field, value) {
  if (field === "model") {
    const redacted = {};
    for (const [key, entryValue] of Object.entries(value)) {
      if (key === "apiKey") {
        continue;
      }
      if (key === "profiles" && Array.isArray(entryValue)) {
        const profiles = entryValue
          .map((profile) => normalizeModelProfileSummary(profile))
          .filter(Boolean);
        const routing = isPlainObject(value.routing) ? value.routing : {};
        const defaultProfileId = trimString(routing.defaultProfile) || "default";
        if (
          profiles.length > 0 &&
          !profiles.some((profile) => profile.id === defaultProfileId) &&
          typeof value.model === "string" &&
          value.model.trim()
        ) {
          profiles.unshift({
            id: defaultProfileId,
            ...(typeof value.provider === "string"
              ? { provider: toConfigModelProvider(toProfileProviderId(value.provider)) }
              : {}),
            model: value.model.trim(),
            ...(typeof value.baseUrl === "string" && value.baseUrl.trim()
              ? {
                  baseUrl: normalizeLlmBaseForApi(value.baseUrl, normalizeOpenAiApiMode(value.api)),
                }
              : {}),
            api: normalizeOpenAiApiMode(value.api),
          });
        }
        if (profiles.length > 0) {
          redacted.profiles = profiles;
        }
        continue;
      }
      redacted[key] =
        key === "provider" && typeof entryValue === "string"
          ? toConfigModelProvider(toProfileProviderId(entryValue))
          : entryValue;
    }
    const api = normalizeOpenAiApiMode(redacted.api);
    return {
      ...redacted,
      ...(typeof redacted.baseUrl === "string"
        ? { baseUrl: normalizeLlmBaseForApi(redacted.baseUrl, api) }
        : {}),
      api,
    };
  }
  return { ...value };
}

function redactConfigPatchForSummary(patch) {
  if (!isPlainObject(patch)) {
    return patch;
  }

  return Object.fromEntries(
    Object.entries(patch).map(([field, value]) => [
      field,
      isPlainObject(value) ? redactConfigSummaryField(field, value) : value,
    ]),
  );
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
  return normalizeOpenAiProviderAlias(providerId) === "openai_compatible"
    ? "openai"
    : String(providerId || "").trim();
}

function toProfileProviderId(provider) {
  return normalizeOpenAiProviderAlias(provider);
}

function normalizeOpenAiProviderAlias(provider) {
  const normalized = String(provider || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return normalized === "openai" || normalized === "openai_compatible"
    ? "openai_compatible"
    : String(provider || "").trim();
}

function normalizeOpenAiApiMode(api) {
  const normalized = String(api || "")
    .trim()
    .toLowerCase()
    .replace(/[.\s-]+/g, "_");
  if (normalized === "chat" || normalized === "chat_completions" || normalized === "completions") {
    return "chat_completions";
  }
  return "responses";
}

function normalizeLlmBaseForApi(baseUrl, api) {
  const normalized = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  if (!normalized) {
    return "";
  }
  if (api === "responses") {
    return normalized.replace(/\/chat\/completions$/i, "/responses");
  }
  return normalized.replace(/\/responses$/i, "/chat/completions");
}

function createDefaultLlmProfile(profileId = "default") {
  return {
    id: profileId,
    providerId: "openai_compatible",
    llmBase: "https://api.openai.com/v1",
    llmKey: "",
    llmModel: "",
    providerOptions: {
      api: "responses",
    },
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

function normalizeLlmProfilePatch(profilePatch, { defaultProfile, existingProfilesById }) {
  if (!isPlainObject(profilePatch) || typeof profilePatch.id !== "string") {
    return null;
  }

  const id = profilePatch.id.trim();
  if (!id) {
    return null;
  }

  const existingProfile = existingProfilesById.get(id) ?? null;
  const fallbackProfile = existingProfilesById.get(defaultProfile.id) ?? defaultProfile;
  const providerId = toProfileProviderId(
    trimString(
      profilePatch.providerId ??
        profilePatch.provider ??
        existingProfile?.providerId ??
        fallbackProfile?.providerId ??
        "openai_compatible",
    ),
  );
  const apiMode = normalizeOpenAiApiMode(
    isPlainObject(profilePatch.providerOptions)
      ? profilePatch.providerOptions.api
      : (profilePatch.api ??
          existingProfile?.providerOptions?.api ??
          fallbackProfile?.providerOptions?.api),
  );
  const providerOptions = {
    ...(isPlainObject(existingProfile?.providerOptions) ? existingProfile.providerOptions : {}),
    ...(isPlainObject(profilePatch.providerOptions) ? profilePatch.providerOptions : {}),
    api: apiMode,
  };
  const llmBaseSource = trimString(
    profilePatch.llmBase ??
      profilePatch.baseUrl ??
      existingProfile?.llmBase ??
      fallbackProfile?.llmBase ??
      "https://api.openai.com/v1",
  );
  const llmKeySource = trimString(
    profilePatch.llmKey ??
      profilePatch.apiKey ??
      existingProfile?.llmKey ??
      fallbackProfile?.llmKey ??
      "",
  );
  const llmModelSource = trimString(
    profilePatch.llmModel ??
      profilePatch.model ??
      existingProfile?.llmModel ??
      fallbackProfile?.llmModel ??
      "",
  );

  return {
    id,
    providerId,
    llmBase: normalizeLlmBaseForApi(llmBaseSource, apiMode),
    llmKey: llmKeySource,
    llmModel: llmModelSource,
    ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
  };
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
  const apiMode = normalizeOpenAiApiMode(activeProfile.providerOptions?.api);
  if (typeof activeProfile.llmModel === "string" && activeProfile.llmModel.trim()) {
    model.model = activeProfile.llmModel.trim();
  }
  if (typeof activeProfile.llmBase === "string" && activeProfile.llmBase.trim()) {
    model.baseUrl = normalizeLlmBaseForApi(activeProfile.llmBase, apiMode);
  }
  model.api = apiMode;
  const profiles = normalized.profiles
    .map((profile) => normalizeModelProfileSummary(profile))
    .filter(Boolean);
  if (profiles.length > 0) {
    model.profiles = profiles;
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
  if (!isPlainObject(profile.providerOptions)) {
    profile.providerOptions = {};
  }
  const apiMode =
    typeof modelPatch.api === "string" && modelPatch.api.trim()
      ? normalizeOpenAiApiMode(modelPatch.api)
      : normalizeOpenAiApiMode(profile.providerOptions.api);
  if (profile.providerOptions.api !== apiMode) {
    profile.providerOptions = {
      ...profile.providerOptions,
      api: apiMode,
    };
    changed = true;
  }
  if (typeof modelPatch.model === "string" && modelPatch.model.trim()) {
    const llmModel = modelPatch.model.trim();
    if (profile.llmModel !== llmModel) {
      profile.llmModel = llmModel;
      changed = true;
    }
  }
  if (typeof modelPatch.baseUrl === "string" && modelPatch.baseUrl.trim()) {
    const llmBase = normalizeLlmBaseForApi(modelPatch.baseUrl, apiMode);
    if (profile.llmBase !== llmBase) {
      profile.llmBase = llmBase;
      changed = true;
    }
  } else if (!profile.llmBase) {
    profile.llmBase = "https://api.openai.com/v1";
    changed = true;
  } else {
    const normalizedBase = normalizeLlmBaseForApi(profile.llmBase, apiMode);
    if (profile.llmBase !== normalizedBase) {
      profile.llmBase = normalizedBase;
      changed = true;
    }
  }
  if (typeof modelPatch.apiKey === "string") {
    const llmKey = modelPatch.apiKey.trim();
    if (profile.llmKey !== llmKey) {
      profile.llmKey = llmKey;
      changed = true;
    }
    if (llmKey && !profile.llmModel) {
      profile.llmModel = "gpt-4o";
      changed = true;
    }
  }

  if (Array.isArray(modelPatch.profiles)) {
    const existingProfilesById = new Map(
      next.profiles.map((entry) => [
        entry.id,
        cloneLlmProfileConfig({ profiles: [entry], defaultProfile: entry.id })?.profiles?.[0] ??
          entry,
      ]),
    );
    const nextProfiles = [];
    let hasDefaultProfile = false;

    for (const profilePatch of modelPatch.profiles) {
      const normalizedProfile = normalizeLlmProfilePatch(profilePatch, {
        defaultProfile: profile,
        existingProfilesById,
      });
      if (!normalizedProfile) {
        continue;
      }
      if (normalizedProfile.id === defaultProfileId) {
        hasDefaultProfile = true;
      }
      nextProfiles.push(normalizedProfile);
    }

    if (!hasDefaultProfile) {
      nextProfiles.unshift(profile);
    }

    const normalizedCurrentProfiles = JSON.stringify(next.profiles);
    const normalizedNextProfiles = JSON.stringify(nextProfiles);
    if (normalizedCurrentProfiles !== normalizedNextProfiles) {
      next.profiles = nextProfiles;
      changed = true;
    }
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
    if (typeof routingPatch.fallbackProfile === "string") {
      const fallbackProfile = routingPatch.fallbackProfile.trim();
      if (fallbackProfile) {
        if (next.fallbackProfile !== fallbackProfile) {
          next.fallbackProfile = fallbackProfile;
          changed = true;
        }
      } else if (typeof next.fallbackProfile === "string") {
        next.fallbackProfile = undefined;
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
  onObservabilityEvent = undefined,
  captureRuntimeDiagnostics = undefined,
  clearRuntimeError = undefined,
  workspaceId = "mv3-shell",
  interventionTimeoutMs = DEFAULT_INTERVENTION_TIMEOUT_MS,
  interventionEscalationMs = undefined,
  interventionSyncChannel = undefined,
  pageHookScriptPath = "src/page-hook.js",
  skillDefinitions = [],
}: any = {}): any {
  let servicesPromise = null;
  let sessionPromise = null;
  let activeSessionId = null;
  let chatRunStatus = "idle";
  let activeChatRun = null;
  const skillManager = createSkillLifecycleManager({
    chromeApi,
    getVfs: async () => {
      const { browserVfs } = await ensureServices();
      return browserVfs;
    },
    refreshPackages: async () => {
      const { browserVfs, runnerHost, skillInvocationService } = await ensureServices();
      await registerBrowserVfsSkillPackages({
        browserVfs,
        runnerHost,
        skillInvocationService,
        packageCatalog: packageSkillManifests,
      });
    },
  });
  const packageSkillManifests = new Map();
  const resolvedInterventionSyncChannel = createInterventionSyncChannel(interventionSyncChannel);
  const interventionSyncSourceId = crypto.randomUUID();
  const dogfoodExternalPage = {
    enabled: false,
    syntheticTabId: 900_001,
    tab: null,
    timeoutMs: DOGFOOD_EXTERNAL_PAGE_DEFAULT_TIMEOUT_MS,
    requests: [],
    pending: new Map(),
    sequence: 0,
  };
  const runtimeObservabilityTimelineEvents = [];
  const runtimeObservabilityRawEvents = [];
  let debugBundleSequence = 0;

  function cloneDogfoodValue(value) {
    if (value == null) {
      return value;
    }
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function pushBounded(list, value, limit = 256) {
    list.push(value);
    while (list.length > limit) {
      list.shift();
    }
  }

  function rememberRuntimeObservabilityEvent(event, rawEvent) {
    if (event) {
      pushBounded(runtimeObservabilityTimelineEvents, cloneDogfoodValue(event));
    }
    if (rawEvent) {
      pushBounded(runtimeObservabilityRawEvents, cloneDogfoodValue(rawEvent));
    }
  }

  function normalizeDebugBundleLimit(input = {}) {
    const rawLimit = Number(isPlainObject(input) ? input.limit : undefined);
    if (!Number.isFinite(rawLimit)) {
      return 20;
    }
    return Math.max(1, Math.min(50, Math.floor(rawLimit)));
  }

  function laneForCapability(capabilityId, resultData = undefined) {
    if (isPlainObject(resultData)) {
      const trace = Array.isArray(resultData.trace) ? resultData.trace : [];
      if (trace.some((entry) => typeof entry === "string" && entry.startsWith("external-page:"))) {
        return "external-browser-harness";
      }
      const nestedEvidence = resultData.browserActionEvidence ?? resultData.debugEvidence;
      if (isPlainObject(nestedEvidence) && typeof nestedEvidence.lane === "string") {
        return nestedEvidence.lane;
      }
    }
    if (capabilityId === "page.screenshot") {
      return "chrome.tabs.captureVisibleTab";
    }
    if (typeof capabilityId === "string" && capabilityId.startsWith("page.")) {
      return "mv3-scripting/page-hook";
    }
    if (typeof capabilityId === "string" && capabilityId.startsWith("site.")) {
      return "mv3-scripting/page-hook";
    }
    if (typeof capabilityId === "string" && capabilityId.startsWith("tabs.")) {
      return "chrome.tabs";
    }
    if (typeof capabilityId === "string" && capabilityId.startsWith("host.")) {
      return "host bridge";
    }
    return "other";
  }

  function toolCallSummaryFromTimelineEvent(event) {
    if (!isPlainObject(event) || typeof event.eventType !== "string") {
      return null;
    }
    if (!event.eventType.startsWith("runtime.tool.call.")) {
      return null;
    }
    const details = isPlainObject(event.details) ? event.details : {};
    const result = isPlainObject(details.result) ? details.result : {};
    const capabilityId =
      typeof event.capabilityId === "string"
        ? event.capabilityId
        : typeof details.capabilityId === "string"
          ? details.capabilityId
          : null;
    const toolName =
      typeof event.action === "string"
        ? event.action
        : typeof details.toolName === "string"
          ? details.toolName
          : capabilityId;
    const explicitLane =
      isPlainObject(details.browserActionEvidence) &&
      typeof details.browserActionEvidence.lane === "string"
        ? details.browserActionEvidence.lane
        : null;
    const lane = explicitLane ?? laneForCapability(capabilityId, result.data ?? result);
    return {
      eventId: typeof event.id === "string" ? event.id : null,
      eventType: event.eventType,
      status: typeof event.status === "string" ? event.status : "info",
      action: toolName,
      toolName,
      capabilityId,
      lane,
      startedAt: typeof event.startedAt === "string" ? event.startedAt : null,
      timestamp: typeof event.timestamp === "string" ? event.timestamp : null,
      durationMs: typeof event.durationMs === "number" ? event.durationMs : null,
      ok: typeof details.ok === "boolean" ? details.ok : undefined,
      result: stripDebugOnlyFieldsForChat({
        ok: typeof result.ok === "boolean" ? result.ok : details.ok,
        verified:
          typeof result.verified === "boolean"
            ? result.verified
            : isPlainObject(result.data) && typeof result.data.verified === "boolean"
              ? result.data.verified
              : undefined,
        output:
          isPlainObject(result.data) && "result" in result.data ? result.data.result : undefined,
      }),
    };
  }

  function compactDiagnosticsError(error) {
    if (!isPlainObject(error)) {
      return null;
    }
    return {
      code: typeof error.code === "string" ? error.code : "E_RUNTIME",
      message:
        typeof error.message === "string"
          ? error.message
          : String(error.message ?? "Runtime error"),
      ...(typeof error.capturedAt === "string" ? { capturedAt: error.capturedAt } : {}),
    };
  }

  function compactRuntimeDiagnosticsKernel(kernel) {
    if (!isPlainObject(kernel)) {
      return null;
    }
    const session = isPlainObject(kernel.session) ? kernel.session : null;
    const run = isPlainObject(kernel.run) ? kernel.run : null;
    const loop = isPlainObject(kernel.loop) ? kernel.loop : null;
    const interventions = isPlainObject(kernel.interventions) ? kernel.interventions : null;
    const provider = isPlainObject(kernel.provider) ? kernel.provider : null;
    const providerRoute = isPlainObject(provider?.route) ? provider.route : null;
    const registeredProviders = Array.isArray(provider?.registered) ? provider.registered : [];

    return {
      session: session
        ? {
            id: typeof session.id === "string" ? session.id : null,
            title: typeof session.title === "string" ? session.title : null,
            model: typeof session.model === "string" ? session.model : null,
          }
        : null,
      run: run
        ? {
            phase: typeof run.phase === "string" ? run.phase : null,
            queuedPrompts: isPlainObject(run.queuedPrompts)
              ? {
                  steer: typeof run.queuedPrompts.steer === "number" ? run.queuedPrompts.steer : 0,
                  followUp:
                    typeof run.queuedPrompts.followUp === "number" ? run.queuedPrompts.followUp : 0,
                }
              : { steer: 0, followUp: 0 },
            retry: isPlainObject(run.retry)
              ? {
                  active: run.retry.active === true,
                  attempt: typeof run.retry.attempt === "number" ? run.retry.attempt : 0,
                  maxAttempts:
                    typeof run.retry.maxAttempts === "number" ? run.retry.maxAttempts : 0,
                }
              : { active: false, attempt: 0, maxAttempts: 0 },
          }
        : null,
      loop: loop
        ? {
            stepCount: typeof loop.stepCount === "number" ? loop.stepCount : 0,
            noProgress: typeof loop.noProgress === "string" ? loop.noProgress : null,
            maxSteps: typeof loop.maxSteps === "number" ? loop.maxSteps : 0,
          }
        : null,
      interventions: interventions
        ? {
            status: typeof interventions.status === "string" ? interventions.status : "empty",
            totalCount: typeof interventions.totalCount === "number" ? interventions.totalCount : 0,
            activeCount:
              typeof interventions.activeCount === "number" ? interventions.activeCount : 0,
            recentCount:
              typeof interventions.recentCount === "number" ? interventions.recentCount : 0,
          }
        : null,
      provider: {
        route: providerRoute
          ? {
              status: typeof providerRoute.status === "string" ? providerRoute.status : "empty",
              profile: typeof providerRoute.profile === "string" ? providerRoute.profile : null,
              provider: typeof providerRoute.provider === "string" ? providerRoute.provider : null,
              llmModel: typeof providerRoute.llmModel === "string" ? providerRoute.llmModel : null,
            }
          : null,
        registeredCount: registeredProviders.length,
      },
    };
  }

  function compactRuntimeDiagnosticsHosts(hosts) {
    if (!isPlainObject(hosts)) {
      return null;
    }
    const items = Array.isArray(hosts.items) ? hosts.items : [];
    const errors = items
      .filter((item) => isPlainObject(item) && isPlainObject(item.error))
      .map((item) => ({
        hostId: typeof item.hostId === "string" ? item.hostId : null,
        state: typeof item.state === "string" ? item.state : null,
        error: compactDiagnosticsError(item.error),
      }));
    return {
      status: typeof hosts.status === "string" ? hosts.status : "unknown",
      totalCount: typeof hosts.totalCount === "number" ? hosts.totalCount : items.length,
      connectedCount: typeof hosts.connectedCount === "number" ? hosts.connectedCount : 0,
      defaultHostId: typeof hosts.defaultHostId === "string" ? hosts.defaultHostId : null,
      errors,
    };
  }

  function compactRuntimeDiagnosticsBridge(bridge) {
    if (!isPlainObject(bridge)) {
      return null;
    }
    return {
      hostReady: bridge.hostReady === true,
      offscreenPresent: bridge.offscreenPresent === true,
      offscreenPath: typeof bridge.offscreenPath === "string" ? bridge.offscreenPath : null,
    };
  }

  function compactRuntimeDiagnosticsRunner(runner) {
    if (!isPlainObject(runner)) {
      return null;
    }
    const health = isPlainObject(runner.health) ? runner.health : null;
    return {
      reachable: runner.reachable === true,
      ready: runner.ready === true,
      healthStatus: typeof health?.status === "string" ? health.status : null,
      error: compactDiagnosticsError(runner.error),
    };
  }

  function compactRuntimeDiagnosticsSite(site) {
    if (!isPlainObject(site)) {
      return null;
    }
    return {
      status: typeof site.status === "string" ? site.status : "unknown",
      tabId: typeof site.tabId === "number" ? site.tabId : null,
      world: typeof site.world === "string" ? site.world : null,
      stateAvailable: isPlainObject(site.snapshot) || site.snapshot === null,
      error: compactDiagnosticsError(site.error),
    };
  }

  function compactRuntimeDebugBundle(bundle) {
    if (!isPlainObject(bundle)) {
      return null;
    }
    return {
      debugBundleId: typeof bundle.debugBundleId === "string" ? bundle.debugBundleId : null,
      schema: typeof bundle.schema === "string" ? bundle.schema : "bbl.debugBundle.v1",
      generatedAt: typeof bundle.generatedAt === "string" ? bundle.generatedAt : null,
      summary: isPlainObject(bundle.summary) ? stripDebugOnlyFieldsForChat(bundle.summary) : {},
      laneMap: Array.isArray(bundle.laneMap)
        ? bundle.laneMap.map((entry) => stripDebugOnlyFieldsForChat(entry))
        : [],
      resourceRefs: Array.isArray(bundle.resourceRefs)
        ? bundle.resourceRefs.map((entry) => stripDebugOnlyFieldsForChat(entry))
        : [],
      artifactRefs: isPlainObject(bundle.artifactRefs)
        ? stripDebugOnlyFieldsForChat(bundle.artifactRefs)
        : {},
      contextPolicy:
        typeof bundle.contextPolicy === "string"
          ? bundle.contextPolicy
          : "compact_projection_by_default_full_evidence_on_explicit_debug_read",
    };
  }

  function compactRuntimeDiagnosticsForChatTool(snapshot, input = {}) {
    const diagnostics = isPlainObject(snapshot) ? snapshot : {};
    const debug = isPlainObject(diagnostics.debug) ? diagnostics.debug : {};
    const bundle = isPlainObject(debug.bundle)
      ? debug.bundle
      : buildDebugBundle({
          ...(isPlainObject(input) ? input : {}),
          includeTimeline: false,
        });
    const runner = compactRuntimeDiagnosticsRunner(diagnostics.runner);
    const site = compactRuntimeDiagnosticsSite(diagnostics.site);
    const hosts = compactRuntimeDiagnosticsHosts(diagnostics.hosts);
    const debugError = isPlainObject(debug.error) ? debug.error : null;
    const reasons = [
      runner?.error ? { source: "runner", error: runner.error } : null,
      site?.error ? { source: "site", error: site.error } : null,
      ...(hosts?.errors ?? []).map((entry) => ({ source: "host", ...entry })),
      isPlainObject(debugError?.lastError)
        ? { source: "runtime", error: compactDiagnosticsError(debugError.lastError) }
        : null,
    ].filter(Boolean);

    return {
      schema: "bbl.runtimeDiagnosticsProjection.v1",
      capturedAt:
        typeof diagnostics.capturedAt === "string"
          ? diagnostics.capturedAt
          : new Date().toISOString(),
      status: typeof diagnostics.status === "string" ? diagnostics.status : "unknown",
      summary: {
        degraded: diagnostics.status !== "healthy",
        reasonCount: reasons.length,
        reasons,
      },
      kernel: compactRuntimeDiagnosticsKernel(diagnostics.kernel),
      hosts,
      bridge: compactRuntimeDiagnosticsBridge(diagnostics.bridge),
      runner,
      site,
      debug: {
        error: debugError
          ? {
              status: typeof debugError.status === "string" ? debugError.status : "unknown",
              lastError: compactDiagnosticsError(debugError.lastError),
              clearedAt: typeof debugError.clearedAt === "string" ? debugError.clearedAt : null,
            }
          : null,
        bundle: compactRuntimeDebugBundle(bundle),
      },
      contextPolicy: "compact_projection_by_default_full_evidence_on_explicit_debug_read",
    };
  }

  function buildDebugBundle(input = {}) {
    const limit = normalizeDebugBundleLimit(input);
    const timeline = runtimeObservabilityTimelineEvents.slice(-limit);
    const rawTail = runtimeObservabilityRawEvents.slice(-limit);
    const toolCalls = timeline.map(toolCallSummaryFromTimelineEvent).filter(Boolean);
    const laneMap = [];
    const seen = new Set();
    for (const call of toolCalls) {
      const key = `${call.capabilityId ?? call.toolName ?? "unknown"}:${call.lane}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      laneMap.push({
        capabilityId: call.capabilityId,
        toolName: call.toolName,
        lane: call.lane,
        productPath: call.lane !== "external-browser-harness",
      });
    }

    return {
      debugBundleId: `debug-bundle-${++debugBundleSequence}`,
      schema: "bbl.debugBundle.v1",
      generatedAt: new Date().toISOString(),
      summary: {
        timelineEventCount: runtimeObservabilityTimelineEvents.length,
        rawEventTailCount: runtimeObservabilityRawEvents.length,
        toolCallCount: toolCalls.length,
        laneCount: laneMap.length,
      },
      laneMap,
      toolCalls,
      resourceRefs: [
        {
          toolName: "resource_read",
          resourceId: "observability.timeline",
          arguments: { resourceId: "observability.timeline", limit },
        },
        {
          toolName: "resource_read",
          resourceId: "observability.rawEventTail",
          arguments: { resourceId: "observability.rawEventTail", limit },
        },
        {
          toolName: "resource_read",
          resourceId: "runtime.history",
          arguments: { resourceId: "runtime.history", limit },
        },
        {
          toolName: "resource_read",
          resourceId: "audit.tail",
          arguments: { resourceId: "audit.tail", limit },
        },
        {
          toolName: "runtime_capture_diagnostics",
          arguments: {},
        },
      ],
      artifactRefs: {
        screenshot: {
          status: "not_auto_embedded",
          readWith: "page_screenshot",
        },
        network: {
          status: "not_auto_embedded",
          readWith: "observability/raw artifact resource",
        },
      },
      contextPolicy: "compact_projection_by_default_full_evidence_on_explicit_debug_read",
      ...(isPlainObject(input) && input.includeTimeline === true
        ? { timeline: timeline.map((event) => stripDebugOnlyFieldsForChat(event)) }
        : {}),
      ...(isPlainObject(input) && input.includeRawTail === true
        ? { rawTail: rawTail.map((event) => stripDebugOnlyFieldsForChat(event)) }
        : {}),
    };
  }

  function normalizeDogfoodExternalPageTab(tab) {
    if (!isPlainObject(tab)) {
      throw new CapabilityError("E_BAD_INPUT", "dogfood external page requires tab metadata");
    }
    const rawId = tab.tabId ?? tab.id;
    const numericId = Number(rawId);
    const tabId = Number.isFinite(numericId) ? numericId : dogfoodExternalPage.syntheticTabId;
    const url = typeof tab.url === "string" ? tab.url.trim() : "";
    const title = typeof tab.title === "string" ? tab.title.trim() : "";
    if (!url && !title) {
      throw new CapabilityError("E_BAD_INPUT", "dogfood external page tab requires title or url");
    }
    return {
      tabId,
      url,
      active: tab.active !== false,
      title: title || `External tab ${tabId}`,
      ...(rawId != null && !Number.isFinite(numericId) ? { externalTabId: String(rawId) } : {}),
    };
  }

  function getDogfoodExternalPageState() {
    return {
      enabled: dogfoodExternalPage.enabled,
      tab: dogfoodExternalPage.tab ? { ...dogfoodExternalPage.tab } : null,
      pendingCount: dogfoodExternalPage.pending.size,
      queuedCount: dogfoodExternalPage.requests.filter((request) => !request.resolvedAt).length,
      timeoutMs: dogfoodExternalPage.timeoutMs,
    };
  }

  function rejectDogfoodExternalPagePending(reason) {
    for (const [requestId, pending] of dogfoodExternalPage.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new CapabilityError("E_RUNTIME", reason));
      dogfoodExternalPage.pending.delete(requestId);
    }
    dogfoodExternalPage.requests = [];
  }

  function configureDogfoodExternalPageProvider(config = {}) {
    if (config?.enabled === false) {
      dogfoodExternalPage.enabled = false;
      dogfoodExternalPage.tab = null;
      rejectDogfoodExternalPagePending("dogfood external page provider was disabled");
      return getDogfoodExternalPageState();
    }

    const tab = normalizeDogfoodExternalPageTab(config?.tab);
    const timeoutMs = Number(config?.timeoutMs);
    dogfoodExternalPage.enabled = true;
    dogfoodExternalPage.tab = tab;
    dogfoodExternalPage.timeoutMs =
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : DOGFOOD_EXTERNAL_PAGE_DEFAULT_TIMEOUT_MS;
    return getDogfoodExternalPageState();
  }

  function takeDogfoodExternalPageRequest() {
    const now = Date.now();
    const request = dogfoodExternalPage.requests.find((entry) => {
      if (entry.resolvedAt) {
        return false;
      }
      if (!entry.leasedAt) {
        return true;
      }
      return now - Date.parse(entry.leasedAt) > DOGFOOD_EXTERNAL_PAGE_LEASE_MS;
    });
    if (!request) {
      return { request: null, state: getDogfoodExternalPageState() };
    }
    request.leasedAt = new Date(now).toISOString();
    return {
      request: cloneDogfoodValue(request),
      state: getDogfoodExternalPageState(),
    };
  }

  function resolveDogfoodExternalPageRequest({ requestId, id, ok = true, data, error } = {}) {
    const resolvedRequestId = typeof requestId === "string" ? requestId : id;
    if (typeof resolvedRequestId !== "string" || !resolvedRequestId) {
      throw new CapabilityError("E_BAD_INPUT", "dogfood external page resolve requires requestId");
    }
    const pending = dogfoodExternalPage.pending.get(resolvedRequestId);
    if (!pending) {
      return {
        resolved: false,
        requestId: resolvedRequestId,
        state: getDogfoodExternalPageState(),
      };
    }
    clearTimeout(pending.timeout);
    dogfoodExternalPage.pending.delete(resolvedRequestId);
    const request = dogfoodExternalPage.requests.find((entry) => entry.id === resolvedRequestId);
    if (request) {
      request.resolvedAt = new Date().toISOString();
    }
    dogfoodExternalPage.requests = dogfoodExternalPage.requests.filter(
      (entry) => !entry.resolvedAt,
    );
    if (ok === false) {
      const message =
        typeof error === "string"
          ? error
          : isPlainObject(error) && typeof error.message === "string"
            ? error.message
            : `dogfood external page request failed: ${resolvedRequestId}`;
      pending.reject(new CapabilityError("E_RUNTIME", message));
      return {
        resolved: true,
        requestId: resolvedRequestId,
        ok: false,
        state: getDogfoodExternalPageState(),
      };
    }
    pending.resolve(cloneDogfoodValue(data));
    return {
      resolved: true,
      requestId: resolvedRequestId,
      ok: true,
      state: getDogfoodExternalPageState(),
    };
  }

  async function invokeDogfoodExternalPage({ family, action, input = {} }) {
    if (!dogfoodExternalPage.enabled || !dogfoodExternalPage.tab) {
      throw new CapabilityError("E_RUNTIME", "dogfood external page provider is not configured");
    }
    const requestId = `dogfood-external-page-${++dogfoodExternalPage.sequence}`;
    const createdAt = new Date().toISOString();
    const request = {
      id: requestId,
      family,
      action,
      input: cloneDogfoodValue(input),
      tab: { ...dogfoodExternalPage.tab },
      createdAt,
    };
    dogfoodExternalPage.requests.push(request);
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        dogfoodExternalPage.pending.delete(requestId);
        dogfoodExternalPage.requests = dogfoodExternalPage.requests.filter(
          (entry) => entry.id !== requestId,
        );
        reject(
          new CapabilityError(
            "E_RUNTIME",
            `dogfood external page request timed out: ${family}.${action}`,
          ),
        );
      }, dogfoodExternalPage.timeoutMs);
      dogfoodExternalPage.pending.set(requestId, { resolve, reject, timeout });
    });
  }

  async function invokeDogfoodExternalTabsCapability({ binding, input }) {
    switch (binding.operation) {
      case "list":
        return dogfoodExternalPage.tab ? [{ ...dogfoodExternalPage.tab }] : [];
      case "get_active":
        if (!dogfoodExternalPage.tab) {
          throw new CapabilityError("E_RUNTIME", "dogfood external page tab is not configured");
        }
        return { ...dogfoodExternalPage.tab };
      case "navigate": {
        if (!isPlainObject(input) || typeof input.url !== "string" || !input.url.trim()) {
          throw new CapabilityError("E_BAD_INPUT", "tabs.navigate requires a non-empty url");
        }
        const response = await invokeDogfoodExternalPage({
          family: "tabs",
          action: "navigate",
          input: { url: input.url.trim() },
        });
        const nextTab = normalizeDogfoodExternalPageTab(
          response?.tab ??
            response ?? {
              ...dogfoodExternalPage.tab,
              url: input.url.trim(),
            },
        );
        dogfoodExternalPage.tab = nextTab;
        return nextTab;
      }
      default:
        throw new CapabilityError("E_RUNTIME", `Unsupported tabs operation: ${binding.operation}`);
    }
  }

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
        const browserVfs = await createRuntimeBrowserVfs({
          chromeApi,
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

        const chromeTabsProvider = createTabsCapabilityProvider(
          createChromeTabsTransport({ chromeApi }),
        );
        providers.register({
          family: "tabs",
          async invoke(request) {
            if (dogfoodExternalPage.enabled) {
              return invokeDogfoodExternalTabsCapability(request);
            }
            return chromeTabsProvider.invoke(request);
          },
        });
        providers.register({
          family: "page",
          async invoke({ binding, input }) {
            if (dogfoodExternalPage.enabled) {
              return invokeDogfoodExternalPage({
                family: "page",
                action: binding.operation,
                input,
              });
            }
            return invokePageAction({
              action: binding.operation,
              input,
            });
          },
        });
        providers.register(
          createMemfsCapabilityProvider(createBrowserVfsMemfsTransport(browserVfs)),
        );
        providers.register(createConfigCapabilityProvider(configControlPlane));
        providers.register({
          family: "runtime",
          async invoke({ binding, input }) {
            switch (binding.operation) {
              case "capture_diagnostics":
                if (typeof captureRuntimeDiagnostics === "function") {
                  return compactRuntimeDiagnosticsForChatTool(
                    await captureRuntimeDiagnostics(input),
                    input,
                  );
                }
                return compactRuntimeDiagnosticsForChatTool({
                  capturedAt: new Date().toISOString(),
                  status: "available",
                  kernel: kernelRef?.captureDiagnostics?.(activeSessionId) ?? null,
                  debug: {
                    bundle: buildDebugBundle({
                      ...(isPlainObject(input) ? input : {}),
                      includeTimeline: true,
                    }),
                  },
                  contextPolicy:
                    "compact_projection_by_default_full_evidence_on_explicit_debug_read",
                });
              case "clear_error":
                if (typeof clearRuntimeError === "function") {
                  return clearRuntimeError();
                }
                return { cleared: false };
              default:
                throw new CapabilityError(
                  "E_RUNTIME",
                  `Unsupported runtime operation: ${binding.operation}`,
                );
            }
          },
        });
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
        providers.register({
          family: "debug",
          async invoke({ binding, input }) {
            switch (binding.operation) {
              case "bundle":
                return buildDebugBundle(input);
              default:
                throw new CapabilityError(
                  "E_RUNTIME",
                  `Unsupported debug operation: ${binding.operation}`,
                );
            }
          },
        });
        const skillInvocationService = new SkillInvocationService({
          registry,
          providers,
          manageSkill: manageSkillRequest,
        });
        for (const skillDefinition of Array.isArray(skillDefinitions) ? skillDefinitions : []) {
          skillInvocationService.register(skillDefinition);
        }

        const runnerHost = createBridgeRunnerHost({ invokeRunner });
        await registerBrowserVfsSkillPackages({
          browserVfs,
          runnerHost,
          skillInvocationService,
          packageCatalog: packageSkillManifests,
        });
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
                ...(isPlainObject(payload.handoff) ? { handoff: payload.handoff } : {}),
                ...(Array.isArray(payload.handoffs) ? { handoffs: payload.handoffs } : {}),
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
          browserVfs,
          runnerHost,
          skillInvocationService,
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
        const sessions = await kernel.listSessions();
        const selected = activeSessionId
          ? sessions.find((session) => session.id === activeSessionId)
          : null;
        const existing =
          selected ?? pickRuntimeSession(sessions) ?? pickMostRecentSession(sessions);
        const session =
          existing ??
          (await kernel.createSession({
            title: "mv3-shell runtime session",
          }));
        activeSessionId = session.id;
        await kernel.rehydrateInterventions(session.id);
        return session;
      });
    }
    return sessionPromise;
  }

  async function manageSkillRequest(request) {
    if (request?.action === "skills.discover") {
      return discoverSkills(request.input);
    }
    return skillManager.manage(request);
  }

  async function setActiveChatSession(session) {
    activeSessionId = session.id;
    sessionPromise = Promise.resolve(session);
    const { kernel } = await ensureServices();
    await kernel.rehydrateInterventions(session.id);
    return session;
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
      return services.configControlPlane.update(redactConfigPatchForSummary(sanitizedPatch));
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
      manageSkill: manageSkillRequest,
      invokeSkill: async (request) => {
        await ensureSkillInvokable(request.skillId);
        return services.skillInvocationService.invoke({
          sessionId: session.id,
          skillId: request.skillId,
          action: request.action,
          args: request.args,
          parentContext: request.parentContext,
        });
      },
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
    const services = await ensureServices();
    await registerBrowserVfsSkillPackages({
      browserVfs: services.browserVfs,
      runnerHost: services.runnerHost,
      skillInvocationService: services.skillInvocationService,
      packageCatalog: packageSkillManifests,
    });
    return Promise.all(
      (await skillManager.list()).map(async (record) => {
        const manifest = packageSkillManifests.get(record.skillId);
        if (!manifest) {
          return lifecycleRecordToSkillSummary(record);
        }
        return packageManifestToSkillSummary(
          record,
          manifest,
          await buildPackageSkillVersionSurface(record, manifest, services.browserVfs),
        );
      }),
    );
  }

  async function ensureSkillInvokable(skillId) {
    const record = (await skillManager.list()).find((item) => item.skillId === skillId);
    if (!record) {
      throw new CapabilityError("E_PERMISSION_DENIED", `Skill is not installed: ${skillId}`);
    }
    if (record.status !== "enabled") {
      throw new CapabilityError("E_PERMISSION_DENIED", `Skill is not enabled: ${skillId}`);
    }
    return record;
  }

  function normalizeSkillDiscoverRoots(input = {}) {
    const explicitRoots = Array.isArray(input?.roots) ? input.roots : [];
    const candidates =
      explicitRoots.length > 0
        ? explicitRoots
        : [
            {
              root: typeof input?.root === "string" ? input.root : "mem://skills",
              source: typeof input?.source === "string" ? input.source : "browser",
            },
          ];
    const roots = candidates
      .map((item) => {
        const root =
          typeof item === "string"
            ? item.trim()
            : typeof item?.root === "string"
              ? item.root.trim()
              : "";
        if (!root) {
          return null;
        }
        return {
          root,
          source:
            typeof item === "object" && typeof item?.source === "string" && item.source.trim()
              ? item.source.trim()
              : "browser",
        };
      })
      .filter(Boolean);
    return roots.length > 0 ? roots : [{ root: "mem://skills", source: "browser" }];
  }

  async function discoverSkills(input = {}) {
    const services = await ensureServices();
    const roots = normalizeSkillDiscoverRoots(input);
    const autoInstall = input?.autoInstall !== false;
    const replace = input?.replace !== false;
    const maxFiles =
      typeof input?.maxFiles === "number" && Number.isFinite(input.maxFiles)
        ? Math.max(0, Math.floor(input.maxFiles))
        : null;
    const discovered = [];
    const installed = [];
    const skipped = [];
    let scanned = 0;
    const lifecycleRecords = new Map(
      (await skillManager.list()).map((record) => [record.skillId, record]),
    );

    for (const rootEntry of roots) {
      const packages = await services.browserVfs.discoverPackages(rootEntry.root);
      for (const packageInfo of maxFiles == null ? packages : packages.slice(0, maxFiles)) {
        scanned += 1;
        const record = {
          skillId: packageInfo.id,
          uri: packageInfo.uri,
          root: rootEntry.root,
          source: rootEntry.source,
        };
        if (!packageInfo.hasMarker) {
          skipped.push({ ...record, reason: "missing_skill_marker" });
          continue;
        }
        discovered.push(record);

        if (!autoInstall) {
          continue;
        }

        const previous = lifecycleRecords.get(packageInfo.id);
        const activeInstalled = previous && previous.status !== "archived";
        if (activeInstalled && !replace) {
          skipped.push({ ...record, reason: "already_installed" });
          continue;
        }

        const canonicalPackageUri = `mem://skills/${packageInfo.id}`;
        if (packageInfo.uri !== canonicalPackageUri) {
          if (
            activeInstalled &&
            replace &&
            (await services.browserVfs.isPackageRoot(canonicalPackageUri))
          ) {
            await snapshotCurrentPackageForUpdate({
              skillId: packageInfo.id,
              vfs: services.browserVfs,
            });
          }
          await services.browserVfs.copy(packageInfo.uri, canonicalPackageUri);
        }

        const result = await skillManager.manage({
          action: "skills.install",
          skillId: packageInfo.id,
          input: {
            metadata: {
              source: "sidepanel.skill-discover",
              root: rootEntry.root,
            },
          },
        });
        lifecycleRecords.set(packageInfo.id, {
          skillId: result.skill.skillId,
          status: result.skill.status,
          trusted: result.skill.trusted,
          recentChange: result.skill.recentChange,
          lastChangedAt: new Date().toISOString(),
        });
        installed.push(result.skill);
      }
    }

    return {
      sessionId: activeSessionId ?? null,
      roots,
      counts: {
        scanned,
        discovered: discovered.length,
        installed: installed.length,
        skipped: skipped.length,
      },
      discovered,
      installed,
      skipped,
      skills: await listSkills(),
    };
  }

  function normalizeChatSendMode(mode) {
    return mode === "followUp" ? "followUp" : mode === "steer" ? "steer" : "normal";
  }

  function normalizePromptContextTabs(context) {
    const tabs = Array.isArray(context?.tabs) ? context.tabs : [];
    return tabs
      .map((tab) => {
        if (!isPlainObject(tab)) {
          return null;
        }
        const id = Number(tab.id);
        const title = typeof tab.title === "string" ? tab.title.trim() : "";
        const url = typeof tab.url === "string" ? tab.url.trim() : "";
        if (!Number.isFinite(id) || (!title && !url)) {
          return null;
        }
        return {
          id,
          title: title || `Tab ${id}`,
          url,
        };
      })
      .filter(Boolean);
  }

  function normalizePromptContextSkills(context) {
    const skills = Array.isArray(context?.skills) ? context.skills : [];
    const skillIds = Array.isArray(context?.skillIds) ? context.skillIds : [];
    const normalized = skills
      .map((skill) => {
        if (!isPlainObject(skill)) {
          return null;
        }
        const id =
          typeof skill.id === "string"
            ? skill.id.trim()
            : typeof skill.skillId === "string"
              ? skill.skillId.trim()
              : "";
        if (!id) {
          return null;
        }
        const description = typeof skill.description === "string" ? skill.description.trim() : "";
        const enabled = skill.enabled !== false;
        return {
          id,
          description,
          enabled,
        };
      })
      .filter(Boolean);
    const knownIds = new Set(normalized.map((skill) => skill.id));
    for (const value of skillIds) {
      const id = typeof value === "string" ? value.trim() : "";
      if (!id || knownIds.has(id)) {
        continue;
      }
      normalized.push({
        id,
        description: "",
        enabled: true,
      });
      knownIds.add(id);
    }
    return normalized;
  }

  function buildChatPromptText(prompt, context) {
    const skills = normalizePromptContextSkills(context);
    const tabs = normalizePromptContextTabs(context);
    if (tabs.length === 0 && skills.length === 0) {
      return prompt;
    }
    const sections = [];
    if (!prompt && (tabs.length > 0 || skills.length > 0)) {
      sections.push(
        "The user did not provide extra text. Use the selected skills and browser tabs as context.",
      );
    }
    if (prompt) {
      sections.push(prompt);
    }
    if (skills.length > 0) {
      const skillLines = skills.map(
        (skill) =>
          `- skill ${skill.id}${skill.description ? `: ${skill.description}` : ""}${skill.enabled ? "" : " (disabled)"}`,
      );
      sections.push(["Selected skills:", ...skillLines].join("\n"));
    }
    const tabLines = tabs.map(
      (tab) => `- tab ${tab.id}: ${tab.title}${tab.url ? ` (${tab.url})` : ""}`,
    );
    if (tabs.length > 0) {
      sections.push(["Referenced browser tabs:", ...tabLines].join("\n"));
    }
    return sections.filter((section) => section.length > 0).join("\n\n");
  }

  function buildChatHistoryText(prompt, context) {
    if (prompt) {
      return prompt;
    }
    const skills = normalizePromptContextSkills(context);
    const tabs = normalizePromptContextTabs(context);
    const parts = [];
    if (skills.length > 0) {
      parts.push(`Selected skills: ${skills.map((skill) => skill.id).join(", ")}`);
    }
    if (tabs.length > 0) {
      parts.push(`Referenced tabs: ${tabs.map((tab) => tab.title).join(", ")}`);
    }
    return parts.join("\n");
  }

  async function buildChatBootstrap() {
    const [{ kernel }, session] = await Promise.all([ensureServices(), ensureSession()]);
    return buildChatBootstrapForSession(kernel, session);
  }

  async function buildChatBootstrapForSession(kernel, session) {
    const context = await kernel.buildContext(session.id);

    return {
      sessionId: session.id,
      messages: toChatTranscriptItems(context.messages),
      runState: {
        status: normalizeChatRunStatus(chatRunStatus),
        phase:
          normalizeChatRunStatus(chatRunStatus) === "running"
            ? "thinking"
            : normalizeChatRunStatus(chatRunStatus) === "stopped"
              ? "stopped"
              : "idle",
      },
    };
  }

  async function listChatSessions() {
    const [{ kernel }, session] = await Promise.all([ensureServices(), ensureSession()]);
    const headers = await kernel.listSessions();
    const items = await Promise.all(
      headers.map(async (header) => {
        let entries = [];
        try {
          entries = await kernel.sessions.getEntries(header.id);
        } catch {
          entries = [];
        }
        return toChatSessionSummary(header, entries, session.id);
      }),
    );
    return {
      activeSessionId: session.id,
      items: items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    };
  }

  function assertCanSwitchChatSession() {
    if (activeChatRun && chatRunStatus === "running") {
      throw new CapabilityError(
        "E_RUNTIME",
        "runtime.chat.session requires the current run to finish",
      );
    }
  }

  async function createChatSession() {
    assertCanSwitchChatSession();
    const { kernel } = await ensureServices();
    const session = await kernel.createSession({
      title: "新对话",
    });
    await setActiveChatSession(session);
    return buildChatBootstrapForSession(kernel, session);
  }

  async function selectChatSession({ sessionId } = {}) {
    assertCanSwitchChatSession();
    const id = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!id) {
      throw new CapabilityError("E_BAD_INPUT", "runtime.chat.session.select requires sessionId");
    }
    const { kernel } = await ensureServices();
    const session = (await kernel.listSessions()).find((item) => item.id === id);
    if (!session) {
      throw new CapabilityError("E_NOT_FOUND", `Session not found: ${id}`);
    }
    await setActiveChatSession(session);
    return buildChatBootstrapForSession(kernel, session);
  }

  async function deleteChatSession({ sessionId } = {}) {
    assertCanSwitchChatSession();
    const id = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!id) {
      throw new CapabilityError("E_BAD_INPUT", "runtime.chat.session.delete requires sessionId");
    }
    const { kernel } = await ensureServices();
    await kernel.deleteSession(id);
    if (activeSessionId === id) {
      activeSessionId = null;
      sessionPromise = null;
    }
    const bootstrap = await buildChatBootstrap();
    return {
      deletedSessionId: id,
      ...bootstrap,
    };
  }

  async function updateChatSessionTitle({ sessionId, title } = {}) {
    const id = typeof sessionId === "string" ? sessionId.trim() : "";
    const normalizedTitle = normalizeSessionTitleInput(title);
    if (!id) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        "runtime.chat.session.update_title requires sessionId",
      );
    }
    if (!normalizedTitle) {
      throw new CapabilityError("E_BAD_INPUT", "runtime.chat.session.update_title requires title");
    }

    const [{ kernel }, session] = await Promise.all([ensureServices(), ensureSession()]);
    const header = (await kernel.listSessions()).find((item) => item.id === id);
    if (!header) {
      throw new CapabilityError("E_NOT_FOUND", `Session not found: ${id}`);
    }

    await kernel.appendEntry(id, "session_info", {
      key: "title",
      value: normalizedTitle,
    });

    const entries = await kernel.sessions.getEntries(id);
    return {
      item: toChatSessionSummary(header, entries, session.id),
    };
  }

  async function refreshChatSessionTitle({ sessionId } = {}) {
    const id = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!id) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        "runtime.chat.session.refresh_title requires sessionId",
      );
    }

    const [{ kernel, llmProviderRegistry, profileConfig: managedProfileConfig }, session] =
      await Promise.all([ensureServices(), ensureSession()]);
    const header = (await kernel.listSessions()).find((item) => item.id === id);
    if (!header) {
      throw new CapabilityError("E_NOT_FOUND", `Session not found: ${id}`);
    }

    const entries = await kernel.sessions.getEntries(id);
    const messages = buildSessionTitleMessages(entries);
    if (messages.length === 0) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        "runtime.chat.session.refresh_title requires at least one message",
      );
    }
    if (!managedProfileConfig) {
      throw new CapabilityError(
        "E_RUNTIME",
        "No LLM provider is configured. Please set an API key via config.update to refresh session titles.",
      );
    }

    const titleLlm = createKernelLlmFromProvider(
      llmProviderRegistry,
      managedProfileConfig,
      undefined,
      { lane: "title", role: "worker" },
    );
    const generated = await titleLlm.complete({
      systemPrompt:
        "你是浏览器助理的会话标题生成器。请根据对话生成一个非常简短的中文标题，最多 12 个汉字或 24 个英文字符。只输出标题本身，不要引号、前缀、解释或标点。",
      messages,
      maxTokens: 30,
    });
    const normalizedTitle = normalizeGeneratedSessionTitle(generated);
    if (!normalizedTitle) {
      throw new CapabilityError("E_RUNTIME", "LLM returned an empty session title");
    }

    await kernel.appendEntry(id, "session_info", {
      key: "title",
      value: normalizedTitle,
    });

    const refreshedEntries = await kernel.sessions.getEntries(id);
    return {
      item: toChatSessionSummary(header, refreshedEntries, session.id),
    };
  }

  function findAssistantForkContext(entries, messageId) {
    const id = typeof messageId === "string" ? messageId.trim() : "";
    if (!id) {
      throw new CapabilityError("E_BAD_INPUT", "runtime.chat.message.fork requires messageId");
    }
    const assistantIndex = entries.findIndex((entry) => {
      const message = toSessionMessageEntry(entry);
      return message?.entryId === id && message.role === "assistant" && message.text.trim();
    });
    if (assistantIndex < 0) {
      throw new CapabilityError("E_NOT_FOUND", `Assistant message not found: ${id}`);
    }
    for (let index = assistantIndex - 1; index >= 0; index--) {
      const message = toSessionMessageEntry(entries[index]);
      if (message?.role === "user" && message.text.trim()) {
        return {
          assistantEntry: entries[assistantIndex],
          assistantIndex,
          previousUserEntry: entries[index],
          previousUserIndex: index,
          previousUserMessage: message,
        };
      }
    }
    throw new CapabilityError(
      "E_BAD_INPUT",
      "runtime.chat.message.fork requires a previous user message",
    );
  }

  function findLatestMessageIndex(entries, role) {
    for (let index = entries.length - 1; index >= 0; index--) {
      const message = toSessionMessageEntry(entries[index]);
      if (message?.role === role && message.text.trim()) {
        return index;
      }
    }
    return -1;
  }

  function findAssistantRetryContext(entries, messageId) {
    const context = findAssistantForkContext(entries, messageId);
    const latestAssistantIndex = findLatestMessageIndex(entries, "assistant");
    if (latestAssistantIndex !== context.assistantIndex) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        "Only the latest assistant message can be retried; fork older assistant messages instead.",
      );
    }
    return context;
  }

  function findUserEditContext(entries, messageId) {
    const id = typeof messageId === "string" ? messageId.trim() : "";
    if (!id) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        "runtime.chat.message.edit_rerun requires messageId",
      );
    }
    const userIndex = entries.findIndex((entry) => {
      const message = toSessionMessageEntry(entry);
      return message?.entryId === id && message.role === "user" && message.text.trim();
    });
    if (userIndex < 0) {
      throw new CapabilityError("E_NOT_FOUND", `User message not found: ${id}`);
    }
    const latestUserIndex = findLatestMessageIndex(entries, "user");
    const userMessage = toSessionMessageEntry(entries[userIndex]);
    return {
      userEntry: entries[userIndex],
      userIndex,
      userMessage,
      latest: latestUserIndex === userIndex,
    };
  }

  function entriesForSameSessionRerun(entries, stopIndex) {
    const kept = entries.slice(0, stopIndex);
    const seen = new Set(kept.map((entry) => entry.entryId));
    for (const entry of entries.slice(stopIndex)) {
      if (entry?.type !== "session_info" || seen.has(entry.entryId)) {
        continue;
      }
      kept.push(entry);
      seen.add(entry.entryId);
    }
    return kept.map((entry) => ({
      ...entry,
      payload: cloneSessionPayload(entry.payload),
    }));
  }

  async function rebaseSessionBeforeIndex(kernel, sessionId, entries, stopIndex) {
    await kernel.replaceEntries(sessionId, entriesForSameSessionRerun(entries, stopIndex));
  }

  async function copyEntriesBeforeIndex(kernel, sourceSessionId, targetSessionId, stopIndex) {
    const entries = await kernel.sessions.getEntries(sourceSessionId);
    const oldToNewEntryId = new Map();
    for (const entry of entries.slice(0, stopIndex)) {
      if (!entry || typeof entry.type !== "string") {
        continue;
      }
      const payload = cloneSessionPayload(entry.payload);
      if (
        entry.type === "compaction" &&
        payload &&
        typeof payload === "object" &&
        typeof payload.firstKeptEntryId === "string"
      ) {
        payload.firstKeptEntryId =
          oldToNewEntryId.get(payload.firstKeptEntryId) ?? payload.firstKeptEntryId;
      }
      const copied = await kernel.appendEntry(targetSessionId, entry.type, payload);
      oldToNewEntryId.set(entry.entryId, copied.entryId);
    }
  }

  async function forkAssistantMessage({ messageId } = {}) {
    assertCanSwitchChatSession();
    const [services, sourceSession] = await Promise.all([ensureServices(), ensureSession()]);
    const { kernel } = services;
    const sourceEntries = await kernel.sessions.getEntries(sourceSession.id);
    const forkContext = findAssistantForkContext(sourceEntries, messageId);
    const previousPrompt = forkContext.previousUserMessage.text.trim();
    const forkedFrom = {
      sessionId: sourceSession.id,
      leafId: forkContext.assistantEntry.entryId,
      sourceEntryId: forkContext.assistantEntry.entryId,
      reason: "branch_from_assistant",
    };
    const forkTitle = normalizeSessionTitleInput(
      `重答分支 · ${trimSessionPreview(previousPrompt)}`,
    );
    const forkSession = await kernel.createSession({
      parentSessionId: sourceSession.id,
      title: forkTitle || "重答分支",
    });

    await copyEntriesBeforeIndex(
      kernel,
      sourceSession.id,
      forkSession.id,
      forkContext.previousUserIndex,
    );
    await kernel.appendEntry(forkSession.id, "session_info", {
      key: "forkedFrom",
      value: forkedFrom,
    });
    await kernel.appendEntry(forkSession.id, "session_info", {
      key: "title",
      value: forkTitle || "重答分支",
    });
    await setActiveChatSession(forkSession);

    const accepted = await sendChatPrompt({
      text: previousPrompt,
      mode: "normal",
    });
    return {
      ...accepted,
      mode: "fork",
      sessionId: forkSession.id,
      sourceSessionId: sourceSession.id,
      sourceEntryId: forkContext.assistantEntry.entryId,
      previousUserEntryId: forkContext.previousUserEntry.entryId,
      promptText: previousPrompt,
      messages: toChatTranscriptItems((await kernel.buildContext(forkSession.id)).messages),
    };
  }

  async function retryAssistantMessage({ messageId } = {}) {
    assertCanSwitchChatSession();
    const [services, session] = await Promise.all([ensureServices(), ensureSession()]);
    const { kernel } = services;
    const entries = await kernel.sessions.getEntries(session.id);
    const retryContext = findAssistantRetryContext(entries, messageId);
    const previousPrompt = retryContext.previousUserMessage.text.trim();

    await rebaseSessionBeforeIndex(kernel, session.id, entries, retryContext.previousUserIndex);
    const accepted = await sendChatPrompt({
      text: previousPrompt,
      mode: "normal",
    });
    return {
      ...accepted,
      mode: "retry",
      sessionId: session.id,
      sourceSessionId: session.id,
      sourceEntryId: retryContext.assistantEntry.entryId,
      previousUserEntryId: retryContext.previousUserEntry.entryId,
      promptText: previousPrompt,
      messages: toChatTranscriptItems((await kernel.buildContext(session.id)).messages),
    };
  }

  async function editUserMessageAndRerun({ messageId, text } = {}) {
    assertCanSwitchChatSession();
    const prompt = typeof text === "string" ? text.trim() : "";
    if (!prompt) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        "runtime.chat.message.edit_rerun requires non-empty text",
      );
    }
    const [services, sourceSession] = await Promise.all([ensureServices(), ensureSession()]);
    const { kernel } = services;
    const sourceEntries = await kernel.sessions.getEntries(sourceSession.id);
    const editContext = findUserEditContext(sourceEntries, messageId);

    if (editContext.latest) {
      await rebaseSessionBeforeIndex(
        kernel,
        sourceSession.id,
        sourceEntries,
        editContext.userIndex,
      );
      const accepted = await sendChatPrompt({
        text: prompt,
        mode: "normal",
      });
      return {
        ...accepted,
        mode: "retry",
        sessionId: sourceSession.id,
        sourceSessionId: sourceSession.id,
        sourceEntryId: editContext.userEntry.entryId,
        activeSourceEntryId: editContext.userEntry.entryId,
        promptText: prompt,
        messages: toChatTranscriptItems((await kernel.buildContext(sourceSession.id)).messages),
      };
    }

    const forkedFrom = {
      sessionId: sourceSession.id,
      leafId: editContext.userEntry.entryId,
      sourceEntryId: editContext.userEntry.entryId,
      reason: "branch_from_user_edit",
    };
    const forkTitle = normalizeSessionTitleInput(`编辑重跑 · ${trimSessionPreview(prompt)}`);
    const forkSession = await kernel.createSession({
      parentSessionId: sourceSession.id,
      title: forkTitle || "编辑重跑",
    });

    await copyEntriesBeforeIndex(kernel, sourceSession.id, forkSession.id, editContext.userIndex);
    await kernel.appendEntry(forkSession.id, "session_info", {
      key: "forkedFrom",
      value: forkedFrom,
    });
    await kernel.appendEntry(forkSession.id, "session_info", {
      key: "title",
      value: forkTitle || "编辑重跑",
    });
    await setActiveChatSession(forkSession);

    const accepted = await sendChatPrompt({
      text: prompt,
      mode: "normal",
    });
    return {
      ...accepted,
      mode: "fork",
      sessionId: forkSession.id,
      sourceSessionId: sourceSession.id,
      sourceEntryId: editContext.userEntry.entryId,
      activeSourceEntryId: editContext.userEntry.entryId,
      promptText: prompt,
      messages: toChatTranscriptItems((await kernel.buildContext(forkSession.id)).messages),
    };
  }

  async function emitChatRunState(sessionId, status, activity = {}) {
    chatRunStatus = normalizeChatRunStatus(status);
    await emitRuntimeChatEvent(chromeApi, {
      type: "run.state",
      sessionId,
      status: chatRunStatus,
      ...activity,
    });
  }

  async function sendChatPrompt({ text, mode, context } = {}) {
    const prompt = typeof text === "string" ? text.trim() : "";
    const sendMode = normalizeChatSendMode(mode);
    const [services, session] = await Promise.all([ensureServices(), ensureSession()]);
    const { kernel, registry, profileConfig: managedProfileConfig } = services;
    const tabs = normalizePromptContextTabs(context);
    const skills = normalizePromptContextSkills(context);
    if (!prompt && tabs.length === 0 && skills.length === 0) {
      throw new CapabilityError(
        "E_BAD_INPUT",
        "runtime.chat.send requires text, selected tabs, or selected skills",
      );
    }
    const promptText = buildChatPromptText(prompt, context);
    const historyText = buildChatHistoryText(prompt, context);

    if (activeChatRun && chatRunStatus === "running") {
      const behavior = sendMode === "followUp" ? "followUp" : "steer";
      const queuedPrompt = kernel.enqueue(session.id, behavior, promptText);
      return {
        sessionId: session.id,
        accepted: true,
        queued: true,
        behavior,
        queuedPrompt,
        runState: {
          status: normalizeChatRunStatus(chatRunStatus),
        },
      };
    }

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

    await emitChatRunState(session.id, "running", {
      phase: "thinking",
      summary: "准备请求模型",
    });

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
            phase: "model_streaming",
          });

          await kernel.appendMessage(session.id, {
            role: "user",
            text: historyText,
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
            phase: "finalizing",
          });

          if (activeChatRun?.id === runId) {
            activeChatRun = null;
            await emitChatRunState(session.id, "idle", {
              phase: "completed",
              summary: "回复完成",
            });
          }
          return;
        }

        // Real LLM loop via runLoop()
        const provider = providerRegistry.get(activeProfile.route.provider);
        if (!provider) {
          throw new CapabilityError("E_RUNTIME", "LLM provider not available");
        }

        const pendingToolMessageIds = new Map();
        const rememberPendingToolMessage = (toolName, messageId) => {
          const key = String(toolName || "tool");
          const queue = pendingToolMessageIds.get(key) ?? [];
          queue.push(messageId);
          pendingToolMessageIds.set(key, queue);
        };
        const claimPendingToolMessageId = (toolName) => {
          const key = String(toolName || "tool");
          const queue = pendingToolMessageIds.get(key) ?? [];
          const messageId = queue.shift();
          if (queue.length > 0) {
            pendingToolMessageIds.set(key, queue);
          } else {
            pendingToolMessageIds.delete(key);
          }
          return messageId || `tool-${crypto.randomUUID()}`;
        };

        const result = await runLoop(
          {
            kernel,
            registry,
            provider,
            profileConfig: managedProfileConfig,
          },
          {
            sessionId: session.id,
            prompt: promptText,
            historyText,
            signal: controller.signal,
            onDelta(chunk) {
              finalAssistantText += chunk;
              void emitRuntimeChatEvent(chromeApi, {
                type: "assistant.delta",
                sessionId: session.id,
                messageId: assistantMessageId,
                chunk,
                phase: "model_streaming",
              });
            },
            onToolCall(toolName, args) {
              const toolMsgId = `tool-${crypto.randomUUID()}`;
              const detail =
                args === undefined || args === null
                  ? ""
                  : typeof args === "string"
                    ? args
                    : JSON.stringify(args);
              rememberPendingToolMessage(toolName, toolMsgId);
              void emitRuntimeChatEvent(chromeApi, {
                type: "tool.call",
                sessionId: session.id,
                messageId: toolMsgId,
                toolCallId: toolMsgId,
                toolName,
                summary: `执行中 · ${toolName}`,
                detail,
                phase: "tool_running",
              });
            },
            onToolResult(toolName, resultData) {
              const toolMsgId = claimPendingToolMessageId(toolName);
              const detail = serializeChatToolResult(resultData);
              const summary = summarizeChatToolDetail(
                resultData && typeof resultData === "object" && "data" in resultData
                  ? JSON.stringify(stripDebugOnlyFieldsForChat(resultData.data))
                  : detail,
              );
              void emitRuntimeChatEvent(chromeApi, {
                type: "tool.result",
                sessionId: session.id,
                messageId: toolMsgId,
                toolCallId: toolMsgId,
                toolName,
                summary,
                detail,
                phase: "processing_result",
                status: resultData?.ok === false ? "failed" : "done",
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
            async onObservabilityEvent(event, rawEvent) {
              rememberRuntimeObservabilityEvent(event, rawEvent);
              if (typeof onObservabilityEvent !== "function") {
                return;
              }
              try {
                await onObservabilityEvent(event, rawEvent);
              } catch {
                // Observability should never break the primary loop.
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
          phase: "finalizing",
        });

        if (activeChatRun?.id === runId) {
          activeChatRun = null;
          await emitChatRunState(session.id, "idle", {
            phase: result.terminalStatus === "done" ? "completed" : "stopped",
            summary: `terminalStatus=${result.terminalStatus}`,
          });
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
        await emitChatRunState(session.id, "idle", {
          phase: "failed",
          summary: error instanceof Error ? error.message : String(error),
        });
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
    await emitChatRunState(session.id, "stopped", {
      phase: "stopped",
      summary: "用户停止运行",
    });
    return {
      sessionId: session.id,
      runState: {
        status: normalizeChatRunStatus(chatRunStatus),
      },
    };
  }

  async function requestSiteHandoff(handoff) {
    const [{ kernel }, session] = await Promise.all([ensureServices(), ensureSession()]);
    const requested = kernel.requestIntervention(
      session.id,
      buildInterventionRequestFromSiteHandoff(handoff),
      {
        timeoutMs: interventionTimeoutMs,
        escalationMs: interventionEscalationMs,
      },
    );
    await persistAndBroadcastInterventions(session.id);
    return requested;
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
    handoff,
    handoffs,
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
    const handoffPolicy = normalizeSiteHandoffPolicy(handoff ?? intervention);
    const handoffPolicies = normalizeSiteHandoffPolicies(handoffs);
    const shouldSettleKernelRun = activateKernelRun(kernel, session.id);
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
          ...(handoffPolicy ? { handoff: handoffPolicy } : {}),
          ...(handoffPolicies.length > 0 ? { handoffs: handoffPolicies } : {}),
        },
      });
    } finally {
      settleKernelRun(kernel, session.id, shouldSettleKernelRun);
    }
    const result = unwrapKernelStepResult(executed, `Site runtime invoke failed for ${skillId}`);

    if (!result.handoff) {
      return result;
    }

    const requested = await requestSiteHandoff(result.handoff);
    const { handoff: _handoff, ...rest } = result;

    return {
      ...rest,
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
    const implicitHandoffs = buildImplicitPageActionHandoffs(request.action);
    const shouldSettleKernelRun = activateKernelRun(kernel, session.id);
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
          ...(implicitHandoffs.length > 0 ? { handoffs: implicitHandoffs } : {}),
        },
      });
    } finally {
      settleKernelRun(kernel, session.id, shouldSettleKernelRun);
    }
    const result = unwrapKernelStepResult(executed, `Page action failed for page.${action}`);

    if (!result.handoff) {
      return result;
    }

    const requested = await requestSiteHandoff(result.handoff);
    const { handoff: _handoff, ...rest } = result;

    return {
      ...rest,
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
        providerOptions: {
          api: "responses",
        },
      };
      const apiMode = normalizeOpenAiApiMode(patch.api);
      defaultProfile.providerOptions = {
        ...(isPlainObject(defaultProfile.providerOptions) ? defaultProfile.providerOptions : {}),
        api: apiMode,
      };
      defaultProfile.llmKey = patch.apiKey;
      if (typeof patch.baseUrl === "string") {
        defaultProfile.llmBase = normalizeLlmBaseForApi(patch.baseUrl, apiMode);
      } else if (!defaultProfile.llmBase) {
        defaultProfile.llmBase = "https://api.openai.com/v1";
      } else {
        defaultProfile.llmBase = normalizeLlmBaseForApi(defaultProfile.llmBase, apiMode);
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
    captureDebugBundle: buildDebugBundle,
    configureDogfoodExternalPageProvider,
    createChatSession,
    deleteChatSession,
    dispatchCapability,
    editUserMessageAndRerun,
    ensureServices,
    ensureSession,
    forkAssistantMessage,
    getConfigBootstrapSummary,
    getInterventionState,
    getKernelRuntimeState,
    getLoopStatus,
    invokePageAction,
    invokeSiteSkill,
    listChatSessions,
    listSkills,
    listInterventions,
    readInterventionAudit,
    readReplayContinuityMarkers,
    refreshChatSessionTitle,
    resolveDogfoodExternalPageRequest,
    requestSiteHandoff,
    resolveIntervention,
    cancelIntervention,
    retryAssistantMessage,
    selectChatSession,
    sendChatPrompt,
    stopChatRun,
    takeDogfoodExternalPageRequest,
    updateChatSessionTitle,
    updateLlmConfig,
  };
}
