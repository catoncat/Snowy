import type {
  AuditTailResource,
  ConfigSummaryResource,
  HostsSummaryResource,
  InterventionRecord,
  ObservabilityReplayResource,
  RuntimeHistoryResource,
  RuntimeSummaryResource,
  SkillsSummaryResource,
} from "@bbl-next/contracts";

import {
  SIDEPANEL_MANAGEMENT_RESOURCE_IDS,
  isSidepanelManagementActionKind,
} from "../sidepanel-management-contract.js";

export {
  SIDEPANEL_MANAGEMENT_ACTION_KINDS,
  SIDEPANEL_MANAGEMENT_RESOURCE_IDS,
  isSidepanelManagementActionKind,
} from "../sidepanel-management-contract.js";

type ManagementResourceDocument =
  | RuntimeSummaryResource
  | RuntimeHistoryResource
  | AuditTailResource
  | ObservabilityReplayResource
  | ConfigSummaryResource
  | SkillsSummaryResource
  | HostsSummaryResource;

type RuntimeSummary = RuntimeSummaryResource["data"];
type SkillsSummary = SkillsSummaryResource["data"];
type SkillSummaryItem = SkillsSummary["items"][number];

type RuntimeDiagnosticsAction = {
  kind: "runtime.capture_diagnostics";
  world?: "main" | "content";
  tabId?: number;
};

type RuntimeClearErrorAction = {
  kind: "runtime.clear_error";
};

type ConfigUpdateAction = {
  kind: "config.update";
  patch: Record<string, unknown>;
};

type InterventionResolveAction = {
  kind: "intervention.resolve";
  interventionId: string;
  resolution?: Record<string, unknown>;
};

type InterventionCancelAction = {
  kind: "intervention.cancel";
  interventionId: string;
  reason?: string;
};

type SkillAction = {
  kind:
    | "skills.install"
    | "skills.enable"
    | "skills.disable"
    | "skills.uninstall"
    | "skills.rollback";
  skillId: string;
  setupPlan?: SkillPackageSetupPlan;
  metadata?: Record<string, unknown>;
  versionUri?: string;
};

type HostAction = {
  kind: "hosts.connect" | "hosts.disconnect" | "hosts.set_default";
  hostId: string;
};

export type ManagementActionMessage =
  | RuntimeDiagnosticsAction
  | RuntimeClearErrorAction
  | ConfigUpdateAction
  | InterventionResolveAction
  | InterventionCancelAction
  | SkillAction
  | HostAction;

export interface ManagementState {
  runtime: RuntimeSummaryResource | null;
  runtimeHistory: RuntimeHistoryResource | null;
  auditTail: AuditTailResource | null;
  observabilityReplay: ObservabilityReplayResource | null;
  config: ConfigSummaryResource | null;
  skills: SkillsSummaryResource | null;
  hosts: HostsSummaryResource | null;
}

export interface SkillCatalogAction {
  name: string;
  title?: string;
  description?: string;
  verifier?: string;
}

export interface SkillCatalogItem {
  skillId: string;
  status: string;
  enabled: boolean;
  trusted: boolean;
  source: SkillSummaryItem["source"];
  packageUri: string | null;
  entry: string | null;
  version: number | null;
  versionSurface: SkillSummaryItem["versionSurface"] | null;
  kind: string | null;
  description: string | null;
  permissions: string[];
  tags: string[];
  matches: string[];
  requiresActiveTab: boolean;
  actions: SkillCatalogAction[];
}

export interface SkillPackageSetupPlan {
  skillId: string;
  phase: "install";
  baseUri: string;
  writes: Array<{ uri: string; content: string }>;
  notes: string[];
}

export interface SkillPackageConventionFile {
  path: string;
  content: string;
}

export interface SkillPackageConventionInput {
  manifest: Record<string, unknown>;
  handlerSource: string;
  skillMarkdown?: string;
  readme?: string;
  files?: SkillPackageConventionFile[];
  notes?: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }
  return value.trim();
}

function normalizePackageRelativePath(value: unknown, message: string): string {
  const trimmed = requireNonEmptyString(value, message);
  if (trimmed.startsWith("mem://") || trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    throw new Error(message);
  }
  if (trimmed.includes("\\")) {
    throw new Error(message);
  }
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(message);
  }
  return segments.join("/");
}

export function createSkillPackageSetupPlan(
  skillIdValue: string,
  input: SkillPackageConventionInput,
): SkillPackageSetupPlan {
  const skillId = requireNonEmptyString(skillIdValue, "skill package requires skillId");
  if (!isPlainObject(input.manifest)) {
    throw new Error("skill package requires manifest");
  }
  const handlerSource = requireNonEmptyString(
    input.handlerSource,
    "skill package requires handlerSource",
  );
  const baseUri = `mem://skills/${skillId}`;
  const manifest: Record<string, unknown> = {
    ...input.manifest,
    id: skillId,
  };
  const entry = normalizePackageRelativePath(manifest.entry ?? "handler.js", "invalid entry path");
  manifest.entry = entry;
  const writes: SkillPackageSetupPlan["writes"] = [
    {
      uri: `${baseUri}/SKILL.md`,
      content:
        typeof input.skillMarkdown === "string" && input.skillMarkdown.length > 0
          ? input.skillMarkdown
          : `# ${skillId}\n`,
    },
    {
      uri: `${baseUri}/skill.json`,
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    },
    {
      uri: `${baseUri}/${entry}`,
      content: handlerSource,
    },
  ];

  if (typeof input.readme === "string" && input.readme.length > 0) {
    writes.push({
      uri: `${baseUri}/README.md`,
      content: input.readme,
    });
  }
  for (const file of input.files ?? []) {
    writes.push({
      uri: `${baseUri}/${normalizePackageRelativePath(file.path, "invalid package file path")}`,
      content: String(file.content ?? ""),
    });
  }

  return {
    skillId,
    phase: "install",
    baseUri,
    writes,
    notes: Array.isArray(input.notes) ? input.notes.map((note) => String(note)) : [],
  };
}

export function createInitialManagementState(): ManagementState {
  return {
    runtime: null,
    runtimeHistory: null,
    auditTail: null,
    observabilityReplay: null,
    config: null,
    skills: null,
    hosts: null,
  };
}

export function createSkillRunPrompt(skillIdValue: string, argsText = ""): string {
  const skillId = requireNonEmptyString(skillIdValue, "skillId 不能为空");
  const args = String(argsText || "").trim();
  return args ? `/skill:${skillId} ${args}` : `/skill:${skillId}`;
}

export function listPendingInterventions(
  runtimeSummary: RuntimeSummary | null | undefined,
): InterventionRecord[] {
  return (runtimeSummary?.interventions.active ?? []).filter(
    (entry) => entry.status === "requested",
  );
}

function formatRuntimeHistoryEntry(entry: RuntimeHistoryResource["data"]["entries"][number]) {
  const status = entry.ok ? "ok" : entry.errorCode || "failed";
  return `step ${entry.stepIndex} · ${entry.capabilityId} · ${status} · ${entry.durationMs}ms`;
}

function readEntrySubject(entry: Record<string, unknown>): string {
  for (const field of ["capabilityId", "hostId", "skillId", "interventionId"]) {
    const value = entry[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function formatAuditTailEntry(entry: AuditTailResource["data"]["entries"][number]) {
  const record = entry as unknown as Record<string, unknown>;
  const subject = readEntrySubject(record);
  const durationMs = typeof record.durationMs === "number" ? `${record.durationMs}ms` : "";
  return [entry.kind, entry.status, subject, durationMs].filter(Boolean).join(" · ");
}

function formatReplayEntry(entry: ObservabilityReplayResource["data"]["entries"][number]) {
  return [`${entry.subsystem}:${entry.eventType}`, entry.status, entry.summary]
    .filter(Boolean)
    .join(" · ");
}

export function listRuntimeDebugTimeline(state: ManagementState, limit = 8): string[] {
  return [
    ...(state.runtimeHistory?.data.entries ?? []).map((entry) => formatRuntimeHistoryEntry(entry)),
    ...(state.auditTail?.data.entries ?? []).map((entry) => formatAuditTailEntry(entry)),
    ...(state.observabilityReplay?.data.entries ?? []).map((entry) => formatReplayEntry(entry)),
  ].slice(-limit);
}

export function listRuntimeAuditRows(state: ManagementState, limit = 8): string[] {
  return [
    ...(state.auditTail?.data.entries ?? []).map((entry) => formatAuditTailEntry(entry)),
    ...(state.observabilityReplay?.data.entries ?? []).map((entry) => formatReplayEntry(entry)),
  ].slice(-limit);
}

function projectSkillCatalogAction(
  action: SkillSummaryItem["actions"][number],
): SkillCatalogAction {
  return {
    name: action.name,
    ...(action.title ? { title: action.title } : {}),
    ...(action.description ? { description: action.description } : {}),
    ...(action.verifier ? { verifier: action.verifier } : {}),
  };
}

export function listSkillCatalogItems(
  skillsSummary: SkillsSummary | null | undefined,
): SkillCatalogItem[] {
  return (skillsSummary?.items ?? []).map((item) => ({
    skillId: item.skillId,
    status: item.status,
    enabled: item.enabled,
    trusted: item.trusted,
    source: item.source,
    packageUri: item.packageUri ?? null,
    entry: item.entry ?? null,
    version: item.version,
    versionSurface: item.versionSurface ?? null,
    kind: item.kind,
    description: item.description,
    permissions: [...item.permissions],
    tags: [...item.tags],
    matches: [...item.matches],
    requiresActiveTab: item.requiresActiveTab,
    actions: item.actions.map((action) => projectSkillCatalogAction(action)),
  }));
}

export function buildManagementBootstrapRequests(world: "main" | "content" = "main") {
  return SIDEPANEL_MANAGEMENT_RESOURCE_IDS.map((resourceId) => ({
    kind: "resource.read" as const,
    resourceId,
    world,
  }));
}

export function applyManagementResourceDocument(
  state: ManagementState,
  resource: ManagementResourceDocument,
): ManagementState {
  switch (resource.id) {
    case "runtime.summary":
      return { ...state, runtime: resource };
    case "runtime.history":
      return { ...state, runtimeHistory: resource };
    case "audit.tail":
      return { ...state, auditTail: resource };
    case "observability.replay":
      return { ...state, observabilityReplay: resource };
    case "config.summary":
      return { ...state, config: resource };
    case "skills.summary":
      return { ...state, skills: resource };
    case "hosts.summary":
      return { ...state, hosts: resource };
    default:
      return state;
  }
}

export function createManagementActionMessage(
  kind: string,
  payload: Record<string, unknown> = {},
): ManagementActionMessage {
  if (!isSidepanelManagementActionKind(kind)) {
    throw new Error(`Unsupported management action: ${kind}`);
  }

  switch (kind) {
    case "runtime.capture_diagnostics":
      return {
        kind,
        ...(payload.world === "content"
          ? { world: "content" as const }
          : { world: "main" as const }),
        ...(typeof payload.tabId === "number" ? { tabId: payload.tabId } : {}),
      };
    case "runtime.clear_error":
      return { kind };
    case "config.update": {
      const patch = isPlainObject(payload.patch) ? payload.patch : {};
      return {
        kind,
        patch,
      };
    }
    case "intervention.resolve":
      return {
        kind,
        interventionId: requireNonEmptyString(
          payload.interventionId ?? payload.id,
          `${kind} requires interventionId`,
        ),
        ...(isPlainObject(payload.resolution) ? { resolution: payload.resolution } : {}),
      };
    case "intervention.cancel":
      return {
        kind,
        interventionId: requireNonEmptyString(
          payload.interventionId ?? payload.id,
          `${kind} requires interventionId`,
        ),
        ...(typeof payload.reason === "string" && payload.reason.trim()
          ? { reason: payload.reason.trim() }
          : {}),
      };
    case "skills.install":
    case "skills.enable":
    case "skills.disable":
    case "skills.uninstall":
    case "skills.rollback":
      return {
        kind,
        skillId: requireNonEmptyString(payload.skillId, `${kind} requires skillId`),
        ...(kind === "skills.install" && isPlainObject(payload.setupPlan)
          ? { setupPlan: payload.setupPlan as unknown as SkillPackageSetupPlan }
          : {}),
        ...(kind === "skills.install" && isPlainObject(payload.metadata)
          ? { metadata: payload.metadata }
          : {}),
        ...(kind === "skills.rollback" &&
        typeof payload.versionUri === "string" &&
        payload.versionUri.trim()
          ? { versionUri: payload.versionUri.trim() }
          : {}),
      };
    case "hosts.connect":
    case "hosts.disconnect":
    case "hosts.set_default":
      return {
        kind,
        hostId: requireNonEmptyString(payload.hostId, `${kind} requires hostId`),
      };
    default:
      throw new Error(`Unsupported management action: ${kind}`);
  }
}
