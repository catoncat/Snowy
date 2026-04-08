import {
  type AiSurfaceBoundary,
  type AiSurfaceResourceDocument,
  type AiSurfaceResourceId,
  type AuditTailResource,
  type AuditTailSummary,
  BOOTSTRAP_RESOURCE_KEYS,
  type BootstrapActiveTabSummary,
  type BootstrapResourceKey,
  type BootstrapSummary,
  type BootstrapSummaryStatus,
  CONFIG_RESOURCE_FIELDS,
  AI_SURFACE_BOUNDARY as CONTRACT_AI_SURFACE_BOUNDARY,
  type CapabilityDescriptor,
  CapabilityError,
  type CapabilityExportHandoff,
  type CapabilityTraceEntry,
  type ConfigBootstrapSummary,
  type ConfigResourceField,
  type ConfigSummaryResource,
  type ConfigSummaryStatus,
  type ControlPlaneAuditEntry,
  type ExecutionBinding,
  type ExecutionHostHealthStatus,
  type ExecutionHostKind,
  type ExecutionHostRecord,
  type ExecutionHostState,
  type HostBootstrapSummaryItem,
  type HostControlPlaneSnapshot,
  type HostsBootstrapSummary,
  type HostsSummaryResource,
  type InterventionAuditEntry,
  type InterventionAuditResource,
  type InterventionAuditSummary,
  type InterventionRecord,
  type InterventionSummary,
  type JsonSchema,
  MAX_SKILL_CALL_DEPTH,
  PUBLIC_CAPABILITY_NAMESPACES,
  type ResourceDocument,
  type RuntimeBootstrapSummary,
  type RuntimeSummaryResource,
  type SkillControlPlaneAction,
  type SkillsBootstrapSummary,
  type SkillsSummaryResource,
  type ToolContract,
  assertCapabilityDescriptor,
  capabilityNamespace,
  descriptorToToolContract,
  descriptorsToCapabilityExportHandoffs,
  getAiSurfaceResourceMetadata,
} from "@bbl-next/contracts";

export interface CapabilityProviderRequest {
  descriptor: CapabilityDescriptor;
  binding: ExecutionBinding;
  input: unknown;
  context?: SkillRuntimeContext;
}

export interface CapabilityFamilyProvider {
  family: string;
  invoke(request: CapabilityProviderRequest): Promise<unknown> | unknown;
}

export interface SkillInvocationRequest {
  skillId: string;
  action: string;
  args: unknown;
  parentContext: SkillRuntimeContext;
}

export interface SkillManagementRequest {
  skillId: string;
  action: SkillControlPlaneAction;
  parentContext: SkillRuntimeContext;
}

export interface SkillRuntimeContextOptions {
  registry: CapabilityRegistry;
  providers: FamilyProviderRegistry;
  sessionId: string;
  skillId: string;
  permissions: string[];
  depth?: number;
  traceId?: string;
  parentTraceId?: string;
  trace?: CapabilityTraceEntry[];
  confirm?: (descriptor: CapabilityDescriptor, input: unknown) => boolean | Promise<boolean>;
  invokeSkill?: (request: SkillInvocationRequest) => Promise<unknown>;
  listSkills?: () => Promise<string[]> | string[];
  manageSkill?: (request: SkillManagementRequest) => Promise<unknown>;
}

export interface SkillRuntimeContext {
  sessionId: string;
  skillId: string;
  depth: number;
  traceId: string;
  parentTraceId?: string;
  permissions: string[];
  trace: CapabilityTraceEntry[];
  call(capabilityId: string, input: unknown): Promise<unknown>;
  capabilities: Record<string, unknown>;
  runtime: {
    listCapabilities(): CapabilityDescriptor[];
    getCapability(capabilityId: string): CapabilityDescriptor | undefined;
  };
  skills: {
    invoke(skillId: string, action: string, args: unknown): Promise<unknown>;
    install(skillId: string): Promise<unknown>;
    enable(skillId: string): Promise<unknown>;
    disable(skillId: string): Promise<unknown>;
    uninstall(skillId: string): Promise<unknown>;
  };
}

export interface CapabilityDispatchOptions {
  registry: CapabilityRegistry;
  providers: FamilyProviderRegistry;
  sessionId: string;
  capabilityId: string;
  input: unknown;
  skillId?: string;
  permissions?: string[];
  traceId?: string;
  parentTraceId?: string;
  trace?: CapabilityTraceEntry[];
  confirm?: SkillRuntimeContextOptions["confirm"];
  invokeSkill?: SkillRuntimeContextOptions["invokeSkill"];
  listSkills?: SkillRuntimeContextOptions["listSkills"];
  manageSkill?: SkillRuntimeContextOptions["manageSkill"];
}

export async function dispatchCapabilityCall(options: CapabilityDispatchOptions): Promise<unknown> {
  const ctx = createSkillRuntimeContext({
    registry: options.registry,
    providers: options.providers,
    sessionId: options.sessionId,
    skillId: options.skillId ?? "runtime.dispatch",
    permissions: options.permissions ?? ["*"],
    traceId: options.traceId,
    parentTraceId: options.parentTraceId,
    trace: options.trace,
    confirm: options.confirm,
    invokeSkill: options.invokeSkill,
    listSkills: options.listSkills,
    manageSkill: options.manageSkill,
  });

  return ctx.call(options.capabilityId, options.input);
}

export class FamilyProviderRegistry {
  readonly #providers = new Map<string, CapabilityFamilyProvider>();

  register(provider: CapabilityFamilyProvider): void {
    this.#providers.set(provider.family, provider);
  }

  async invoke(
    descriptor: CapabilityDescriptor,
    input: unknown,
    context?: SkillRuntimeContext,
  ): Promise<unknown> {
    const provider = this.#providers.get(descriptor.executionBinding.family);
    if (!provider) {
      throw new CapabilityError(
        "E_RUNTIME",
        `No provider registered for family ${descriptor.executionBinding.family}`,
      );
    }
    return provider.invoke({
      descriptor,
      binding: descriptor.executionBinding,
      input,
      context,
    });
  }
}

export class CapabilityRegistry {
  readonly #descriptors = new Map<string, CapabilityDescriptor>();

  constructor(descriptors: CapabilityDescriptor[]) {
    for (const descriptor of descriptors) {
      this.#descriptors.set(descriptor.id, assertCapabilityDescriptor(descriptor));
    }
  }

  list(): CapabilityDescriptor[] {
    return [...this.#descriptors.values()];
  }

  get(capabilityId: string): CapabilityDescriptor | undefined {
    return this.#descriptors.get(capabilityId);
  }

  require(capabilityId: string): CapabilityDescriptor {
    const descriptor = this.get(capabilityId);
    if (!descriptor) {
      throw new CapabilityError("E_CAPABILITY_NOT_FOUND", `Unknown capability: ${capabilityId}`);
    }
    return descriptor;
  }

  projectTools(): ToolContract[] {
    return this.list().map((descriptor) => descriptorToToolContract(descriptor));
  }

  projectMcpExportHandoffs(): CapabilityExportHandoff[] {
    return descriptorsToCapabilityExportHandoffs(this.list());
  }
}

export const AI_SURFACE_BOUNDARY: AiSurfaceBoundary = CONTRACT_AI_SURFACE_BOUNDARY;
export const BUILTIN_BOOTSTRAP_RESOURCE_KEYS: BootstrapResourceKey[] = [...BOOTSTRAP_RESOURCE_KEYS];
export type {
  AiSurfaceResourceDocument,
  AuditTailResource,
  AuditTailSummary,
  BootstrapActiveTabSummary,
  BootstrapSummary,
  BootstrapSummaryStatus,
  ConfigAuditEntry,
  ConfigBootstrapSummary,
  ConfigSummaryResource,
  ConfigSummaryStatus,
  ControlPlaneAuditEntry,
  HostBootstrapSummaryItem,
  HostAuditEntry,
  HostsBootstrapSummary,
  HostsSummaryResource,
  InterventionKind,
  InterventionAuditEntry,
  InterventionAuditResource,
  InterventionAuditSummary,
  InterventionLifecycleStatus,
  InterventionRecord,
  InterventionRequest,
  InterventionSummary,
  InterventionTrigger,
  RuntimeBootstrapSummary,
  RuntimeSummaryResource,
  SkillAuditEntry,
  SkillsBootstrapSummary,
  SkillsSummaryResource,
} from "@bbl-next/contracts";

export interface BootstrapSummaryInput {
  generatedAt?: string;
  activeTab?: (BootstrapActiveTabSummary & { active?: boolean }) | null;
  runtime?: {
    status?: BootstrapSummaryStatus;
    sessionId?: string | null;
    loopState?: string | null;
    lastError?: {
      code: string;
      message: string;
    } | null;
    interventions?: Partial<Omit<InterventionSummary, "active">> & {
      active?: InterventionRecord[];
    };
  };
  skills?: Partial<Omit<SkillsBootstrapSummary, "status">>;
  hosts?: {
    items?: HostBootstrapSummaryItem[];
    defaultHostId?: string | null;
    status?: BootstrapSummaryStatus;
  };
  config?: {
    status?: ConfigSummaryStatus;
    fields?: ConfigResourceField[];
    values?: Partial<Record<ConfigResourceField, Record<string, unknown>>>;
    note?: string | null;
    updatedAt?: string | null;
  };
  capabilities?: CapabilityDescriptor[];
}

export interface BootstrapSummaryResources {
  runtime: RuntimeSummaryResource;
  config: ConfigSummaryResource;
  skills: SkillsSummaryResource;
  hosts: HostsSummaryResource;
}

type InterventionSummaryInput = Partial<Omit<InterventionSummary, "active">> & {
  active?: InterventionRecord[];
};

export interface AuditTailResourceInput {
  entries: ControlPlaneAuditEntry[];
  generatedAt?: string;
  limit?: number;
}

export interface InterventionAuditResourceInput {
  entries: InterventionAuditEntry[];
  generatedAt?: string;
  limit?: number;
}

export interface ReadAiSurfaceResourceInput {
  resourceId: AiSurfaceResourceId;
  bootstrap?: BootstrapSummaryInput;
  auditTail?: AuditTailResourceInput;
  interventionAudit?: InterventionAuditResourceInput;
}

export interface HostControlPlaneRecordInput {
  hostId: string;
  kind?: ExecutionHostKind;
  connected?: boolean;
  state?: ExecutionHostState;
  isDefault?: boolean;
  health?: {
    status?: ExecutionHostHealthStatus;
    checkedAt?: string;
  };
}

export interface HostControlPlaneSnapshotInput {
  defaultHostId?: string | null;
  hosts?: HostControlPlaneRecordInput[];
}

export interface HostSubstrateTarget {
  hostId: string;
  via: "explicit" | "default";
}

export interface ConfigControlPlane {
  getBootstrapSummary(): Promise<ConfigBootstrapSummary>;
  update(patch: unknown): Promise<{
    config: ConfigBootstrapSummary;
  }>;
}

export interface CreateConfigControlPlaneOptions {
  summary?:
    | Partial<ConfigBootstrapSummary>
    | Promise<Partial<ConfigBootstrapSummary> | undefined>
    | (() => Partial<ConfigBootstrapSummary> | Promise<Partial<ConfigBootstrapSummary> | undefined>)
    | undefined;
}

export interface TabsCapabilityRecord {
  tabId: number;
  url: string;
  active: boolean;
  title?: string;
}

export interface TabsCapabilityTransport {
  list(): Promise<TabsCapabilityRecord[]>;
  getActive(actionKind: string): Promise<TabsCapabilityRecord>;
  navigate(url: string): Promise<TabsCapabilityRecord>;
}

interface CatalogEntryInput {
  id: string;
  family: string;
  operation: string;
  risk: CapabilityDescriptor["risk"];
  sideEffects: CapabilityDescriptor["sideEffects"];
  permissions: string[];
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  supportsVerify?: boolean;
  exportable?: boolean;
  exportRisk?: CapabilityDescriptor["risk"];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function resolveMaybe<T>(
  value: T | Promise<T | undefined> | (() => T | Promise<T | undefined>) | undefined,
): Promise<T | undefined> {
  if (typeof value === "function") {
    return (value as () => T | Promise<T | undefined>)();
  }
  return value;
}

function normalizeConfigSurfaceValues(
  values: unknown,
): Partial<Record<ConfigResourceField, Record<string, unknown>>> {
  const out: Partial<Record<ConfigResourceField, Record<string, unknown>>> = {};
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

function mergeConfigValues(
  baseValues: unknown,
  patchValues: unknown,
): Partial<Record<ConfigResourceField, Record<string, unknown>>> {
  const next = normalizeConfigSurfaceValues(baseValues);
  if (!isPlainObject(patchValues)) {
    return next;
  }
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

function normalizeConfigPatch(
  patch: unknown,
): Partial<Record<ConfigResourceField, Record<string, unknown>>> {
  if (!isPlainObject(patch)) {
    throw new CapabilityError("E_BAD_INPUT", "config.update requires a patch object");
  }

  const normalized: Partial<Record<ConfigResourceField, Record<string, unknown>>> = {};
  for (const [field, value] of Object.entries(patch)) {
    if (!CONFIG_RESOURCE_FIELDS.includes(field as ConfigResourceField)) {
      throw new CapabilityError("E_BAD_INPUT", `config.update does not support field: ${field}`);
    }
    if (!isPlainObject(value)) {
      throw new CapabilityError("E_BAD_INPUT", `config.update field ${field} must be an object`);
    }
    normalized[field as ConfigResourceField] = { ...value };
  }

  if (Object.keys(normalized).length === 0) {
    throw new CapabilityError("E_BAD_INPUT", "config.update requires at least one config field");
  }

  return normalized;
}

function catalogEntry(input: CatalogEntryInput): CapabilityDescriptor {
  const {
    id,
    family,
    operation,
    risk,
    sideEffects,
    permissions,
    description,
    inputSchema,
    outputSchema = { type: "object" },
    supportsVerify = family === "page" || family === "site",
    exportable = sideEffects === "reads" || sideEffects === "none",
    exportRisk,
  } = input;
  return {
    id,
    version: 1,
    description,
    inputSchema,
    outputSchema,
    risk,
    sideEffects,
    permissions,
    supportsVerify,
    supportsStreaming: false,
    exportable,
    exportName: id,
    exportRisk: exportRisk ?? risk,
    executionBinding: { family, operation },
  };
}

function normalizeConfigValues(
  values: Partial<Record<ConfigResourceField, Record<string, unknown>>> | undefined,
): Partial<Record<ConfigResourceField, Record<string, unknown>>> {
  const out: Partial<Record<ConfigResourceField, Record<string, unknown>>> = {};
  if (!values) {
    return out;
  }

  for (const field of CONFIG_RESOURCE_FIELDS) {
    const value = values[field];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[field] = { ...value };
    }
  }

  return out;
}

function cloneInterventionRecord(record: InterventionRecord): InterventionRecord {
  return {
    ...record,
    ...(record.payload ? { payload: { ...record.payload } } : {}),
    ...(record.resolution ? { resolution: { ...record.resolution } } : {}),
  };
}

function cloneInterventionAuditEntry(entry: InterventionAuditEntry): InterventionAuditEntry {
  return {
    ...entry,
    ...(entry.details ? { details: { ...entry.details } } : {}),
  };
}

function buildInterventionSummary(
  input: InterventionSummaryInput | undefined,
): InterventionSummary {
  const active = Array.isArray(input?.active) ? input.active.map(cloneInterventionRecord) : [];
  return {
    status: input?.status ?? (active.length > 0 ? "requested" : "empty"),
    totalCount: input?.totalCount ?? active.length,
    activeCount: input?.activeCount ?? active.length,
    recentCount: input?.recentCount ?? 0,
    active,
  };
}

function buildConfigBootstrapSummary(
  input: BootstrapSummaryInput["config"],
): ConfigBootstrapSummary {
  const values = normalizeConfigValues(input?.values);
  const hasValues = Object.keys(values).length > 0;
  const status = input?.status ?? (hasValues ? "ready" : "placeholder");

  return {
    status,
    fields: input?.fields ?? [...CONFIG_RESOURCE_FIELDS],
    values,
    note:
      input?.note ?? (status === "ready" ? null : "Config control plane is not implemented yet."),
    updatedAt: input?.updatedAt ?? null,
  };
}

export const BUILTIN_CATALOG: Readonly<Record<string, CapabilityDescriptor[]>> = {
  config: [
    catalogEntry({
      id: "config.update",
      family: "config",
      operation: "update",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["config.update"],
      description: "Apply a structured patch to the product config control plane",
      inputSchema: {
        type: "object",
        properties: {
          patch: {
            type: "object",
            properties: {
              model: { type: "object" },
              automation: { type: "object" },
              permissions: { type: "object" },
              preferences: { type: "object" },
            },
          },
        },
        required: ["patch"],
      },
      outputSchema: {
        type: "object",
        properties: {
          config: { type: "object" },
        },
        required: ["config"],
      },
    }),
  ],
  memfs: [
    catalogEntry({
      id: "memfs.read",
      family: "memfs",
      operation: "read",
      risk: "low",
      sideEffects: "reads",
      permissions: ["memfs.read"],
      description: "Read a file from the virtual filesystem",
      inputSchema: { type: "object", properties: { uri: { type: "string" } }, required: ["uri"] },
    }),
    catalogEntry({
      id: "memfs.write",
      family: "memfs",
      operation: "write",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["memfs.write"],
      description: "Write content to a file in the virtual filesystem",
      inputSchema: {
        type: "object",
        properties: { uri: { type: "string" }, content: { type: "string" } },
        required: ["uri", "content"],
      },
    }),
    catalogEntry({
      id: "memfs.edit",
      family: "memfs",
      operation: "edit",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["memfs.edit"],
      description: "Apply an edit patch to a file in the virtual filesystem",
      inputSchema: {
        type: "object",
        properties: { uri: { type: "string" }, patch: { type: "string" } },
        required: ["uri", "patch"],
      },
    }),
    catalogEntry({
      id: "memfs.stat",
      family: "memfs",
      operation: "stat",
      risk: "low",
      sideEffects: "reads",
      permissions: ["memfs.stat"],
      description: "Read metadata for a virtual filesystem path",
      inputSchema: { type: "object", properties: { uri: { type: "string" } }, required: ["uri"] },
    }),
    catalogEntry({
      id: "memfs.list",
      family: "memfs",
      operation: "list",
      risk: "low",
      sideEffects: "reads",
      permissions: ["memfs.list"],
      description: "List entries in a virtual filesystem directory",
      inputSchema: { type: "object", properties: { uri: { type: "string" } }, required: ["uri"] },
    }),
    catalogEntry({
      id: "memfs.mkdir",
      family: "memfs",
      operation: "mkdir",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["memfs.mkdir"],
      description: "Create a directory in the virtual filesystem",
      inputSchema: { type: "object", properties: { uri: { type: "string" } }, required: ["uri"] },
    }),
    catalogEntry({
      id: "memfs.rm",
      family: "memfs",
      operation: "rm",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["memfs.rm"],
      description: "Remove a file or directory from the virtual filesystem",
      inputSchema: { type: "object", properties: { uri: { type: "string" } }, required: ["uri"] },
    }),
    catalogEntry({
      id: "memfs.mv",
      family: "memfs",
      operation: "mv",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["memfs.mv"],
      description: "Move a file or directory in the virtual filesystem",
      inputSchema: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" } },
        required: ["from", "to"],
      },
    }),
    catalogEntry({
      id: "memfs.copy",
      family: "memfs",
      operation: "copy",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["memfs.copy"],
      description: "Copy a file or directory in the virtual filesystem",
      inputSchema: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" } },
        required: ["from", "to"],
      },
    }),
    catalogEntry({
      id: "memfs.stage",
      family: "memfs",
      operation: "stage",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["memfs.stage"],
      description: "Stage multiple file writes in the virtual filesystem",
      inputSchema: {
        type: "object",
        properties: {
          entries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                uri: { type: "string" },
                content: { type: "string" },
              },
              required: ["uri", "content"],
            },
          },
        },
        required: ["entries"],
      },
    }),
    catalogEntry({
      id: "memfs.snapshot",
      family: "memfs",
      operation: "snapshot",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["memfs.snapshot"],
      description: "Create a snapshot of a virtual filesystem subtree",
      inputSchema: {
        type: "object",
        properties: { source: { type: "string" }, target: { type: "string" } },
        required: ["source", "target"],
      },
    }),
    catalogEntry({
      id: "memfs.rehydrate",
      family: "memfs",
      operation: "rehydrate",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["memfs.rehydrate"],
      description: "Restore a virtual filesystem subtree from a snapshot",
      inputSchema: {
        type: "object",
        properties: { snapshot: { type: "string" }, target: { type: "string" } },
        required: ["snapshot", "target"],
      },
    }),
  ],
  page: [
    catalogEntry({
      id: "page.query",
      family: "page",
      operation: "query",
      risk: "low",
      sideEffects: "reads",
      permissions: ["page.query"],
      description: "Query elements on the active page",
      inputSchema: {
        type: "object",
        properties: { selector: { type: "string" } },
        required: ["selector"],
      },
    }),
    catalogEntry({
      id: "page.click",
      family: "page",
      operation: "click",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["page.click"],
      description: "Click an element on the active page",
      inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] },
    }),
    catalogEntry({
      id: "page.fill",
      family: "page",
      operation: "fill",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["page.fill"],
      description: "Fill a form field on the active page",
      inputSchema: {
        type: "object",
        properties: { uid: { type: "string" }, value: { type: "string" } },
        required: ["uid", "value"],
      },
    }),
    catalogEntry({
      id: "page.press_key",
      family: "page",
      operation: "press_key",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["page.press_key"],
      description: "Press a keyboard key on the active page",
      inputSchema: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Key to press (e.g. 'Enter', 'Tab', 'Escape', 'a')",
          },
        },
        required: ["key"],
      },
      outputSchema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
        },
        required: ["ok"],
      },
      supportsVerify: true,
    }),
    catalogEntry({
      id: "page.screenshot",
      family: "page",
      operation: "screenshot",
      risk: "low",
      sideEffects: "reads",
      permissions: ["page.screenshot"],
      description: "Capture a screenshot of the active page",
      inputSchema: {
        type: "object",
        properties: {
          format: {
            type: "string",
            enum: ["png", "jpeg"],
            default: "png",
          },
          quality: {
            type: "number",
            minimum: 0,
            maximum: 100,
          },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          dataUrl: { type: "string" },
          format: { type: "string" },
          width: { type: "number" },
          height: { type: "number" },
        },
        required: ["dataUrl", "format"],
      },
      supportsVerify: false,
    }),
  ],
  site: [
    catalogEntry({
      id: "site.fetch_with_session",
      family: "site",
      operation: "fetch_with_session",
      risk: "medium",
      sideEffects: "external",
      permissions: ["site.fetch_with_session"],
      description: "Fetch a URL using the active tab session cookies",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string" }, method: { type: "string" } },
        required: ["url"],
      },
    }),
  ],
  tabs: [
    catalogEntry({
      id: "tabs.list",
      family: "tabs",
      operation: "list",
      risk: "low",
      sideEffects: "reads",
      permissions: ["tabs.list"],
      description: "List all open browser tabs",
      inputSchema: { type: "object" },
    }),
    catalogEntry({
      id: "tabs.get_active",
      family: "tabs",
      operation: "get_active",
      risk: "low",
      sideEffects: "reads",
      permissions: ["tabs.get_active"],
      description: "Get metadata of the currently active tab",
      inputSchema: { type: "object" },
      outputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number" },
          url: { type: "string" },
          active: { type: "boolean" },
          title: { type: "string" },
        },
        required: ["tabId", "url", "active"],
      },
    }),
    catalogEntry({
      id: "tabs.navigate",
      family: "tabs",
      operation: "navigate",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["tabs.navigate"],
      description: "Navigate the active tab to a URL",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
      outputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number" },
          url: { type: "string" },
          active: { type: "boolean" },
          title: { type: "string" },
        },
        required: ["tabId", "url", "active"],
      },
      supportsVerify: true,
    }),
  ],
  runner: [
    catalogEntry({
      id: "runner.invoke",
      family: "runner",
      operation: "invoke",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["runner.invoke"],
      description: "Invoke a JS module in the isolated runner host",
      inputSchema: {
        type: "object",
        properties: { moduleId: { type: "string" }, input: { type: "object" } },
        required: ["moduleId"],
      },
    }),
  ],
  skills: [
    catalogEntry({
      id: "skills.invoke",
      family: "skills",
      operation: "invoke",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["skills.invoke"],
      description: "Invoke another skill by id and action",
      inputSchema: {
        type: "object",
        properties: {
          skillId: { type: "string" },
          action: { type: "string" },
          args: { type: "object" },
        },
        required: ["skillId", "action"],
      },
    }),
    catalogEntry({
      id: "skills.list",
      family: "skills",
      operation: "list",
      risk: "low",
      sideEffects: "reads",
      permissions: ["skills.list"],
      description: "List all installed skills",
      inputSchema: { type: "object" },
    }),
    catalogEntry({
      id: "skills.install",
      family: "skills",
      operation: "install",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["skills.install"],
      description: "Install a staged skill into the product skill library",
      inputSchema: {
        type: "object",
        properties: {
          skillId: { type: "string" },
        },
        required: ["skillId"],
      },
      outputSchema: {
        type: "object",
        properties: {
          skill: {
            type: "object",
            properties: {
              skillId: { type: "string" },
              status: { type: "string" },
              trusted: { type: "boolean" },
              recentChange: { type: "string" },
            },
            required: ["skillId", "status", "trusted"],
          },
        },
        required: ["skill"],
      },
    }),
    catalogEntry({
      id: "skills.enable",
      family: "skills",
      operation: "enable",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["skills.enable"],
      description: "Enable an installed skill for runtime invocation",
      inputSchema: {
        type: "object",
        properties: {
          skillId: { type: "string" },
        },
        required: ["skillId"],
      },
      outputSchema: {
        type: "object",
        properties: {
          skill: {
            type: "object",
            properties: {
              skillId: { type: "string" },
              status: { type: "string" },
              trusted: { type: "boolean" },
              recentChange: { type: "string" },
            },
            required: ["skillId", "status", "trusted"],
          },
        },
        required: ["skill"],
      },
    }),
    catalogEntry({
      id: "skills.disable",
      family: "skills",
      operation: "disable",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["skills.disable"],
      description: "Disable an enabled skill without removing its installed package",
      inputSchema: {
        type: "object",
        properties: {
          skillId: { type: "string" },
        },
        required: ["skillId"],
      },
      outputSchema: {
        type: "object",
        properties: {
          skill: {
            type: "object",
            properties: {
              skillId: { type: "string" },
              status: { type: "string" },
              trusted: { type: "boolean" },
              recentChange: { type: "string" },
            },
            required: ["skillId", "status", "trusted"],
          },
        },
        required: ["skill"],
      },
    }),
    catalogEntry({
      id: "skills.uninstall",
      family: "skills",
      operation: "uninstall",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["skills.uninstall"],
      description:
        "Archive a skill out of the active product library without deleting version history",
      inputSchema: {
        type: "object",
        properties: {
          skillId: { type: "string" },
        },
        required: ["skillId"],
      },
      outputSchema: {
        type: "object",
        properties: {
          skill: {
            type: "object",
            properties: {
              skillId: { type: "string" },
              status: { type: "string" },
              trusted: { type: "boolean" },
              recentChange: { type: "string" },
            },
            required: ["skillId", "status", "trusted"],
          },
        },
        required: ["skill"],
      },
    }),
  ],
  runtime: [
    catalogEntry({
      id: "runtime.list_capabilities",
      family: "runtime",
      operation: "list_capabilities",
      risk: "low",
      sideEffects: "reads",
      permissions: ["runtime.list_capabilities"],
      description: "List all registered action capabilities",
      inputSchema: { type: "object" },
    }),
    catalogEntry({
      id: "runtime.get_capability",
      family: "runtime",
      operation: "get_capability",
      risk: "low",
      sideEffects: "reads",
      permissions: ["runtime.get_capability"],
      description: "Get an action capability descriptor by id",
      inputSchema: {
        type: "object",
        properties: { capabilityId: { type: "string" } },
        required: ["capabilityId"],
      },
    }),
    catalogEntry({
      id: "runtime.capture_diagnostics",
      family: "runtime",
      operation: "capture_diagnostics",
      risk: "low",
      sideEffects: "reads",
      permissions: ["runtime.capture_diagnostics"],
      description: "Capture a read-only runtime diagnostics snapshot without triggering recovery",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number" },
          world: {
            type: "string",
            enum: ["main", "content"],
          },
        },
      },
    }),
    catalogEntry({
      id: "runtime.clear_error",
      family: "runtime",
      operation: "clear_error",
      risk: "low",
      sideEffects: "writes",
      permissions: ["runtime.clear_error"],
      description: "Clear the current runtime error state, idempotent if no error is present",
      inputSchema: { type: "object" },
    }),
  ],
  hosts: [
    catalogEntry({
      id: "hosts.list",
      family: "hosts",
      operation: "list",
      risk: "low",
      sideEffects: "reads",
      permissions: ["hosts.list"],
      description: "List execution hosts managed by the product control plane",
      inputSchema: { type: "object" },
    }),
    catalogEntry({
      id: "hosts.get",
      family: "hosts",
      operation: "get",
      risk: "low",
      sideEffects: "reads",
      permissions: ["hosts.get"],
      description: "Get execution host control plane state by host id",
      inputSchema: {
        type: "object",
        properties: { hostId: { type: "string" } },
        required: ["hostId"],
      },
    }),
    catalogEntry({
      id: "hosts.connect",
      family: "hosts",
      operation: "connect",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["hosts.connect"],
      description: "Connect an execution host through the product control plane",
      inputSchema: {
        type: "object",
        properties: { hostId: { type: "string" } },
        required: ["hostId"],
      },
    }),
    catalogEntry({
      id: "hosts.disconnect",
      family: "hosts",
      operation: "disconnect",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["hosts.disconnect"],
      description: "Disconnect an execution host through the product control plane",
      inputSchema: {
        type: "object",
        properties: { hostId: { type: "string" } },
        required: ["hostId"],
      },
    }),
    catalogEntry({
      id: "hosts.set_default",
      family: "hosts",
      operation: "set_default",
      risk: "medium",
      sideEffects: "writes",
      permissions: ["hosts.set_default"],
      description: "Set the default execution host for future host substrate actions",
      inputSchema: {
        type: "object",
        properties: { hostId: { type: "string" } },
        required: ["hostId"],
      },
    }),
    catalogEntry({
      id: "hosts.health",
      family: "hosts",
      operation: "health",
      risk: "low",
      sideEffects: "reads",
      permissions: ["hosts.health"],
      description: "Read execution host health through the product control plane",
      inputSchema: {
        type: "object",
        properties: { hostId: { type: "string" } },
        required: ["hostId"],
      },
    }),
  ],
  host: [
    catalogEntry({
      id: "host.read",
      family: "host",
      operation: "read",
      risk: "medium",
      sideEffects: "reads",
      permissions: ["host.read"],
      description: "Read content from the selected execution host",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          hostId: { type: "string" },
        },
        required: ["path"],
      },
    }),
    catalogEntry({
      id: "host.write",
      family: "host",
      operation: "write",
      risk: "high",
      sideEffects: "external",
      permissions: ["host.write"],
      description: "Write content to a path on the selected execution host",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          hostId: { type: "string" },
        },
        required: ["path", "content"],
      },
    }),
    catalogEntry({
      id: "host.edit",
      family: "host",
      operation: "edit",
      risk: "high",
      sideEffects: "external",
      permissions: ["host.edit"],
      description: "Apply an edit patch to a path on the selected execution host",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          patch: { type: "string" },
          hostId: { type: "string" },
        },
        required: ["path", "patch"],
      },
    }),
    catalogEntry({
      id: "host.exec",
      family: "host",
      operation: "exec",
      risk: "high",
      sideEffects: "external",
      permissions: ["host.exec"],
      description: "Execute a command on the selected execution host",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string" },
          timeoutMs: { type: "number" },
          hostId: { type: "string" },
        },
        required: ["command"],
      },
    }),
  ],
};

export const BUILTIN_CAPABILITIES: CapabilityDescriptor[] = Object.values(BUILTIN_CATALOG).flat();
export const BUILTIN_EXPORT_HANDOFFS: CapabilityExportHandoff[] =
  descriptorsToCapabilityExportHandoffs(BUILTIN_CAPABILITIES);

function normalizeExecutionHostRecord(input: HostControlPlaneRecordInput): ExecutionHostRecord {
  const connected = input.connected ?? (input.state === "connected" || input.state === "degraded");
  const state = input.state ?? (connected ? "connected" : "disconnected");
  const healthStatus =
    input.health?.status ??
    (state === "connected" ? "healthy" : state === "degraded" ? "degraded" : "unknown");

  return {
    hostId: input.hostId,
    kind: input.kind ?? "local",
    connected,
    state,
    isDefault: input.isDefault === true,
    health: {
      status: healthStatus,
      ...(input.health?.checkedAt ? { checkedAt: input.health.checkedAt } : {}),
    },
  };
}

function finalizeHostControlPlaneSnapshot(
  hosts: ExecutionHostRecord[],
  defaultHostId: string | null,
): HostControlPlaneSnapshot {
  if (defaultHostId && !hosts.some((host) => host.hostId === defaultHostId)) {
    throw new CapabilityError("E_CAPABILITY_NOT_FOUND", `Unknown execution host: ${defaultHostId}`);
  }

  return {
    defaultHostId,
    hosts: hosts.map((host) => ({
      ...host,
      isDefault: defaultHostId != null && host.hostId === defaultHostId,
    })),
  };
}

function mapExecutionHost(
  snapshot: HostControlPlaneSnapshot,
  hostId: string,
  update: (host: ExecutionHostRecord) => ExecutionHostRecord,
  defaultHostId = snapshot.defaultHostId,
): HostControlPlaneSnapshot {
  const exists = snapshot.hosts.some((host) => host.hostId === hostId);
  if (!exists) {
    throw new CapabilityError("E_CAPABILITY_NOT_FOUND", `Unknown execution host: ${hostId}`);
  }

  return finalizeHostControlPlaneSnapshot(
    snapshot.hosts.map((host) => (host.hostId === hostId ? update(host) : host)),
    defaultHostId,
  );
}

export function createHostControlPlaneSnapshot(
  input: HostControlPlaneSnapshotInput = {},
): HostControlPlaneSnapshot {
  const hosts = (input.hosts ?? []).map((host) => normalizeExecutionHostRecord(host));
  const defaultHostId = input.defaultHostId ?? hosts.find((host) => host.isDefault)?.hostId ?? null;

  return finalizeHostControlPlaneSnapshot(hosts, defaultHostId);
}

export function connectExecutionHost(
  snapshot: HostControlPlaneSnapshot,
  hostId: string,
  health: {
    status?: ExecutionHostHealthStatus;
    checkedAt?: string;
  } = {},
): HostControlPlaneSnapshot {
  const healthStatus = health.status ?? "healthy";

  return mapExecutionHost(snapshot, hostId, (host) => ({
    ...host,
    connected: true,
    state: healthStatus === "degraded" ? "degraded" : "connected",
    health: {
      status: healthStatus,
      ...(health.checkedAt ? { checkedAt: health.checkedAt } : {}),
    },
  }));
}

export function disconnectExecutionHost(
  snapshot: HostControlPlaneSnapshot,
  hostId: string,
  health: {
    status?: Extract<ExecutionHostHealthStatus, "unknown" | "degraded">;
    checkedAt?: string;
  } = {},
): HostControlPlaneSnapshot {
  const healthStatus = health.status ?? "unknown";

  return mapExecutionHost(snapshot, hostId, (host) => ({
    ...host,
    connected: false,
    state: "disconnected",
    health: {
      status: healthStatus,
      ...(health.checkedAt ? { checkedAt: health.checkedAt } : {}),
    },
  }));
}

export function setDefaultExecutionHost(
  snapshot: HostControlPlaneSnapshot,
  hostId: string,
): HostControlPlaneSnapshot {
  return mapExecutionHost(snapshot, hostId, (host) => host, hostId);
}

export function resolveHostSubstrateTarget(
  snapshot: HostControlPlaneSnapshot,
  input: {
    hostId?: string | null;
  } = {},
): HostSubstrateTarget {
  if (input.hostId) {
    if (!snapshot.hosts.some((host) => host.hostId === input.hostId)) {
      throw new CapabilityError(
        "E_CAPABILITY_NOT_FOUND",
        `Unknown execution host: ${input.hostId}`,
      );
    }
    return {
      hostId: input.hostId,
      via: "explicit",
    };
  }
  if (snapshot.defaultHostId) {
    return {
      hostId: snapshot.defaultHostId,
      via: "default",
    };
  }
  throw new CapabilityError("E_BAD_INPUT", "host substrate requires hostId or a default host");
}

export function createBootstrapSummary(input: BootstrapSummaryInput = {}): BootstrapSummary {
  const capabilityCatalog = input.capabilities ?? BUILTIN_CAPABILITIES;
  const actionNamespaces = [
    ...new Set(capabilityCatalog.map((entry) => capabilityNamespace(entry.id))),
  ];
  const activeTab =
    input.activeTab && input.activeTab.active !== false
      ? {
          tabId: input.activeTab.tabId,
          url: input.activeTab.url,
          title: input.activeTab.title,
          world: input.activeTab.world,
        }
      : null;

  const runtimeStatus = input.runtime?.status ?? (activeTab ? "healthy" : "empty");
  const runtime: RuntimeBootstrapSummary = {
    status: runtimeStatus,
    mode: "active-tab-only",
    sessionId: input.runtime?.sessionId ?? null,
    activeTab,
    loopState: input.runtime?.loopState ?? null,
    lastError: input.runtime?.lastError ?? null,
    interventions: buildInterventionSummary(input.runtime?.interventions),
    actionCapabilities: {
      total: capabilityCatalog.length,
      namespaces: actionNamespaces,
    },
  };

  const skills: SkillsBootstrapSummary = {
    status: (input.skills?.installedCount ?? 0) > 0 ? "healthy" : "empty",
    installedCount: input.skills?.installedCount ?? 0,
    enabledCount: input.skills?.enabledCount ?? 0,
    trustedCount: input.skills?.trustedCount ?? 0,
    recentChange: input.skills?.recentChange ?? null,
  };

  const hostItems = input.hosts?.items ?? [];
  const connectedCount = hostItems.filter((entry) => entry.connected).length;
  const hasDegradedHost = hostItems.some((entry) => entry.state === "degraded");
  const hostsStatus =
    input.hosts?.status ??
    (hasDegradedHost ? "degraded" : connectedCount > 0 ? "healthy" : "empty");
  const hosts: HostsBootstrapSummary = {
    status: hostsStatus,
    defaultHostId:
      input.hosts?.defaultHostId ?? hostItems.find((entry) => entry.isDefault)?.hostId ?? null,
    totalCount: hostItems.length,
    connectedCount,
    items: hostItems,
  };

  const config = buildConfigBootstrapSummary(input.config);

  const status =
    runtime.status === "degraded" || hosts.status === "degraded"
      ? "degraded"
      : runtime.status === "empty" && skills.status === "empty" && hosts.status === "empty"
        ? "empty"
        : "healthy";

  return {
    status,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runtime,
    skills,
    hosts,
    config,
  };
}

function createResourceDocument<ResourceId extends AiSurfaceResourceId, Payload>(
  id: ResourceId,
  generatedAt: string,
  data: Payload,
): ResourceDocument<ResourceId, Payload> {
  return {
    id,
    primitive: "resource",
    generatedAt,
    data,
  };
}

export function createBootstrapSummaryResources(
  input: BootstrapSummaryInput = {},
): BootstrapSummaryResources {
  const summary = createBootstrapSummary(input);

  return {
    runtime: createResourceDocument("runtime.summary", summary.generatedAt, summary.runtime),
    config: createResourceDocument("config.summary", summary.generatedAt, summary.config),
    skills: createResourceDocument("skills.summary", summary.generatedAt, summary.skills),
    hosts: createResourceDocument("hosts.summary", summary.generatedAt, summary.hosts),
  };
}

export function createRuntimeSummaryResource(
  input: BootstrapSummaryInput = {},
): RuntimeSummaryResource {
  return createBootstrapSummaryResources(input).runtime;
}

export function createConfigSummaryResource(
  input: BootstrapSummaryInput = {},
): ConfigSummaryResource {
  return createBootstrapSummaryResources(input).config;
}

export function createSkillsSummaryResource(
  input: BootstrapSummaryInput = {},
): SkillsSummaryResource {
  return createBootstrapSummaryResources(input).skills;
}

export function createHostsSummaryResource(
  input: BootstrapSummaryInput = {},
): HostsSummaryResource {
  return createBootstrapSummaryResources(input).hosts;
}

export function createAuditTailResource(input: AuditTailResourceInput): AuditTailResource {
  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit >= 0
      ? Math.floor(input.limit)
      : undefined;
  const entries = typeof limit === "number" ? input.entries.slice(-limit) : [...input.entries];
  const lastEntry = entries[entries.length - 1];
  const generatedAt = input.generatedAt ?? lastEntry?.timestamp ?? new Date().toISOString();
  const data: AuditTailSummary = {
    status: entries.length > 0 ? "available" : "empty",
    totalCount: entries.length,
    entries,
  };

  return createResourceDocument("audit.tail", generatedAt, data);
}

export function createInterventionAuditResource(
  input: InterventionAuditResourceInput,
): InterventionAuditResource {
  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit >= 0
      ? Math.floor(input.limit)
      : undefined;
  const entries =
    typeof limit === "number"
      ? input.entries.slice(-limit).map(cloneInterventionAuditEntry)
      : input.entries.map(cloneInterventionAuditEntry);
  const lastEntry = entries[entries.length - 1];
  const generatedAt = input.generatedAt ?? lastEntry?.timestamp ?? new Date().toISOString();
  const data: InterventionAuditSummary = {
    status: entries.length > 0 ? "available" : "empty",
    totalCount: entries.length,
    entries,
  };

  return createResourceDocument("audit.intervention", generatedAt, data);
}

export function readAiSurfaceResource(
  input: ReadAiSurfaceResourceInput,
): AiSurfaceResourceDocument {
  const metadata = getAiSurfaceResourceMetadata(input.resourceId);
  const readers: Record<AiSurfaceResourceId, () => AiSurfaceResourceDocument> = {
    "runtime.summary": () => createRuntimeSummaryResource(input.bootstrap),
    "config.summary": () => createConfigSummaryResource(input.bootstrap),
    "skills.summary": () => createSkillsSummaryResource(input.bootstrap),
    "hosts.summary": () => createHostsSummaryResource(input.bootstrap),
    "audit.tail": () => createAuditTailResource(input.auditTail ?? { entries: [] }),
    "audit.intervention": () =>
      createInterventionAuditResource(input.interventionAudit ?? { entries: [] }),
  };

  return readers[metadata.id]();
}

export function createConfigControlPlane(
  options: CreateConfigControlPlaneOptions = {},
): ConfigControlPlane {
  const state: {
    values: Partial<Record<ConfigResourceField, Record<string, unknown>>>;
    updatedAt: string | null;
  } = {
    values: {},
    updatedAt: null,
  };

  const getBootstrapSummary = async (): Promise<ConfigBootstrapSummary> => {
    const resolved = (await resolveMaybe(options.summary)) ?? {};
    const baseValues = normalizeConfigSurfaceValues(resolved.values);
    const values = mergeConfigValues(baseValues, state.values);
    const hasValues = Object.keys(values).length > 0;
    const status = hasValues || resolved.status === "ready" ? "ready" : "placeholder";
    const fields =
      Array.isArray(resolved.fields) && resolved.fields.length > 0
        ? resolved.fields.filter((field): field is ConfigResourceField =>
            CONFIG_RESOURCE_FIELDS.includes(field),
          )
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
  };

  const update = async (patch: unknown) => {
    const normalizedPatch = normalizeConfigPatch(patch);
    const current = await getBootstrapSummary();
    const values = mergeConfigValues(current.values, normalizedPatch);
    const updatedAt = new Date().toISOString();
    state.values = values;
    state.updatedAt = updatedAt;
    const config: ConfigBootstrapSummary = {
      status: "ready",
      fields: current.fields,
      values,
      note: null,
      updatedAt,
    };

    return {
      config,
    };
  };

  return {
    getBootstrapSummary,
    update,
  };
}

export function createConfigCapabilityProvider(
  configControlPlane: ConfigControlPlane,
): CapabilityFamilyProvider {
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

export function createTabsCapabilityProvider(
  transport: TabsCapabilityTransport,
): CapabilityFamilyProvider {
  return {
    family: "tabs",
    async invoke({ binding, input }) {
      switch (binding.operation) {
        case "list":
          return transport.list();
        case "get_active":
          return transport.getActive("tabs.get_active");
        case "navigate": {
          if (!isPlainObject(input) || typeof input.url !== "string" || !input.url.trim()) {
            throw new CapabilityError("E_BAD_INPUT", "tabs.navigate requires a non-empty url");
          }
          return transport.navigate(input.url.trim());
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

export function getBuiltinsByNamespace(namespace: string): CapabilityDescriptor[] {
  return BUILTIN_CATALOG[namespace] ?? [];
}

export function hasPublicNamespaceCoverage(descriptors: CapabilityDescriptor[]): boolean {
  const namespaces = new Set(descriptors.map((d) => capabilityNamespace(d.id)));
  return PUBLIC_CAPABILITY_NAMESPACES.every((ns) => namespaces.has(ns));
}

function matchesPermission(permission: string, capabilityId: string): boolean {
  if (permission === "*") {
    return true;
  }
  if (permission === capabilityId) {
    return true;
  }
  if (permission.endsWith(".*")) {
    return capabilityId.startsWith(permission.slice(0, -1));
  }
  return false;
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function attachCapability(
  target: Record<string, unknown>,
  parts: string[],
  call: (id: string, input: unknown) => Promise<unknown>,
): void {
  const [head, ...rest] = parts;
  if (!head) {
    return;
  }
  if (rest.length === 0) {
    const fn = (input: unknown) => call(parts.join("."), input);
    target[head] = fn;
    const camelName = toCamelCase(head);
    if (camelName !== head) {
      target[camelName] = fn;
    }
    return;
  }
  const next = (target[head] as Record<string, unknown> | undefined) ?? {};
  target[head] = next;
  attachCapability(next, rest, (suffix, input) => call(`${head}.${suffix}`, input));
}

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input == null || Array.isArray(input)) {
    throw new CapabilityError("E_BAD_INPUT", "Capability input must be an object");
  }
  return input as Record<string, unknown>;
}

let traceCounter = 0;
function generateTraceId(): string {
  traceCounter += 1;
  return `trace-${Date.now()}-${traceCounter}`;
}

interface NestedSkillInvocationEnvelope {
  __skillInvocationMeta: true;
  result: unknown;
  traceId: string;
  parentTraceId?: string;
}

function isNestedSkillInvocationEnvelope(value: unknown): value is NestedSkillInvocationEnvelope {
  return (
    typeof value === "object" &&
    value != null &&
    (value as { __skillInvocationMeta?: unknown }).__skillInvocationMeta === true
  );
}

function resolveGrantedPermissions(
  registry: CapabilityRegistry,
  declaredPermissions: string[],
  parentPermissions?: string[],
): string[] {
  if (!parentPermissions) {
    return [...declaredPermissions];
  }

  return registry
    .list()
    .filter(
      (descriptor) =>
        declaredPermissions.some((permission) => matchesPermission(permission, descriptor.id)) &&
        parentPermissions.some((permission) => matchesPermission(permission, descriptor.id)),
    )
    .map((descriptor) => descriptor.id);
}

export function createSkillRuntimeContext(
  options: SkillRuntimeContextOptions,
): SkillRuntimeContext {
  const trace = options.trace ?? [];
  const depth = options.depth ?? 1;
  const traceId = options.traceId ?? generateTraceId();
  const parentTraceId = options.parentTraceId;

  const allowedDescriptors = options.registry
    .list()
    .filter((descriptor) =>
      options.permissions.some((permission) => matchesPermission(permission, descriptor.id)),
    );

  const invokeBuiltinCapability = async (
    descriptor: CapabilityDescriptor,
    input: unknown,
  ): Promise<unknown> => {
    const { family, operation } = descriptor.executionBinding;
    if (family !== "skills") {
      return options.providers.invoke(descriptor, input, ctx);
    }
    switch (operation) {
      case "invoke": {
        if (depth >= MAX_SKILL_CALL_DEPTH) {
          throw new CapabilityError(
            "E_REENTRANCY_BLOCKED",
            `Skill depth limit exceeded at ${options.skillId}`,
          );
        }
        if (!options.invokeSkill) {
          throw new CapabilityError("E_RUNTIME", "No skill invoker configured for runtime context");
        }
        const payload = asRecord(input);
        const skillId = payload.skillId;
        const action = payload.action;
        if (typeof skillId !== "string" || typeof action !== "string") {
          throw new CapabilityError(
            "E_BAD_INPUT",
            "skills.invoke requires string skillId and action",
          );
        }
        return options.invokeSkill({
          skillId,
          action,
          args: payload.args,
          parentContext: ctx,
        });
      }
      case "list":
        return options.listSkills ? await options.listSkills() : [];
      case "install":
      case "enable":
      case "disable":
      case "uninstall": {
        if (!options.manageSkill) {
          throw new CapabilityError("E_RUNTIME", "No skill manager configured for runtime context");
        }
        const payload = asRecord(input);
        const skillId = payload.skillId;
        if (typeof skillId !== "string") {
          throw new CapabilityError("E_BAD_INPUT", `skills.${operation} requires string skillId`);
        }
        return options.manageSkill({
          skillId,
          action: `skills.${operation}` as SkillControlPlaneAction,
          parentContext: ctx,
        });
      }
      default:
        throw new CapabilityError("E_RUNTIME", `Unsupported skills operation: ${operation}`);
    }
  };

  const call = async (capabilityId: string, input: unknown): Promise<unknown> => {
    const descriptor = options.registry.require(capabilityId);
    if (!options.permissions.some((permission) => matchesPermission(permission, capabilityId))) {
      throw new CapabilityError("E_PERMISSION_DENIED", `Capability not permitted: ${capabilityId}`);
    }
    if (descriptor.risk === "high" && options.confirm) {
      const confirmed = await options.confirm(descriptor, input);
      if (!confirmed) {
        throw new CapabilityError(
          "E_PERMISSION_DENIED",
          `Capability confirmation denied: ${capabilityId}`,
        );
      }
    }
    const entry: CapabilityTraceEntry = {
      traceId,
      parentTraceId,
      capabilityId,
      startedAt: new Date().toISOString(),
      status: "started",
      input,
    };
    trace.push(entry);
    try {
      const output = await invokeBuiltinCapability(descriptor, input);
      if (isNestedSkillInvocationEnvelope(output)) {
        entry.childTraceId = output.traceId;
      }
      const normalizedOutput = isNestedSkillInvocationEnvelope(output) ? output.result : output;
      entry.endedAt = new Date().toISOString();
      entry.status = "succeeded";
      entry.output = normalizedOutput;
      return normalizedOutput;
    } catch (error) {
      entry.endedAt = new Date().toISOString();
      entry.status = "failed";
      entry.errorCode = error instanceof CapabilityError ? error.code : "E_RUNTIME";
      throw error;
    }
  };

  const capabilities: Record<string, unknown> = {};
  for (const descriptor of allowedDescriptors) {
    attachCapability(capabilities, descriptor.id.split("."), call);
  }

  const ctx: SkillRuntimeContext = {
    sessionId: options.sessionId,
    skillId: options.skillId,
    depth,
    traceId,
    parentTraceId,
    permissions: [...options.permissions],
    trace,
    call,
    capabilities,
    runtime: {
      listCapabilities: () => [...allowedDescriptors],
      getCapability: (capabilityId) =>
        allowedDescriptors.find((descriptor) => descriptor.id === capabilityId),
    },
    skills: {
      invoke: async (skillId, action, args) => call("skills.invoke", { skillId, action, args }),
      install: async (skillId) => call("skills.install", { skillId }),
      enable: async (skillId) => call("skills.enable", { skillId }),
      disable: async (skillId) => call("skills.disable", { skillId }),
      uninstall: async (skillId) => call("skills.uninstall", { skillId }),
    },
  };

  return ctx;
}

// ── Skill Invocation Service ──────────────────────────────────────

export interface SkillDefinition {
  id: string;
  permissions: string[];
  handler: (ctx: SkillRuntimeContext, action: string, args: unknown) => Promise<unknown>;
}

export interface SkillInvocationServiceOptions {
  registry: CapabilityRegistry;
  providers: FamilyProviderRegistry;
  confirm?: (descriptor: CapabilityDescriptor, input: unknown) => boolean | Promise<boolean>;
  manageSkill?: (request: SkillManagementRequest) => Promise<unknown>;
}

export interface SkillInvocationResult {
  result: unknown;
  trace: CapabilityTraceEntry[];
  depth: number;
  traceId: string;
  parentTraceId?: string;
}

export class SkillInvocationService {
  readonly #skills = new Map<string, SkillDefinition>();
  readonly #options: SkillInvocationServiceOptions;

  constructor(options: SkillInvocationServiceOptions) {
    this.#options = options;
  }

  register(skill: SkillDefinition): void {
    this.#skills.set(skill.id, skill);
  }

  get(skillId: string): SkillDefinition | undefined {
    return this.#skills.get(skillId);
  }

  list(): SkillDefinition[] {
    return [...this.#skills.values()];
  }

  async invoke(request: {
    sessionId: string;
    skillId: string;
    action: string;
    args: unknown;
    parentContext?: SkillRuntimeContext;
  }): Promise<SkillInvocationResult> {
    const skill = this.#skills.get(request.skillId);
    if (!skill) {
      throw new CapabilityError("E_CAPABILITY_NOT_FOUND", `Unknown skill: ${request.skillId}`);
    }

    const depth = request.parentContext ? request.parentContext.depth + 1 : 1;
    if (depth > MAX_SKILL_CALL_DEPTH) {
      throw new CapabilityError(
        "E_REENTRANCY_BLOCKED",
        `Skill depth limit exceeded at ${request.skillId}.${request.action}`,
      );
    }

    const trace: CapabilityTraceEntry[] = [];
    const grantedPermissions = resolveGrantedPermissions(
      this.#options.registry,
      skill.permissions,
      request.parentContext?.permissions,
    );
    const ctx = createSkillRuntimeContext({
      registry: this.#options.registry,
      providers: this.#options.providers,
      sessionId: request.sessionId,
      skillId: request.skillId,
      permissions: grantedPermissions,
      depth,
      parentTraceId: request.parentContext?.traceId,
      trace,
      confirm: this.#options.confirm,
      listSkills: async () => this.list().map((registeredSkill) => registeredSkill.id),
      manageSkill: this.#options.manageSkill,
      invokeSkill: async (childRequest) => {
        const childResult = await this.invoke({
          sessionId: request.sessionId,
          skillId: childRequest.skillId,
          action: childRequest.action,
          args: childRequest.args,
          parentContext: ctx,
        });

        return {
          __skillInvocationMeta: true,
          result: childResult.result,
          traceId: childResult.traceId,
          parentTraceId: childResult.parentTraceId,
        } satisfies NestedSkillInvocationEnvelope;
      },
    });

    const result = await skill.handler(ctx, request.action, request.args);
    return {
      result,
      trace,
      depth,
      traceId: ctx.traceId,
      parentTraceId: ctx.parentTraceId,
    };
  }
}

// ── Typed Capability Facade ───────────────────────────────────────

type CapabilityFn = (input: unknown) => Promise<unknown>;

export interface BuiltinCapabilityMap {
  memfs: {
    read: CapabilityFn;
    write: CapabilityFn;
    edit: CapabilityFn;
    stat: CapabilityFn;
    list: CapabilityFn;
    mkdir: CapabilityFn;
    rm: CapabilityFn;
    mv: CapabilityFn;
    copy: CapabilityFn;
    stage: CapabilityFn;
    snapshot: CapabilityFn;
    rehydrate: CapabilityFn;
  };
  page: {
    query: CapabilityFn;
    click: CapabilityFn;
    fill: CapabilityFn;
    pressKey: CapabilityFn;
    press_key: CapabilityFn;
    screenshot: CapabilityFn;
  };
  site: {
    fetchWithSession: CapabilityFn;
    fetch_with_session: CapabilityFn;
  };
  tabs: {
    list: CapabilityFn;
    getActive: CapabilityFn;
    get_active: CapabilityFn;
    navigate: CapabilityFn;
  };
  runner: {
    invoke: CapabilityFn;
  };
  skills: {
    invoke: CapabilityFn;
    list: CapabilityFn;
    install: CapabilityFn;
    enable: CapabilityFn;
    disable: CapabilityFn;
    uninstall: CapabilityFn;
  };
  runtime: {
    listCapabilities: CapabilityFn;
    list_capabilities: CapabilityFn;
    getCapability: CapabilityFn;
    get_capability: CapabilityFn;
    captureDiagnostics: CapabilityFn;
    capture_diagnostics: CapabilityFn;
  };
  hosts: {
    list: CapabilityFn;
    get: CapabilityFn;
    connect: CapabilityFn;
    disconnect: CapabilityFn;
    setDefault: CapabilityFn;
    set_default: CapabilityFn;
    health: CapabilityFn;
  };
  host: {
    exec: CapabilityFn;
  };
}

export type PartialBuiltinCapabilityMap = {
  [Namespace in keyof BuiltinCapabilityMap]?: Partial<BuiltinCapabilityMap[Namespace]>;
};

type CamelCase<Value extends string> = Value extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : Value;

type AllowedMethodsFromPermission<
  Namespace extends keyof BuiltinCapabilityMap,
  Permission extends string,
> = Permission extends `${Namespace & string}.${infer Method}`
  ?
      | (Method & keyof BuiltinCapabilityMap[Namespace])
      | (CamelCase<Method & string> & keyof BuiltinCapabilityMap[Namespace])
  : never;

type AllowedMethods<
  Namespace extends keyof BuiltinCapabilityMap,
  Permissions extends readonly string[],
> = "*" extends Permissions[number]
  ? keyof BuiltinCapabilityMap[Namespace]
  : `${Namespace & string}.*` extends Permissions[number]
    ? keyof BuiltinCapabilityMap[Namespace]
    : AllowedMethodsFromPermission<Namespace, Permissions[number] & string>;

export type CapabilityMapForPermissions<Permissions extends readonly string[]> =
  NamespaceCapability<"memfs", Permissions> &
    NamespaceCapability<"page", Permissions> &
    NamespaceCapability<"site", Permissions> &
    NamespaceCapability<"tabs", Permissions> &
    NamespaceCapability<"runner", Permissions> &
    NamespaceCapability<"skills", Permissions> &
    NamespaceCapability<"runtime", Permissions> &
    NamespaceCapability<"hosts", Permissions> &
    NamespaceCapability<"host", Permissions>;

type NamespaceCapability<
  Namespace extends keyof BuiltinCapabilityMap,
  Permissions extends readonly string[],
> = [AllowedMethods<Namespace, Permissions>] extends [never]
  ? Record<never, never>
  : {
      [Key in Namespace]: Pick<
        BuiltinCapabilityMap[Namespace],
        AllowedMethods<Namespace, Permissions>
      >;
    };

export function typedCapabilities(ctx: SkillRuntimeContext): PartialBuiltinCapabilityMap {
  return ctx.capabilities as unknown as PartialBuiltinCapabilityMap;
}

export function typedCapabilitiesForPermissions<Permissions extends readonly string[]>(
  ctx: SkillRuntimeContext,
  _permissions: Permissions,
): CapabilityMapForPermissions<Permissions> {
  return ctx.capabilities as unknown as CapabilityMapForPermissions<Permissions>;
}
