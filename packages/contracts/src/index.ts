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

export const CONTROL_PLANE_AUDIT_KINDS = [
  ...HOST_AUDIT_KINDS,
  ...CONFIG_AUDIT_KINDS,
  ...SKILL_AUDIT_KINDS,
] as const;
export type ControlPlaneAuditKind = (typeof CONTROL_PLANE_AUDIT_KINDS)[number];

export const CONTROL_PLANE_AUDIT_STATUSES = [
  ...HOST_AUDIT_STATUSES,
  ...CONFIG_AUDIT_STATUSES,
  ...SKILL_AUDIT_STATUSES,
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

export type ControlPlaneAuditEntry = HostAuditEntry | ConfigAuditEntry | SkillAuditEntry;

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
}

export interface CompactionPayload {
  reason: CompactionReason;
  summary: string;
  firstKeptEntryId: string;
  previousSummary?: string;
  tokensBefore: number;
  tokensAfter: number;
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
