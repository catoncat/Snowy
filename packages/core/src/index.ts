import {
  assertCapabilityDescriptor,
  descriptorToToolContract,
  CapabilityError,
  MAX_SKILL_CALL_DEPTH,
  PUBLIC_CAPABILITY_NAMESPACES,
  capabilityNamespace,
  type CapabilityDescriptor,
  type CapabilityTraceEntry,
  type ExecutionBinding,
  type JsonSchema,
  type ToolContract
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
  };
}

export class FamilyProviderRegistry {
  readonly #providers = new Map<string, CapabilityFamilyProvider>();

  register(provider: CapabilityFamilyProvider): void {
    this.#providers.set(provider.family, provider);
  }

  async invoke(
    descriptor: CapabilityDescriptor,
    input: unknown,
    context?: SkillRuntimeContext
  ): Promise<unknown> {
    const provider = this.#providers.get(descriptor.executionBinding.family);
    if (!provider) {
      throw new CapabilityError(
        "E_RUNTIME",
        `No provider registered for family ${descriptor.executionBinding.family}`
      );
    }
    return provider.invoke({
      descriptor,
      binding: descriptor.executionBinding,
      input,
      context
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
      throw new CapabilityError(
        "E_CAPABILITY_NOT_FOUND",
        `Unknown capability: ${capabilityId}`
      );
    }
    return descriptor;
  }

  projectTools(): ToolContract[] {
    return this.list().map((descriptor) => descriptorToToolContract(descriptor));
  }
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
}

function catalogEntry(input: CatalogEntryInput): CapabilityDescriptor {
  const {
    id, family, operation, risk, sideEffects,
    permissions, description, inputSchema,
    outputSchema = { type: "object" }
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
    supportsVerify: family === "page" || family === "site",
    supportsStreaming: false,
    exportable: sideEffects === "reads" || sideEffects === "none",
    exportName: id,
    exportRisk: risk,
    executionBinding: { family, operation }
  };
}

export const BUILTIN_CATALOG: Readonly<Record<string, CapabilityDescriptor[]>> = {
  memfs: [
    catalogEntry({
      id: "memfs.read", family: "memfs", operation: "read",
      risk: "low", sideEffects: "reads", permissions: ["memfs.read"],
      description: "Read a file from the virtual filesystem",
      inputSchema: { type: "object", properties: { uri: { type: "string" } }, required: ["uri"] }
    }),
    catalogEntry({
      id: "memfs.write", family: "memfs", operation: "write",
      risk: "medium", sideEffects: "writes", permissions: ["memfs.write"],
      description: "Write content to a file in the virtual filesystem",
      inputSchema: { type: "object", properties: { uri: { type: "string" }, content: { type: "string" } }, required: ["uri", "content"] }
    }),
    catalogEntry({
      id: "memfs.edit", family: "memfs", operation: "edit",
      risk: "medium", sideEffects: "writes", permissions: ["memfs.edit"],
      description: "Apply an edit patch to a file in the virtual filesystem",
      inputSchema: { type: "object", properties: { uri: { type: "string" }, patch: { type: "string" } }, required: ["uri", "patch"] }
    }),
    catalogEntry({
      id: "memfs.stat", family: "memfs", operation: "stat",
      risk: "low", sideEffects: "reads", permissions: ["memfs.stat"],
      description: "Read metadata for a virtual filesystem path",
      inputSchema: { type: "object", properties: { uri: { type: "string" } }, required: ["uri"] }
    }),
    catalogEntry({
      id: "memfs.list", family: "memfs", operation: "list",
      risk: "low", sideEffects: "reads", permissions: ["memfs.list"],
      description: "List entries in a virtual filesystem directory",
      inputSchema: { type: "object", properties: { uri: { type: "string" } }, required: ["uri"] }
    }),
    catalogEntry({
      id: "memfs.mkdir", family: "memfs", operation: "mkdir",
      risk: "medium", sideEffects: "writes", permissions: ["memfs.mkdir"],
      description: "Create a directory in the virtual filesystem",
      inputSchema: { type: "object", properties: { uri: { type: "string" } }, required: ["uri"] }
    }),
    catalogEntry({
      id: "memfs.rm", family: "memfs", operation: "rm",
      risk: "medium", sideEffects: "writes", permissions: ["memfs.rm"],
      description: "Remove a file or directory from the virtual filesystem",
      inputSchema: { type: "object", properties: { uri: { type: "string" } }, required: ["uri"] }
    }),
    catalogEntry({
      id: "memfs.mv", family: "memfs", operation: "mv",
      risk: "medium", sideEffects: "writes", permissions: ["memfs.mv"],
      description: "Move a file or directory in the virtual filesystem",
      inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] }
    }),
    catalogEntry({
      id: "memfs.copy", family: "memfs", operation: "copy",
      risk: "medium", sideEffects: "writes", permissions: ["memfs.copy"],
      description: "Copy a file or directory in the virtual filesystem",
      inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] }
    }),
    catalogEntry({
      id: "memfs.stage", family: "memfs", operation: "stage",
      risk: "medium", sideEffects: "writes", permissions: ["memfs.stage"],
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
                content: { type: "string" }
              },
              required: ["uri", "content"]
            }
          }
        },
        required: ["entries"]
      }
    }),
    catalogEntry({
      id: "memfs.snapshot", family: "memfs", operation: "snapshot",
      risk: "medium", sideEffects: "writes", permissions: ["memfs.snapshot"],
      description: "Create a snapshot of a virtual filesystem subtree",
      inputSchema: { type: "object", properties: { source: { type: "string" }, target: { type: "string" } }, required: ["source", "target"] }
    }),
    catalogEntry({
      id: "memfs.rehydrate", family: "memfs", operation: "rehydrate",
      risk: "medium", sideEffects: "writes", permissions: ["memfs.rehydrate"],
      description: "Restore a virtual filesystem subtree from a snapshot",
      inputSchema: { type: "object", properties: { snapshot: { type: "string" }, target: { type: "string" } }, required: ["snapshot", "target"] }
    }),
  ],
  page: [
    catalogEntry({
      id: "page.query", family: "page", operation: "query",
      risk: "low", sideEffects: "reads", permissions: ["page.query"],
      description: "Query elements on the active page",
      inputSchema: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] }
    }),
    catalogEntry({
      id: "page.click", family: "page", operation: "click",
      risk: "medium", sideEffects: "writes", permissions: ["page.click"],
      description: "Click an element on the active page",
      inputSchema: { type: "object", properties: { uid: { type: "string" } }, required: ["uid"] }
    }),
    catalogEntry({
      id: "page.fill", family: "page", operation: "fill",
      risk: "medium", sideEffects: "writes", permissions: ["page.fill"],
      description: "Fill a form field on the active page",
      inputSchema: { type: "object", properties: { uid: { type: "string" }, value: { type: "string" } }, required: ["uid", "value"] }
    }),
  ],
  site: [
    catalogEntry({
      id: "site.fetch_with_session", family: "site", operation: "fetch_with_session",
      risk: "medium", sideEffects: "external", permissions: ["site.fetch_with_session"],
      description: "Fetch a URL using the active tab session cookies",
      inputSchema: { type: "object", properties: { url: { type: "string" }, method: { type: "string" } }, required: ["url"] }
    }),
  ],
  tabs: [
    catalogEntry({
      id: "tabs.list", family: "tabs", operation: "list",
      risk: "low", sideEffects: "reads", permissions: ["tabs.list"],
      description: "List all open browser tabs",
      inputSchema: { type: "object" }
    }),
    catalogEntry({
      id: "tabs.get_active", family: "tabs", operation: "get_active",
      risk: "low", sideEffects: "reads", permissions: ["tabs.get_active"],
      description: "Get metadata of the currently active tab",
      inputSchema: { type: "object" }
    }),
  ],
  runner: [
    catalogEntry({
      id: "runner.invoke", family: "runner", operation: "invoke",
      risk: "medium", sideEffects: "writes", permissions: ["runner.invoke"],
      description: "Invoke a JS module in the isolated runner host",
      inputSchema: { type: "object", properties: { moduleId: { type: "string" }, input: { type: "object" } }, required: ["moduleId"] }
    }),
  ],
  skills: [
    catalogEntry({
      id: "skills.invoke", family: "skills", operation: "invoke",
      risk: "medium", sideEffects: "writes", permissions: ["skills.invoke"],
      description: "Invoke another skill by id and action",
      inputSchema: { type: "object", properties: { skillId: { type: "string" }, action: { type: "string" }, args: { type: "object" } }, required: ["skillId", "action"] }
    }),
    catalogEntry({
      id: "skills.list", family: "skills", operation: "list",
      risk: "low", sideEffects: "reads", permissions: ["skills.list"],
      description: "List all installed skills",
      inputSchema: { type: "object" }
    }),
  ],
  runtime: [
    catalogEntry({
      id: "runtime.list_capabilities", family: "runtime", operation: "list_capabilities",
      risk: "low", sideEffects: "reads", permissions: ["runtime.list_capabilities"],
      description: "List all registered capabilities",
      inputSchema: { type: "object" }
    }),
    catalogEntry({
      id: "runtime.get_capability", family: "runtime", operation: "get_capability",
      risk: "low", sideEffects: "reads", permissions: ["runtime.get_capability"],
      description: "Get a capability descriptor by id",
      inputSchema: { type: "object", properties: { capabilityId: { type: "string" } }, required: ["capabilityId"] }
    }),
  ],
  host: [
    catalogEntry({
      id: "host.exec", family: "host", operation: "exec",
      risk: "high", sideEffects: "external", permissions: ["host.exec"],
      description: "Execute a command on the host machine",
      inputSchema: { type: "object", properties: { command: { type: "string" }, timeoutMs: { type: "number" } }, required: ["command"] }
    }),
  ],
};

export const BUILTIN_CAPABILITIES: CapabilityDescriptor[] = Object.values(BUILTIN_CATALOG).flat();

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

function attachCapability(target: Record<string, unknown>, parts: string[], call: (id: string, input: unknown) => Promise<unknown>): void {
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

function isNestedSkillInvocationEnvelope(
  value: unknown
): value is NestedSkillInvocationEnvelope {
  return (
    typeof value === "object"
    && value != null
    && (value as { __skillInvocationMeta?: unknown }).__skillInvocationMeta === true
  );
}

function resolveGrantedPermissions(
  registry: CapabilityRegistry,
  declaredPermissions: string[],
  parentPermissions?: string[]
): string[] {
  if (!parentPermissions) {
    return [...declaredPermissions];
  }

  return registry
    .list()
    .filter(
      (descriptor) =>
        declaredPermissions.some((permission) => matchesPermission(permission, descriptor.id))
        && parentPermissions.some((permission) => matchesPermission(permission, descriptor.id))
    )
    .map((descriptor) => descriptor.id);
}

export function createSkillRuntimeContext(
  options: SkillRuntimeContextOptions
): SkillRuntimeContext {
  const trace = options.trace ?? [];
  const depth = options.depth ?? 1;
  const traceId = options.traceId ?? generateTraceId();
  const parentTraceId = options.parentTraceId;

  const allowedDescriptors = options.registry
    .list()
    .filter((descriptor) =>
      options.permissions.some((permission) => matchesPermission(permission, descriptor.id))
    );

  const invokeBuiltinCapability = async (
    descriptor: CapabilityDescriptor,
    input: unknown
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
            `Skill depth limit exceeded at ${options.skillId}`
          );
        }
        if (!options.invokeSkill) {
          throw new CapabilityError(
            "E_RUNTIME",
            "No skill invoker configured for runtime context"
          );
        }
        const payload = asRecord(input);
        const skillId = payload.skillId;
        const action = payload.action;
        if (typeof skillId !== "string" || typeof action !== "string") {
          throw new CapabilityError(
            "E_BAD_INPUT",
            "skills.invoke requires string skillId and action"
          );
        }
        return options.invokeSkill({
          skillId,
          action,
          args: payload.args,
          parentContext: ctx
        });
      }
      case "list":
        return options.listSkills ? await options.listSkills() : [];
      default:
        throw new CapabilityError(
          "E_RUNTIME",
          `Unsupported skills operation: ${operation}`
        );
    }
  };

  const call = async (capabilityId: string, input: unknown): Promise<unknown> => {
    const descriptor = options.registry.require(capabilityId);
    if (!options.permissions.some((permission) => matchesPermission(permission, capabilityId))) {
      throw new CapabilityError(
        "E_PERMISSION_DENIED",
        `Capability not permitted: ${capabilityId}`
      );
    }
    if (descriptor.risk === "high" && options.confirm) {
      const confirmed = await options.confirm(descriptor, input);
      if (!confirmed) {
        throw new CapabilityError(
          "E_PERMISSION_DENIED",
          `Capability confirmation denied: ${capabilityId}`
        );
      }
    }
    const entry: CapabilityTraceEntry = {
      traceId,
      parentTraceId,
      capabilityId,
      startedAt: new Date().toISOString(),
      status: "started",
      input
    };
    trace.push(entry);
    try {
      const output = await invokeBuiltinCapability(descriptor, input);
      if (isNestedSkillInvocationEnvelope(output)) {
        entry.childTraceId = output.traceId;
      }
      const normalizedOutput = isNestedSkillInvocationEnvelope(output)
        ? output.result
        : output;
      entry.endedAt = new Date().toISOString();
      entry.status = "succeeded";
      entry.output = normalizedOutput;
      return normalizedOutput;
    } catch (error) {
      entry.endedAt = new Date().toISOString();
      entry.status = "failed";
      entry.errorCode =
        error instanceof CapabilityError ? error.code : "E_RUNTIME";
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
        allowedDescriptors.find((descriptor) => descriptor.id === capabilityId)
    },
    skills: {
      invoke: async (skillId, action, args) =>
        call("skills.invoke", { skillId, action, args })
    }
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
      throw new CapabilityError(
        "E_CAPABILITY_NOT_FOUND",
        `Unknown skill: ${request.skillId}`
      );
    }

    const depth = request.parentContext ? request.parentContext.depth + 1 : 1;
    if (depth > MAX_SKILL_CALL_DEPTH) {
      throw new CapabilityError(
        "E_REENTRANCY_BLOCKED",
        `Skill depth limit exceeded at ${request.skillId}.${request.action}`
      );
    }

    const trace: CapabilityTraceEntry[] = [];
    const grantedPermissions = resolveGrantedPermissions(
      this.#options.registry,
      skill.permissions,
      request.parentContext?.permissions
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
      invokeSkill: async (childRequest) => {
        const childResult = await this.invoke({
          sessionId: request.sessionId,
          skillId: childRequest.skillId,
          action: childRequest.action,
          args: childRequest.args,
          parentContext: ctx
        });

        return {
          __skillInvocationMeta: true,
          result: childResult.result,
          traceId: childResult.traceId,
          parentTraceId: childResult.parentTraceId
        } satisfies NestedSkillInvocationEnvelope;
      }
    });

    const result = await skill.handler(ctx, request.action, request.args);
    return {
      result,
      trace,
      depth,
      traceId: ctx.traceId,
      parentTraceId: ctx.parentTraceId
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
  };
  site: {
    fetchWithSession: CapabilityFn;
    fetch_with_session: CapabilityFn;
  };
  tabs: {
    list: CapabilityFn;
    getActive: CapabilityFn;
    get_active: CapabilityFn;
  };
  runner: {
    invoke: CapabilityFn;
  };
  skills: {
    invoke: CapabilityFn;
    list: CapabilityFn;
  };
  runtime: {
    listCapabilities: CapabilityFn;
    list_capabilities: CapabilityFn;
    getCapability: CapabilityFn;
    get_capability: CapabilityFn;
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
  Permission extends string
> = Permission extends `${Namespace & string}.${infer Method}`
  ?
      | (Method & keyof BuiltinCapabilityMap[Namespace])
      | (CamelCase<Method & string> & keyof BuiltinCapabilityMap[Namespace])
  : never;

type AllowedMethods<
  Namespace extends keyof BuiltinCapabilityMap,
  Permissions extends readonly string[]
> =
  "*" extends Permissions[number]
    ? keyof BuiltinCapabilityMap[Namespace]
    : `${Namespace & string}.*` extends Permissions[number]
      ? keyof BuiltinCapabilityMap[Namespace]
      : AllowedMethodsFromPermission<Namespace, Permissions[number] & string>;

export type CapabilityMapForPermissions<Permissions extends readonly string[]> =
  NamespaceCapability<"memfs", Permissions>
  & NamespaceCapability<"page", Permissions>
  & NamespaceCapability<"site", Permissions>
  & NamespaceCapability<"tabs", Permissions>
  & NamespaceCapability<"runner", Permissions>
  & NamespaceCapability<"skills", Permissions>
  & NamespaceCapability<"runtime", Permissions>
  & NamespaceCapability<"host", Permissions>;

type NamespaceCapability<
  Namespace extends keyof BuiltinCapabilityMap,
  Permissions extends readonly string[]
> = [AllowedMethods<Namespace, Permissions>] extends [never]
  ? {}
  : {
      [Key in Namespace]: Pick<BuiltinCapabilityMap[Namespace], AllowedMethods<Namespace, Permissions>>;
    };

export function typedCapabilities(ctx: SkillRuntimeContext): PartialBuiltinCapabilityMap {
  return ctx.capabilities as unknown as PartialBuiltinCapabilityMap;
}

export function typedCapabilitiesForPermissions<Permissions extends readonly string[]>(
  ctx: SkillRuntimeContext,
  _permissions: Permissions
): CapabilityMapForPermissions<Permissions> {
  return ctx.capabilities as unknown as CapabilityMapForPermissions<Permissions>;
}
