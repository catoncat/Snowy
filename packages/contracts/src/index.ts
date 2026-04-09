export type JsonSchema = Record<string, unknown>;

export const AI_SURFACE_PRIMITIVES = ["action", "resource", "workflow"] as const;
export type AiSurfacePrimitive = (typeof AI_SURFACE_PRIMITIVES)[number];

export const BOOTSTRAP_RESOURCE_KEYS = ["runtime", "config", "skills", "hosts"] as const;
export type BootstrapResourceKey = (typeof BOOTSTRAP_RESOURCE_KEYS)[number];
export const AI_SURFACE_RESOURCE_IDS = [
  "runtime.summary",
  "config.summary",
  "skills.summary",
  "hosts.summary",
  "audit.tail",
  "audit.intervention",
] as const;
export type AiSurfaceResourceId = (typeof AI_SURFACE_RESOURCE_IDS)[number];
export const AI_SURFACE_RESOURCE_AUDIENCES = ["chat", "skill", "system", "mcp"] as const;
export type AiSurfaceResourceAudience = (typeof AI_SURFACE_RESOURCE_AUDIENCES)[number];
export const AI_SURFACE_RESOURCE_PROJECTIONS = ["resource.read", "runtime.bootstrap"] as const;
export type AiSurfaceResourceProjection = (typeof AI_SURFACE_RESOURCE_PROJECTIONS)[number];
export const AI_SURFACE_RESOURCE_READ_OWNERS = [
  "runtime",
  "config",
  "skills",
  "hosts",
  "audit",
] as const;
export type AiSurfaceResourceReadOwner = (typeof AI_SURFACE_RESOURCE_READ_OWNERS)[number];
export interface AiSurfaceResourceMetadata<
  ResourceId extends AiSurfaceResourceId = AiSurfaceResourceId,
> {
  id: ResourceId;
  readOwner: AiSurfaceResourceReadOwner;
  audiences: readonly AiSurfaceResourceAudience[];
  projections: readonly AiSurfaceResourceProjection[];
  bootstrapKey?: BootstrapResourceKey;
}
const ALL_AI_SURFACE_RESOURCE_AUDIENCES = [...AI_SURFACE_RESOURCE_AUDIENCES] as const;
export const AI_SURFACE_RESOURCE_METADATA_REGISTRY = [
  {
    id: "runtime.summary",
    readOwner: "runtime",
    audiences: ALL_AI_SURFACE_RESOURCE_AUDIENCES,
    projections: ["resource.read", "runtime.bootstrap"],
    bootstrapKey: "runtime",
  },
  {
    id: "config.summary",
    readOwner: "config",
    audiences: ALL_AI_SURFACE_RESOURCE_AUDIENCES,
    projections: ["resource.read", "runtime.bootstrap"],
    bootstrapKey: "config",
  },
  {
    id: "skills.summary",
    readOwner: "skills",
    audiences: ALL_AI_SURFACE_RESOURCE_AUDIENCES,
    projections: ["resource.read", "runtime.bootstrap"],
    bootstrapKey: "skills",
  },
  {
    id: "hosts.summary",
    readOwner: "hosts",
    audiences: ALL_AI_SURFACE_RESOURCE_AUDIENCES,
    projections: ["resource.read", "runtime.bootstrap"],
    bootstrapKey: "hosts",
  },
  {
    id: "audit.tail",
    readOwner: "audit",
    audiences: ALL_AI_SURFACE_RESOURCE_AUDIENCES,
    projections: ["resource.read"],
  },
  {
    id: "audit.intervention",
    readOwner: "audit",
    audiences: ALL_AI_SURFACE_RESOURCE_AUDIENCES,
    projections: ["resource.read"],
  },
] as const satisfies readonly AiSurfaceResourceMetadata[];
const AI_SURFACE_RESOURCE_METADATA_BY_ID = AI_SURFACE_RESOURCE_METADATA_REGISTRY.reduce(
  (acc, entry) => {
    acc[entry.id] = entry;
    return acc;
  },
  {} as Record<AiSurfaceResourceId, AiSurfaceResourceMetadata>,
);
export function getAiSurfaceResourceMetadata<ResourceId extends AiSurfaceResourceId>(
  resourceId: ResourceId,
): Extract<(typeof AI_SURFACE_RESOURCE_METADATA_REGISTRY)[number], { id: ResourceId }> {
  return AI_SURFACE_RESOURCE_METADATA_BY_ID[resourceId] as Extract<
    (typeof AI_SURFACE_RESOURCE_METADATA_REGISTRY)[number],
    { id: ResourceId }
  >;
}
export function listAiSurfaceResourcesForAudience(
  audience: AiSurfaceResourceAudience,
): AiSurfaceResourceMetadata[] {
  return AI_SURFACE_RESOURCE_METADATA_REGISTRY.filter((entry) =>
    entry.audiences.includes(audience),
  );
}
export const CONFIG_RESOURCE_FIELDS = [
  "model",
  "automation",
  "permissions",
  "preferences",
] as const;
export type ConfigResourceField = (typeof CONFIG_RESOURCE_FIELDS)[number];
export const CONFIG_CONTROL_PLANE_ACTIONS = ["config.update"] as const;
export type ConfigControlPlaneAction = (typeof CONFIG_CONTROL_PLANE_ACTIONS)[number];
export const SKILL_CONTROL_PLANE_ACTIONS = [
  "skills.install",
  "skills.enable",
  "skills.disable",
  "skills.uninstall",
] as const;
export type SkillControlPlaneAction = (typeof SKILL_CONTROL_PLANE_ACTIONS)[number];
export const HOST_SUBSTRATE_ACTIONS = [
  "host.read",
  "host.write",
  "host.edit",
  "host.exec",
] as const;
export type HostSubstrateAction = (typeof HOST_SUBSTRATE_ACTIONS)[number];
export const HOST_CONTROL_PLANE_ACTIONS = [
  "hosts.list",
  "hosts.get",
  "hosts.connect",
  "hosts.disconnect",
  "hosts.set_default",
  "hosts.health",
] as const;
export type HostControlPlaneAction = (typeof HOST_CONTROL_PLANE_ACTIONS)[number];
export const RUNTIME_CONTROL_PLANE_ACTIONS = [
  "runtime.list_capabilities",
  "runtime.get_capability",
  "runtime.capture_diagnostics",
  "runtime.clear_error",
] as const;
export type RuntimeControlPlaneAction = (typeof RUNTIME_CONTROL_PLANE_ACTIONS)[number];
export type ExecutionHostKind = "local" | "remote";
export type ExecutionHostState = "connected" | "disconnected" | "degraded";
export type ExecutionHostHealthStatus = "healthy" | "degraded" | "unknown";

export interface ExecutionHostRecord {
  hostId: string;
  kind: ExecutionHostKind;
  connected: boolean;
  state: ExecutionHostState;
  isDefault: boolean;
  health: {
    status: ExecutionHostHealthStatus;
    checkedAt?: string;
  };
}

export interface HostControlPlaneSnapshot {
  defaultHostId: string | null;
  hosts: ExecutionHostRecord[];
}

export const HOST_AUDIT_KINDS = ["hosts.connect", "hosts.disconnect", "hosts.set_default"] as const;
export type HostAuditKind = (typeof HOST_AUDIT_KINDS)[number];

export const HOST_AUDIT_STATUSES = ["connected", "disconnected", "default_set", "failed"] as const;
export type HostAuditStatus = (typeof HOST_AUDIT_STATUSES)[number];

export const CONFIG_AUDIT_KINDS = [...CONFIG_CONTROL_PLANE_ACTIONS] as const;
export type ConfigAuditKind = (typeof CONFIG_AUDIT_KINDS)[number];

export const CONFIG_AUDIT_STATUSES = ["updated"] as const;
export type ConfigAuditStatus = (typeof CONFIG_AUDIT_STATUSES)[number];

export const SKILL_AUDIT_KINDS = [...SKILL_CONTROL_PLANE_ACTIONS] as const;
export type SkillAuditKind = (typeof SKILL_AUDIT_KINDS)[number];

export const SKILL_AUDIT_STATUSES = ["installed", "enabled", "disabled", "archived"] as const;
export type SkillAuditStatus = (typeof SKILL_AUDIT_STATUSES)[number];

export const LOOP_AUDIT_KINDS = ["loop.step"] as const;
export type LoopAuditKind = (typeof LOOP_AUDIT_KINDS)[number];

export const LOOP_AUDIT_STATUSES = ["executed", "failed"] as const;
export type LoopAuditStatus = (typeof LOOP_AUDIT_STATUSES)[number];

export const CONTROL_PLANE_AUDIT_KINDS = [
  ...HOST_AUDIT_KINDS,
  ...CONFIG_AUDIT_KINDS,
  ...SKILL_AUDIT_KINDS,
  ...LOOP_AUDIT_KINDS,
] as const;
export type ControlPlaneAuditKind = (typeof CONTROL_PLANE_AUDIT_KINDS)[number];

export const CONTROL_PLANE_AUDIT_STATUSES = [
  ...HOST_AUDIT_STATUSES,
  ...CONFIG_AUDIT_STATUSES,
  ...SKILL_AUDIT_STATUSES,
  ...LOOP_AUDIT_STATUSES,
] as const;
export type ControlPlaneAuditStatus = (typeof CONTROL_PLANE_AUDIT_STATUSES)[number];

interface ControlPlaneAuditEntryBase {
  timestamp: string;
  sessionId: string | null;
  error?: string;
}

export interface HostAuditEntry extends ControlPlaneAuditEntryBase {
  kind: HostAuditKind;
  hostId: string;
  status: HostAuditStatus;
}

export interface ConfigAuditEntry extends ControlPlaneAuditEntryBase {
  kind: ConfigAuditKind;
  status: ConfigAuditStatus;
  changedFields: ConfigResourceField[];
}

export interface SkillAuditEntry extends ControlPlaneAuditEntryBase {
  kind: SkillAuditKind;
  skillId: string;
  status: SkillAuditStatus;
  trusted?: boolean;
}

export interface LoopStepAuditEntry extends ControlPlaneAuditEntryBase {
  kind: LoopAuditKind;
  capabilityId: string;
  status: LoopAuditStatus;
  durationMs: number;
}

export type ControlPlaneAuditEntry =
  | HostAuditEntry
  | ConfigAuditEntry
  | SkillAuditEntry
  | LoopStepAuditEntry;

export const INTERVENTION_KINDS = ["confirm", "takeover", "input"] as const;
export type InterventionKind = (typeof INTERVENTION_KINDS)[number];

export const INTERVENTION_TRIGGERS = [
  "confirm_policy",
  "verify_failed",
  "runtime_blocked",
] as const;
export type InterventionTrigger = (typeof INTERVENTION_TRIGGERS)[number];

export interface InterventionRequest {
  id: string;
  kind: InterventionKind;
  trigger: InterventionTrigger;
  status: "requested";
  title: string;
  message: string;
  skillId?: string;
  action?: string;
  sessionId?: string | null;
  tabId?: number | null;
  payload?: Record<string, unknown>;
}

export type InterventionLifecycleStatus =
  | InterventionRequest["status"]
  | "resolved"
  | "cancelled"
  | "timed_out";

export interface InterventionRecord extends Omit<InterventionRequest, "status"> {
  status: InterventionLifecycleStatus;
  sessionId: string | null;
  requestedAt: string;
  updatedAt: string;
  expiresAt: string | null;
  resolution?: Record<string, unknown>;
}

export interface InterventionAuditEntry {
  eventId: string;
  interventionId: string;
  sessionId: string | null;
  status: InterventionLifecycleStatus;
  timestamp: string;
  kind: InterventionRecord["kind"];
  trigger: InterventionRecord["trigger"];
  details?: Record<string, unknown>;
}

export interface InterventionSummary {
  status: "empty" | "requested" | "settled";
  totalCount: number;
  activeCount: number;
  recentCount: number;
  active: InterventionRecord[];
  recent: InterventionRecord[];
}

export interface InterventionAuditSummary {
  status: "available" | "empty";
  totalCount: number;
  entries: InterventionAuditEntry[];
}

export type BootstrapSummaryStatus = "healthy" | "degraded" | "empty";
export type ConfigSummaryStatus = "ready" | "placeholder";

export interface BootstrapActiveTabSummary {
  tabId: number;
  url: string;
  title?: string;
  world?: "content" | "main";
}

export interface RuntimeBootstrapSummary {
  status: BootstrapSummaryStatus;
  mode: "active-tab-only";
  sessionId: string | null;
  activeTab: BootstrapActiveTabSummary | null;
  loopState: string | null;
  lastError: {
    code: string;
    message: string;
  } | null;
  interventions: InterventionSummary;
  actionCapabilities: {
    total: number;
    namespaces: string[];
  };
}

export interface SkillsBootstrapSummary {
  status: "healthy" | "empty";
  installedCount: number;
  enabledCount: number;
  trustedCount: number;
  recentChange: string | null;
}

export interface HostBootstrapSummaryItem {
  hostId: string;
  kind: ExecutionHostKind;
  connected: boolean;
  state: ExecutionHostState;
  isDefault: boolean;
}

export interface HostsBootstrapSummary {
  status: BootstrapSummaryStatus;
  defaultHostId: string | null;
  totalCount: number;
  connectedCount: number;
  items: HostBootstrapSummaryItem[];
}

export interface ConfigBootstrapSummary {
  status: ConfigSummaryStatus;
  fields: ConfigResourceField[];
  values: Partial<Record<ConfigResourceField, Record<string, unknown>>>;
  note: string | null;
  updatedAt: string | null;
}

export interface BootstrapSummary {
  status: BootstrapSummaryStatus;
  generatedAt: string;
  runtime: RuntimeBootstrapSummary;
  skills: SkillsBootstrapSummary;
  hosts: HostsBootstrapSummary;
  config: ConfigBootstrapSummary;
}

export interface AuditTailSummary {
  status: "available" | "empty";
  totalCount: number;
  entries: ControlPlaneAuditEntry[];
}

export interface KernelDiagnosticsSessionSnapshot {
  id: string;
  createdAt: string;
  title: string | null;
  model: string | null;
}

export interface KernelDiagnosticsRunSnapshot {
  phase: RunPhase;
  queuedPrompts: {
    steer: number;
    followUp: number;
  };
  retry: RunState["retry"];
}

export interface KernelDiagnosticsLoopSnapshot {
  stepCount: number;
  noProgress: NoProgressReason | null;
  maxSteps: number;
}

export type KernelDiagnosticsProviderHealthStatus = "healthy" | "degraded" | "down";

export type KernelDiagnosticsProviderRoute =
  | {
      status: "empty";
      profile: null;
      provider: null;
      llmModel: null;
      orderedProfiles: [];
    }
  | {
      status: "configured";
      profile: string;
      provider: string;
      llmModel: string;
      orderedProfiles: string[];
    }
  | {
      status: "unavailable";
      profile: string;
      provider: string | null;
      llmModel: string | null;
      orderedProfiles: string[];
      reason: "profile_not_found" | "missing_llm_config" | "route_unavailable";
      message: string;
    };

export interface KernelDiagnosticsProviderRegistryEntry {
  id: string;
  healthStatus: KernelDiagnosticsProviderHealthStatus;
  capabilities: string[];
}

export interface KernelDiagnosticsProviderSnapshot {
  route: KernelDiagnosticsProviderRoute;
  registered: KernelDiagnosticsProviderRegistryEntry[];
}

export interface KernelDiagnosticsSnapshot {
  session: KernelDiagnosticsSessionSnapshot | null;
  run: KernelDiagnosticsRunSnapshot | null;
  loop: KernelDiagnosticsLoopSnapshot;
  interventions: InterventionSummary;
  provider: KernelDiagnosticsProviderSnapshot;
}

export interface RuntimeDiagnosticsEdgeError {
  code: string;
  message: string;
  details?: unknown;
}

export interface RuntimeDiagnosticsBridgeState {
  hostReady: boolean;
  hostLastSeenAt?: string;
  hostRecoveredAt?: string;
  hostRecoveryReason?: string;
  offscreenPresent: boolean;
  offscreenPath: string;
}

export interface RuntimeDiagnosticsRunnerState {
  reachable: boolean;
  ready?: boolean;
  health?: Record<string, unknown> | null;
  error?: RuntimeDiagnosticsEdgeError;
}

export interface RuntimeDiagnosticsSiteState {
  status: "healthy" | "degraded" | "empty" | "unavailable" | "skipped";
  tabId?: number;
  world?: "content" | "main";
  snapshot?: Record<string, unknown> | null;
  error?: RuntimeDiagnosticsEdgeError;
}

export interface RuntimeDiagnosticsErrorSummary {
  status: "active" | "cleared" | "recent" | "empty";
  lastError: {
    code: string;
    message: string;
    capturedAt: string;
  } | null;
  clearedAt: string | null;
  recentAudit: AuditTailSummary;
}

export interface RuntimeDiagnosticsPayload {
  capturedAt: string;
  status: "healthy" | "degraded";
  kernel: KernelDiagnosticsSnapshot;
  bridge: RuntimeDiagnosticsBridgeState;
  runner: RuntimeDiagnosticsRunnerState;
  site: RuntimeDiagnosticsSiteState;
  debug: {
    error: RuntimeDiagnosticsErrorSummary;
  };
}

export interface ResourceDocument<ResourceId extends AiSurfaceResourceId, Payload> {
  id: ResourceId;
  primitive: "resource";
  generatedAt: string;
  data: Payload;
}

export type RuntimeSummaryResource = ResourceDocument<"runtime.summary", RuntimeBootstrapSummary>;
export type ConfigSummaryResource = ResourceDocument<"config.summary", ConfigBootstrapSummary>;
export type SkillsSummaryResource = ResourceDocument<"skills.summary", SkillsBootstrapSummary>;
export type HostsSummaryResource = ResourceDocument<"hosts.summary", HostsBootstrapSummary>;
export type AuditTailResource = ResourceDocument<"audit.tail", AuditTailSummary>;
export type InterventionAuditResource = ResourceDocument<
  "audit.intervention",
  InterventionAuditSummary
>;
export type AiSurfaceResourceDocument =
  | RuntimeSummaryResource
  | ConfigSummaryResource
  | SkillsSummaryResource
  | HostsSummaryResource
  | AuditTailResource
  | InterventionAuditResource;

export interface BootstrapResourceBundle {
  runtime?: RuntimeBootstrapSummary;
  config?: ConfigBootstrapSummary;
  skills?: SkillsBootstrapSummary;
  hosts?: HostsBootstrapSummary;
}

export type CapabilityRisk = "low" | "medium" | "high";
export type CapabilitySideEffects = "none" | "reads" | "writes" | "external";
export type SkillStatus = "draft" | "staged" | "installed" | "enabled" | "disabled" | "archived";

export type CapabilityErrorCode =
  | "E_BAD_INPUT"
  | "E_CAPABILITY_NOT_FOUND"
  | "E_INTERVENTION_REQUIRED"
  | "E_PERMISSION_DENIED"
  | "E_REENTRANCY_BLOCKED"
  | "E_RUNTIME"
  | "E_TIMEOUT"
  | "E_VERIFY_FAILED"
  | "E_VFS_QUOTA_EXCEEDED";

export interface ExecutionBinding {
  family: string;
  operation: string;
  adapter?: string;
  options?: Record<string, unknown>;
}

// CapabilityDescriptor is the canonical model for invokable actions only.
export interface CapabilityDescriptor {
  id: string;
  version: number;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  risk: CapabilityRisk;
  sideEffects: CapabilitySideEffects;
  permissions: string[];
  supportsVerify: boolean;
  supportsStreaming: boolean;
  exportable: boolean;
  exportName?: string;
  exportRisk?: CapabilityRisk;
  executionBinding: ExecutionBinding;
}

// ToolContract is a northbound projection of an action capability, not a full AI surface model.
export interface ToolContract {
  name: string;
  capabilityId: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  annotations: {
    risk: CapabilityRisk;
    sideEffects: CapabilitySideEffects;
    supportsVerify: boolean;
    supportsStreaming: boolean;
  };
}

export interface AiSurfaceBoundary {
  actions: {
    primitive: "action";
    descriptorModel: "CapabilityDescriptor";
    toolProjection: "ToolContract";
  };
  bootstrapResources: readonly BootstrapResourceKey[];
  workflows: {
    primitive: "workflow";
    packaging: "skill-package";
    invocation: "skills.invoke";
  };
}

export const AI_SURFACE_BOUNDARY: AiSurfaceBoundary = {
  actions: {
    primitive: "action",
    descriptorModel: "CapabilityDescriptor",
    toolProjection: "ToolContract",
  },
  bootstrapResources: BOOTSTRAP_RESOURCE_KEYS,
  workflows: {
    primitive: "workflow",
    packaging: "skill-package",
    invocation: "skills.invoke",
  },
};

export interface CapabilityExportHandoff {
  capabilityId: string;
  exportName: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  risk: CapabilityRisk;
  permissions: string[];
  annotations: {
    sideEffects: CapabilitySideEffects;
    supportsVerify: boolean;
    supportsStreaming: boolean;
  };
}

export interface SkillLifecycleState {
  status: SkillStatus;
  trusted: boolean;
}

export type SkillLifecycleActor = "agent" | "user" | "system";

export type SkillRollbackTrigger = "verifier_failed_with_confirmation" | "release_gate_failed";

export interface SkillVersionRef {
  versionId: string;
  uri: string;
  createdAt?: string;
  trusted: boolean;
}

export interface SkillVersionPolicy {
  snapshotRootUri: string;
  versionFormat: "iso-timestamp";
  retention: number;
  rollbackTarget: "latest_trusted";
  rollbackTriggers: readonly SkillRollbackTrigger[];
}

export interface SkillLifecycleVersionSurface {
  skillId: string;
  lifecycle: SkillLifecycleState;
  activeVersion: SkillVersionRef | null;
  rollbackTarget: SkillVersionRef | null;
  policy: SkillVersionPolicy;
}

export interface CapabilityTraceEntry {
  traceId?: string;
  parentTraceId?: string;
  childTraceId?: string;
  capabilityId: string;
  startedAt: string;
  endedAt?: string;
  status: "started" | "succeeded" | "failed";
  input: unknown;
  output?: unknown;
  errorCode?: CapabilityErrorCode;
}

export const MAX_SKILL_CALL_DEPTH = 3;

export const DEFAULT_SKILL_VERSION_RETENTION = 3;

export const DEFAULT_SKILL_ROLLBACK_TRIGGERS: readonly SkillRollbackTrigger[] = [
  "verifier_failed_with_confirmation",
  "release_gate_failed",
];

export const PUBLIC_CAPABILITY_NAMESPACES = [
  "config",
  "memfs",
  "page",
  "site",
  "tabs",
  "runner",
  "skills",
  "runtime",
  "host",
  "hosts",
] as const;

export type CapabilityNamespace = (typeof PUBLIC_CAPABILITY_NAMESPACES)[number];

const CAPABILITY_NAMESPACE_SET = new Set<string>(PUBLIC_CAPABILITY_NAMESPACES);

const CAPABILITY_ID_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

const SKILL_STATUS_TRANSITIONS: Record<SkillStatus, SkillStatus[]> = {
  draft: ["staged", "archived"],
  staged: ["installed", "archived"],
  installed: ["enabled", "archived"],
  enabled: ["disabled", "archived"],
  disabled: ["enabled", "archived"],
  archived: [],
};

const SKILL_TRANSITION_ACTORS: Record<
  SkillStatus,
  Partial<Record<SkillStatus, readonly SkillLifecycleActor[]>>
> = {
  draft: {
    staged: ["agent"],
    archived: ["user", "system"],
  },
  staged: {
    installed: ["agent"],
    archived: ["user", "system"],
  },
  installed: {
    enabled: ["user", "system"],
    archived: ["user", "system"],
  },
  enabled: {
    disabled: ["user", "system"],
    archived: ["user", "system"],
  },
  disabled: {
    enabled: ["user", "system"],
    archived: ["user", "system"],
  },
  archived: {},
};

export class CapabilityError extends Error {
  readonly code: CapabilityErrorCode;
  readonly details?: unknown;

  constructor(code: CapabilityErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CapabilityError";
    this.code = code;
    this.details = details;
  }
}

export function capabilityNamespace(capabilityId: string): string {
  return capabilityId.split(".")[0];
}

function assertNonEmptyIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new CapabilityError("E_BAD_INPUT", `${label} must be a non-empty string`);
  }
  if (normalized.includes("/")) {
    throw new CapabilityError("E_BAD_INPUT", `${label} must not contain '/': ${value}`);
  }
  return normalized;
}

export function isPublicCapabilityNamespace(namespace: string): boolean {
  return CAPABILITY_NAMESPACE_SET.has(namespace);
}

function assertJsonSchemaHasType(schema: JsonSchema, label: string): void {
  if (!schema.type && !schema.$ref && !schema.oneOf && !schema.anyOf && !schema.allOf) {
    throw new CapabilityError("E_BAD_INPUT", `${label} must declare a type, $ref, or combinator`);
  }
}

export function assertCapabilityDescriptor(value: CapabilityDescriptor): CapabilityDescriptor {
  if (!CAPABILITY_ID_RE.test(value.id)) {
    throw new CapabilityError("E_BAD_INPUT", `Invalid capability id: ${value.id}`);
  }
  if (!Number.isInteger(value.version) || value.version < 1) {
    throw new CapabilityError("E_BAD_INPUT", "Descriptor version must be >= 1");
  }
  if (!value.description.trim()) {
    throw new CapabilityError("E_BAD_INPUT", "Descriptor description is required");
  }
  if (!value.executionBinding.family.trim() || !value.executionBinding.operation.trim()) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "Descriptor executionBinding family and operation are required",
    );
  }
  assertJsonSchemaHasType(value.inputSchema, "inputSchema");
  assertJsonSchemaHasType(value.outputSchema, "outputSchema");
  return value;
}

export function capabilityIdToToolName(capabilityId: string): string {
  return capabilityId.replace(/\./g, "_");
}

export function descriptorToToolContract(descriptor: CapabilityDescriptor): ToolContract {
  assertCapabilityDescriptor(descriptor);
  return {
    name: capabilityIdToToolName(descriptor.id),
    capabilityId: descriptor.id,
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
    outputSchema: descriptor.outputSchema,
    annotations: {
      risk: descriptor.risk,
      sideEffects: descriptor.sideEffects,
      supportsVerify: descriptor.supportsVerify,
      supportsStreaming: descriptor.supportsStreaming,
    },
  };
}

export function descriptorToCapabilityExportHandoff(
  descriptor: CapabilityDescriptor,
): CapabilityExportHandoff | null {
  assertCapabilityDescriptor(descriptor);
  if (!descriptor.exportable) {
    return null;
  }
  return {
    capabilityId: descriptor.id,
    exportName: descriptor.exportName?.trim() || descriptor.id,
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
    outputSchema: descriptor.outputSchema,
    risk: descriptor.exportRisk ?? descriptor.risk,
    permissions: [...descriptor.permissions],
    annotations: {
      sideEffects: descriptor.sideEffects,
      supportsVerify: descriptor.supportsVerify,
      supportsStreaming: descriptor.supportsStreaming,
    },
  };
}

export function descriptorsToCapabilityExportHandoffs(
  descriptors: CapabilityDescriptor[],
): CapabilityExportHandoff[] {
  return descriptors.flatMap((descriptor) => {
    const handoff = descriptorToCapabilityExportHandoff(descriptor);
    return handoff ? [handoff] : [];
  });
}

export function canTransitionSkillState(from: SkillStatus, to: SkillStatus): boolean {
  return SKILL_STATUS_TRANSITIONS[from].includes(to);
}

export function allowedActorsForSkillTransition(
  from: SkillStatus,
  to: SkillStatus,
): SkillLifecycleActor[] {
  return [...(SKILL_TRANSITION_ACTORS[from][to] ?? [])];
}

export function canActorTransitionSkillState(
  actor: SkillLifecycleActor,
  from: SkillStatus,
  to: SkillStatus,
): boolean {
  return allowedActorsForSkillTransition(from, to).includes(actor);
}

export function canActorGrantSkillTrusted(actor: SkillLifecycleActor): boolean {
  return actor === "user";
}

export function skillVersionRootUri(skillId: string): string {
  return `mem://skills/${assertNonEmptyIdentifier(skillId, "skillId")}/@versions`;
}

export function skillVersionUri(skillId: string, versionId: string): string {
  return `${skillVersionRootUri(skillId)}/${assertNonEmptyIdentifier(versionId, "versionId")}`;
}

function compareSkillVersionRefs(left: SkillVersionRef, right: SkillVersionRef): number {
  const leftOrder = left.createdAt ?? left.versionId;
  const rightOrder = right.createdAt ?? right.versionId;
  return rightOrder.localeCompare(leftOrder) || right.versionId.localeCompare(left.versionId);
}

export function selectLatestTrustedSkillVersion(
  versions: SkillVersionRef[],
): SkillVersionRef | null {
  const trusted = versions.filter((version) => version.trusted);
  if (trusted.length === 0) {
    return null;
  }
  return [...trusted].sort(compareSkillVersionRefs)[0] ?? null;
}

export function createSkillVersionPolicy(
  skillId: string,
  overrides: Partial<SkillVersionPolicy> = {},
): SkillVersionPolicy {
  return {
    snapshotRootUri: overrides.snapshotRootUri ?? skillVersionRootUri(skillId),
    versionFormat: overrides.versionFormat ?? "iso-timestamp",
    retention: overrides.retention ?? DEFAULT_SKILL_VERSION_RETENTION,
    rollbackTarget: overrides.rollbackTarget ?? "latest_trusted",
    rollbackTriggers: [...(overrides.rollbackTriggers ?? DEFAULT_SKILL_ROLLBACK_TRIGGERS)],
  };
}

export function createSkillLifecycleVersionSurface({
  skillId,
  lifecycle,
  activeVersion = null,
  versions = [],
  policy,
}: {
  skillId: string;
  lifecycle: SkillLifecycleState;
  activeVersion?: SkillVersionRef | null;
  versions?: SkillVersionRef[];
  policy?: Partial<SkillVersionPolicy>;
}): SkillLifecycleVersionSurface {
  const resolvedPolicy = createSkillVersionPolicy(skillId, policy);
  return {
    skillId,
    lifecycle,
    activeVersion,
    rollbackTarget:
      resolvedPolicy.rollbackTarget === "latest_trusted"
        ? selectLatestTrustedSkillVersion(versions)
        : null,
    policy: resolvedPolicy,
  };
}

export function transitionSkillState(
  current: SkillLifecycleState,
  nextStatus: SkillStatus,
): SkillLifecycleState {
  if (!canTransitionSkillState(current.status, nextStatus)) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      `Illegal skill transition: ${current.status} -> ${nextStatus}`,
    );
  }
  return {
    status: nextStatus,
    trusted: nextStatus === "enabled" ? current.trusted : false,
  };
}

export function grantSkillTrusted(current: SkillLifecycleState): SkillLifecycleState {
  if (current.status !== "enabled") {
    throw new CapabilityError("E_BAD_INPUT", "Trusted flag can only be granted while enabled");
  }
  return {
    ...current,
    trusted: true,
  };
}

export function revokeSkillTrusted(current: SkillLifecycleState): SkillLifecycleState {
  return {
    ...current,
    trusted: false,
  };
}

// ──────────────────────────────────────────────────────────
// Session Model
// ──────────────────────────────────────────────────────────

export const SESSION_ENTRY_TYPES = [
  "message",
  "compaction",
  "thinking_level_change",
  "model_change",
  "label",
  "session_info",
] as const;
export type SessionEntryType = (typeof SESSION_ENTRY_TYPES)[number];

export interface SessionHeader {
  id: string;
  parentSessionId?: string;
  createdAt: string;
  title?: string;
  model?: string;
}

export interface SessionEntry {
  entryId: string;
  parentId?: string;
  type: SessionEntryType;
  timestamp: string;
  payload: unknown;
}

export interface MessagePayload {
  role: "user" | "assistant" | "system";
  text: string;
  toolName?: string;
  toolCallId?: string;
  contentBlocks?: LlmAssistantContentBlock[];
}

export interface CompactionPayload {
  reason: CompactionReason;
  summary: string;
  firstKeptEntryId: string;
  previousSummary?: string;
  tokensBefore: number;
  tokensAfter: number;
}

export const THINKING_LEVELS = ["low", "medium", "high"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface ThinkingLevelChangePayload {
  level: ThinkingLevel;
}

export interface ModelChangePayload {
  from: string;
  to: string;
  reason?: string;
}

export interface LabelPayload {
  label: string;
  color?: string;
}

export interface SessionInfoPayload {
  key: string;
  value: unknown;
}

export interface SessionEntryPayloadMap {
  message: MessagePayload;
  compaction: CompactionPayload;
  thinking_level_change: ThinkingLevelChangePayload;
  model_change: ModelChangePayload;
  label: LabelPayload;
  session_info: SessionInfoPayload;
}

export interface SessionContext {
  sessionId: string;
  entries: SessionEntry[];
  messages: SessionContextMessage[];
}

export interface SessionContextMessage {
  role: "user" | "assistant" | "system" | "compactionSummary";
  content: string;
  entryId: string;
  toolName?: string;
  toolCallId?: string;
  contentBlocks?: LlmAssistantContentBlock[];
}

// ──────────────────────────────────────────────────────────
// Run State Model
// ──────────────────────────────────────────────────────────

export const RUN_PHASES = ["idle", "running", "paused", "compacting", "stopped"] as const;
export type RunPhase = (typeof RUN_PHASES)[number];

export interface RetryState {
  active: boolean;
  attempt: number;
  maxAttempts: number;
}

export interface QueuedPrompt {
  id: string;
  text: string;
  enqueuedAt: string;
}

export interface RunQueue {
  steer: QueuedPrompt[];
  followUp: QueuedPrompt[];
}

export interface RunState {
  sessionId: string;
  phase: RunPhase;
  retry: RetryState;
  queue: RunQueue;
}

export const CHILD_RUN_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type ChildRunStatus = (typeof CHILD_RUN_STATUSES)[number];

export interface ChildRunRecord {
  id: string;
  parentSessionId: string;
  childSessionId: string;
  status: ChildRunStatus;
  createdAt: string;
  updatedAt: string;
  parentTurnId?: string;
  title?: string;
  task?: string;
}

export interface ChildRunSummary {
  totalCount: number;
  activeCount: number;
  items: ChildRunRecord[];
}

export const CHILD_RUN_STATUS_TRANSITIONS: Record<ChildRunStatus, readonly ChildRunStatus[]> = {
  pending: ["running", "completed", "failed", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransitionChildRunStatus(from: ChildRunStatus, to: ChildRunStatus): boolean {
  return (CHILD_RUN_STATUS_TRANSITIONS[from] as readonly string[]).includes(to);
}

/** Legal transitions for the run phase state machine. */
export const RUN_PHASE_TRANSITIONS: Record<RunPhase, readonly RunPhase[]> = {
  idle: ["running"],
  running: ["paused", "compacting", "stopped"],
  paused: ["running"],
  compacting: ["running", "idle"],
  stopped: ["idle"],
};

export function canTransitionRunPhase(from: RunPhase, to: RunPhase): boolean {
  return (RUN_PHASE_TRANSITIONS[from] as readonly string[]).includes(to);
}

// ──────────────────────────────────────────────────────────
// Loop Turn Model
// ──────────────────────────────────────────────────────────

export const LOOP_TERMINAL_STATUSES = [
  "done",
  "failed_execute",
  "failed_verify",
  "progress_uncertain",
  "max_steps",
  "stopped",
  "timeout",
] as const;
export type LoopTerminalStatus = (typeof LOOP_TERMINAL_STATUSES)[number];

export const NO_PROGRESS_REASONS = ["repeat_signature", "ping_pong"] as const;
export type NoProgressReason = (typeof NO_PROGRESS_REASONS)[number];

export const LOOP_TURN_STATUSES = [
  "pending",
  "executing",
  "succeeded",
  "failed",
  "skipped",
] as const;
export type LoopTurnStatus = (typeof LOOP_TURN_STATUSES)[number];

export interface LoopTurn {
  turnId: string;
  sessionId: string;
  stepIndex: number;
  capabilityId?: string;
  status: LoopTurnStatus;
  retryable?: boolean;
  verified?: boolean;
  lastError?: string;
  timedOut?: boolean;
  terminalStatus?: LoopTerminalStatus;
  noProgressReason?: NoProgressReason;
  startedAt: string;
  endedAt?: string;
}

// ──────────────────────────────────────────────────────────
// Loop Telemetry
// ──────────────────────────────────────────────────────────

export interface LoopTelemetryEntry {
  stepIndex: number;
  capabilityId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  ok: boolean;
  errorCode?: string;
  tokenEstimate?: number;
}

// ──────────────────────────────────────────────────────────
// Compaction Contract
// ──────────────────────────────────────────────────────────

export const COMPACTION_REASONS = ["overflow", "threshold", "manual"] as const;
export type CompactionReason = (typeof COMPACTION_REASONS)[number];

export interface CompactionDraft {
  reason: CompactionReason;
  summary: string;
  firstKeptEntryId: string;
  previousSummary?: string;
  tokensBefore: number;
  tokensAfter: number;
}

// ──────────────────────────────────────────────────────────
// Kernel LLM Adapter (injected, not a capability)
// ──────────────────────────────────────────────────────────

export interface KernelLlmAdapter {
  complete(opts: {
    systemPrompt: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<string>;
}

// ──────────────────────────────────────────────────────────
// LLM Provider / Profile / Route Types
// ──────────────────────────────────────────────────────────

export const LLM_PROVIDER_EXECUTION_LANES = ["primary", "compaction", "title"] as const;
export type LlmProviderExecutionLane = (typeof LLM_PROVIDER_EXECUTION_LANES)[number];

export const LLM_PROFILE_ESCALATION_POLICIES = ["disabled", "upgrade_only"] as const;
export type LlmProfileEscalationPolicy = (typeof LLM_PROFILE_ESCALATION_POLICIES)[number];

export interface LlmResolvedRoute {
  profile: string;
  provider: string;
  llmBase: string;
  llmKey: string;
  llmModel: string;
  providerOptions?: Record<string, unknown>;
  llmTimeoutMs: number;
  llmRetryMaxAttempts: number;
  llmMaxRetryDelayMs: number;
  role: string;
  escalationPolicy: LlmProfileEscalationPolicy;
  orderedProfiles: string[];
}

export interface LlmProviderSendInput {
  sessionId?: string;
  step?: number;
  lane?: LlmProviderExecutionLane;
  route: LlmResolvedRoute;
  payload: Record<string, unknown>;
  signal: AbortSignal;
  requestUrl?: string;
}

export interface LlmProviderAdapter {
  id: string;
  resolveRequestUrl(route: LlmResolvedRoute): string;
  send(input: LlmProviderSendInput): Promise<Response>;
}

export interface LlmProfileDef {
  id: string;
  providerId: string;
  llmBase: string;
  llmKey: string;
  llmModel: string;
  providerOptions?: Record<string, unknown>;
  llmTimeoutMs?: number;
  llmRetryMaxAttempts?: number;
  llmMaxRetryDelayMs?: number;
}

export interface LlmProfileConfig {
  profiles: LlmProfileDef[];
  defaultProfile: string;
  fallbackProfile?: string;
  auxProfile?: string;
  laneProfiles?: Partial<Record<LlmProviderExecutionLane, string[]>>;
}

export type ResolveLlmRouteResult =
  | { ok: true; route: LlmResolvedRoute }
  | {
      ok: false;
      reason: "profile_not_found" | "missing_llm_config" | "route_unavailable";
      message: string;
      profile: string;
    };

// ──────────────────────────────────────────────────────────
// LLM Message Model
// ──────────────────────────────────────────────────────────

export type LlmMessageRole = "system" | "user" | "assistant" | "tool";

export interface LlmToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface LlmTextBlock {
  type: "text";
  text: string;
}

export interface LlmToolCallBlock {
  type: "toolCall";
  id: string;
  name: string;
  arguments: string;
}

export type LlmAssistantContentBlock = LlmTextBlock | LlmToolCallBlock;

export interface LlmAssistantMessage {
  role: "assistant";
  content: LlmAssistantContentBlock[];
  toolCalls?: LlmToolCall[];
  stopReason?: string;
}

export interface LlmContextMessage {
  role: "system" | "user" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
}

export type LlmMessage = LlmAssistantMessage | LlmContextMessage;

export interface LlmSseStreamResult {
  message: Record<string, unknown>;
  rawBody: string;
  packetCount: number;
}

// ──────────────────────────────────────────────────────────
// Session Storage (persistence interface)
// ──────────────────────────────────────────────────────────

export interface SessionStorage {
  createSession(header: SessionHeader): Promise<void>;
  appendEntry(sessionId: string, entry: SessionEntry): Promise<void>;
  getEntries(sessionId: string): Promise<SessionEntry[]>;
  listSessions(): Promise<SessionHeader[]>;
  deleteSession(sessionId: string): Promise<void>;
  readKernelSnapshot(sessionId: string): Promise<KernelSessionSnapshot | null>;
  writeKernelSnapshot(sessionId: string, snapshot: KernelSessionSnapshot): Promise<void>;
}

export interface KernelSessionSnapshot {
  interventions?: {
    records: InterventionRecord[];
    audit: InterventionAuditEntry[];
  };
}
