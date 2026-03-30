import {
  AI_SURFACE_RESOURCE_IDS,
  CONFIG_CONTROL_PLANE_ACTIONS,
  type CapabilityDescriptor,
  CapabilityError,
  HOST_CONTROL_PLANE_ACTIONS,
  HOST_SUBSTRATE_ACTIONS,
  PUBLIC_CAPABILITY_NAMESPACES,
  RUNTIME_CONTROL_PLANE_ACTIONS,
  assertCapabilityDescriptor,
  capabilityNamespace,
} from "@bbl-next/contracts";
import {
  AI_SURFACE_BOUNDARY,
  BUILTIN_BOOTSTRAP_RESOURCE_KEYS,
  BUILTIN_CAPABILITIES,
  BUILTIN_CATALOG,
  BUILTIN_EXPORT_HANDOFFS,
  type BuiltinCapabilityMap,
  CapabilityRegistry,
  FamilyProviderRegistry,
  SkillInvocationService,
  connectExecutionHost,
  createAuditTailResource,
  createBootstrapSummary,
  createBootstrapSummaryResources,
  createHostControlPlaneSnapshot,
  createSkillRuntimeContext,
  disconnectExecutionHost,
  dispatchCapabilityCall,
  getBuiltinsByNamespace,
  hasPublicNamespaceCoverage,
  resolveHostSubstrateTarget,
  setDefaultExecutionHost,
  typedCapabilities,
  typedCapabilitiesForPermissions,
} from "@bbl-next/core";
import { describe, expect, it } from "vitest";

function descriptor(overrides: Partial<CapabilityDescriptor> = {}): CapabilityDescriptor {
  return {
    id: "page.click",
    version: 1,
    description: "Click",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    risk: "medium",
    sideEffects: "writes",
    permissions: ["page.click"],
    supportsVerify: true,
    supportsStreaming: false,
    exportable: false,
    executionBinding: {
      family: "page",
      operation: "click",
    },
    ...overrides,
  };
}

describe("core", () => {
  it("covers every public capability namespace in the builtin catalog", () => {
    expect(hasPublicNamespaceCoverage(BUILTIN_CAPABILITIES)).toBe(true);
  });

  it("keeps host substrate and hosts control plane as separate builtins", () => {
    expect(HOST_CONTROL_PLANE_ACTIONS).toEqual([
      "hosts.list",
      "hosts.get",
      "hosts.connect",
      "hosts.disconnect",
      "hosts.set_default",
      "hosts.health",
    ]);
    expect(HOST_SUBSTRATE_ACTIONS).toEqual(["host.read", "host.write", "host.edit", "host.exec"]);
    expect(getBuiltinsByNamespace("hosts").map((entry) => entry.id)).toEqual([
      "hosts.list",
      "hosts.get",
      "hosts.connect",
      "hosts.disconnect",
      "hosts.set_default",
      "hosts.health",
    ]);
    expect(getBuiltinsByNamespace("host").map((entry) => entry.id)).toEqual([
      "host.read",
      "host.write",
      "host.edit",
      "host.exec",
    ]);
  });

  it("keeps config control-plane actions aligned with canonical contracts", () => {
    expect(CONFIG_CONTROL_PLANE_ACTIONS).toEqual(["config.update"]);
    expect(getBuiltinsByNamespace("config").map((entry) => entry.id)).toEqual(["config.update"]);
    expect(getBuiltinsByNamespace("config")).toMatchObject([
      {
        id: "config.update",
        sideEffects: "writes",
      },
    ]);
  });

  it("keeps runtime control-plane actions aligned with canonical contracts", () => {
    expect(getBuiltinsByNamespace("runtime").map((entry) => entry.id)).toEqual([
      ...RUNTIME_CONTROL_PLANE_ACTIONS,
    ]);
  });

  it("keeps tabs automation actions aligned with the active-tab-only boundary", () => {
    expect(getBuiltinsByNamespace("tabs").map((entry) => entry.id)).toEqual([
      "tabs.list",
      "tabs.get_active",
      "tabs.navigate",
    ]);
    expect(getBuiltinsByNamespace("tabs")).toMatchObject([
      {
        id: "tabs.list",
        sideEffects: "reads",
        supportsVerify: false,
      },
      {
        id: "tabs.get_active",
        sideEffects: "reads",
        supportsVerify: false,
        outputSchema: {
          required: ["tabId", "url", "active"],
        },
      },
      {
        id: "tabs.navigate",
        sideEffects: "writes",
        supportsVerify: true,
        inputSchema: {
          required: ["url"],
        },
        outputSchema: {
          required: ["tabId", "url", "active"],
        },
      },
    ]);
  });

  it("keeps page automation actions aligned with the Tier 1 browser boundary", () => {
    expect(getBuiltinsByNamespace("page").map((entry) => entry.id)).toEqual([
      "page.query",
      "page.click",
      "page.fill",
      "page.press_key",
      "page.screenshot",
    ]);
    expect(getBuiltinsByNamespace("page")).toMatchObject([
      {
        id: "page.query",
        sideEffects: "reads",
        supportsVerify: true,
        exportable: true,
      },
      {
        id: "page.click",
        sideEffects: "writes",
        supportsVerify: true,
      },
      {
        id: "page.fill",
        sideEffects: "writes",
        supportsVerify: true,
      },
      {
        id: "page.press_key",
        sideEffects: "writes",
        supportsVerify: true,
        inputSchema: {
          required: ["key"],
        },
        outputSchema: {
          required: ["ok"],
        },
      },
      {
        id: "page.screenshot",
        sideEffects: "reads",
        supportsVerify: false,
        exportable: false,
        outputSchema: {
          required: ["dataUrl", "format"],
        },
      },
    ]);
  });

  it("projects tools from the registry", () => {
    const registry = new CapabilityRegistry([descriptor()]);

    expect(registry.projectTools()).toMatchObject([
      {
        name: "page_click",
        capabilityId: "page.click",
      },
    ]);
  });

  it("keeps bootstrap resources and workflows outside the action capability catalog", () => {
    expect(AI_SURFACE_BOUNDARY).toMatchObject({
      actions: {
        primitive: "action",
      },
      bootstrapResources: ["runtime", "config", "skills", "hosts"],
      workflows: {
        primitive: "workflow",
        invocation: "skills.invoke",
      },
    });
    expect(BUILTIN_BOOTSTRAP_RESOURCE_KEYS).toEqual(["runtime", "config", "skills", "hosts"]);
    expect(
      BUILTIN_CAPABILITIES.some((entry) =>
        BUILTIN_BOOTSTRAP_RESOURCE_KEYS.includes(
          entry.id as (typeof BUILTIN_BOOTSTRAP_RESOURCE_KEYS)[number],
        ),
      ),
    ).toBe(false);
    expect(getBuiltinsByNamespace("runtime")).toMatchObject([
      {
        id: "runtime.list_capabilities",
        description: "List all registered action capabilities",
      },
      {
        id: "runtime.get_capability",
        description: "Get an action capability descriptor by id",
      },
      {
        id: "runtime.capture_diagnostics",
        description: "Capture a read-only runtime diagnostics snapshot without triggering recovery",
      },
      {
        id: "runtime.clear_error",
        description: "Clear the current runtime error state, idempotent if no error is present",
      },
    ]);
  });

  it("locks the lightweight resource ids used by core summary builders", () => {
    expect(AI_SURFACE_RESOURCE_IDS).toEqual([
      "runtime.summary",
      "config.summary",
      "skills.summary",
      "hosts.summary",
      "audit.tail",
    ]);
  });

  it("builds a healthy bootstrap summary bundle", () => {
    const summary = createBootstrapSummary({
      generatedAt: "2026-03-29T00:00:00.000Z",
      activeTab: {
        tabId: 7,
        url: "https://x.com/home",
        title: "Home",
        world: "main",
        active: true,
      },
      runtime: {
        sessionId: "session-1",
        loopState: "idle",
      },
      skills: {
        installedCount: 2,
        enabledCount: 1,
        trustedCount: 1,
        recentChange: "skill.twitter enabled",
      },
      hosts: {
        items: [
          {
            hostId: "local",
            kind: "local",
            connected: true,
            state: "connected",
            isDefault: true,
          },
        ],
      },
    });

    expect(summary).toMatchObject({
      status: "healthy",
      generatedAt: "2026-03-29T00:00:00.000Z",
      runtime: {
        status: "healthy",
        mode: "active-tab-only",
        sessionId: "session-1",
        activeTab: {
          tabId: 7,
          url: "https://x.com/home",
          world: "main",
        },
        loopState: "idle",
        actionCapabilities: {
          total: BUILTIN_CAPABILITIES.length,
        },
      },
      skills: {
        status: "healthy",
        installedCount: 2,
        enabledCount: 1,
        trustedCount: 1,
      },
      hosts: {
        status: "healthy",
        defaultHostId: "local",
        totalCount: 1,
        connectedCount: 1,
      },
      config: {
        status: "placeholder",
      },
    });
  });

  it("projects bootstrap summaries into lightweight resource documents", () => {
    const resources = createBootstrapSummaryResources({
      generatedAt: "2026-03-30T00:00:00.000Z",
      activeTab: {
        tabId: 7,
        url: "https://x.com/home",
        title: "Home",
        world: "main",
        active: true,
      },
      runtime: {
        sessionId: "session-1",
        loopState: "idle",
      },
      config: {
        values: {
          model: {
            provider: "openai",
          },
        },
        updatedAt: "2026-03-30T00:00:00.000Z",
      },
    });

    expect(resources.runtime).toMatchObject({
      id: "runtime.summary",
      primitive: "resource",
      generatedAt: "2026-03-30T00:00:00.000Z",
      data: {
        status: "healthy",
        mode: "active-tab-only",
        sessionId: "session-1",
        activeTab: {
          tabId: 7,
          url: "https://x.com/home",
          title: "Home",
          world: "main",
        },
        loopState: "idle",
        lastError: null,
        actionCapabilities: {
          total: BUILTIN_CAPABILITIES.length,
        },
      },
    });
    expect(resources.runtime.data.actionCapabilities.namespaces).toEqual(
      expect.arrayContaining([...PUBLIC_CAPABILITY_NAMESPACES]),
    );
    expect(resources.config).toMatchObject({
      id: "config.summary",
      primitive: "resource",
      generatedAt: "2026-03-30T00:00:00.000Z",
      data: {
        status: "ready",
        fields: ["model", "automation", "permissions", "preferences"],
        updatedAt: "2026-03-30T00:00:00.000Z",
        values: {
          model: {
            provider: "openai",
          },
        },
      },
    });
    expect(resources.skills.id).toBe("skills.summary");
    expect(resources.hosts.id).toBe("hosts.summary");
  });

  it("builds an audit tail resource document from audit entries", () => {
    const resource = createAuditTailResource({
      generatedAt: "2026-03-30T00:00:03.000Z",
      limit: 2,
      entries: [
        {
          timestamp: "2026-03-30T00:00:01.000Z",
          sessionId: "session-1",
          kind: "hosts.connect",
          hostId: "local",
          status: "connected",
        },
        {
          timestamp: "2026-03-30T00:00:02.000Z",
          sessionId: "session-1",
          kind: "hosts.set_default",
          hostId: "local",
          status: "default_set",
        },
        {
          timestamp: "2026-03-30T00:00:03.000Z",
          sessionId: "session-1",
          kind: "hosts.disconnect",
          hostId: "local",
          status: "disconnected",
        },
      ],
    });

    expect(resource).toEqual({
      id: "audit.tail",
      primitive: "resource",
      generatedAt: "2026-03-30T00:00:03.000Z",
      data: {
        status: "available",
        totalCount: 2,
        entries: [
          {
            timestamp: "2026-03-30T00:00:02.000Z",
            sessionId: "session-1",
            kind: "hosts.set_default",
            hostId: "local",
            status: "default_set",
          },
          {
            timestamp: "2026-03-30T00:00:03.000Z",
            sessionId: "session-1",
            kind: "hosts.disconnect",
            hostId: "local",
            status: "disconnected",
          },
        ],
      },
    });
  });

  it("builds a degraded bootstrap summary bundle when runtime or hosts are degraded", () => {
    const summary = createBootstrapSummary({
      runtime: {
        status: "degraded",
        sessionId: "session-2",
        loopState: "degraded",
        lastError: {
          code: "E_RUNTIME",
          message: "runner unavailable",
        },
      },
      hosts: {
        items: [
          {
            hostId: "local",
            kind: "local",
            connected: false,
            state: "degraded",
            isDefault: true,
          },
        ],
      },
    });

    expect(summary).toMatchObject({
      status: "degraded",
      runtime: {
        status: "degraded",
        sessionId: "session-2",
        loopState: "degraded",
        lastError: {
          code: "E_RUNTIME",
        },
      },
      hosts: {
        status: "degraded",
        connectedCount: 0,
      },
    });
  });

  it("builds a ready config bootstrap summary bundle when config values exist", () => {
    const summary = createBootstrapSummary({
      generatedAt: "2026-03-30T00:00:00.000Z",
      config: {
        status: "ready",
        values: {
          model: {
            provider: "openai",
            defaultModel: "gpt-5.4",
          },
          automation: {
            activeTabOnly: true,
          },
        },
        updatedAt: "2026-03-30T00:00:00.000Z",
      },
    });

    expect(summary.config).toEqual({
      status: "ready",
      fields: ["model", "automation", "permissions", "preferences"],
      values: {
        model: {
          provider: "openai",
          defaultModel: "gpt-5.4",
        },
        automation: {
          activeTabOnly: true,
        },
      },
      note: null,
      updatedAt: "2026-03-30T00:00:00.000Z",
    });
  });

  it("updates host control plane snapshots without expanding host substrate actions", () => {
    const seed = createHostControlPlaneSnapshot({
      hosts: [
        {
          hostId: "local",
          kind: "local",
        },
        {
          hostId: "ssh-prod",
          kind: "remote",
        },
      ],
    });

    expect(seed).toMatchObject({
      defaultHostId: null,
      hosts: [
        {
          hostId: "local",
          connected: false,
          state: "disconnected",
          isDefault: false,
          health: {
            status: "unknown",
          },
        },
        {
          hostId: "ssh-prod",
          connected: false,
          state: "disconnected",
          isDefault: false,
          health: {
            status: "unknown",
          },
        },
      ],
    });

    const connected = connectExecutionHost(seed, "ssh-prod", {
      checkedAt: "2026-03-29T00:00:00.000Z",
    });
    const defaulted = setDefaultExecutionHost(connected, "ssh-prod");
    const disconnected = disconnectExecutionHost(defaulted, "ssh-prod", {
      checkedAt: "2026-03-29T00:01:00.000Z",
    });

    expect(connected).toMatchObject({
      defaultHostId: null,
      hosts: [
        {
          hostId: "local",
          kind: "local",
          connected: false,
          state: "disconnected",
          isDefault: false,
          health: {
            status: "unknown",
          },
        },
        {
          hostId: "ssh-prod",
          kind: "remote",
          connected: true,
          state: "connected",
          isDefault: false,
          health: {
            status: "healthy",
            checkedAt: "2026-03-29T00:00:00.000Z",
          },
        },
      ],
    });
    expect(defaulted).toMatchObject({
      defaultHostId: "ssh-prod",
      hosts: [
        {
          hostId: "local",
          isDefault: false,
        },
        {
          hostId: "ssh-prod",
          isDefault: true,
        },
      ],
    });
    expect(disconnected).toMatchObject({
      defaultHostId: "ssh-prod",
      hosts: [
        {
          hostId: "local",
          isDefault: false,
        },
        {
          hostId: "ssh-prod",
          connected: false,
          state: "disconnected",
          isDefault: true,
          health: {
            status: "unknown",
            checkedAt: "2026-03-29T00:01:00.000Z",
          },
        },
      ],
    });
  });

  it("builds an empty bootstrap summary bundle before any runtime state exists", () => {
    const summary = createBootstrapSummary();

    expect(summary).toMatchObject({
      status: "empty",
      runtime: {
        status: "empty",
        sessionId: null,
        activeTab: null,
      },
      skills: {
        status: "empty",
        installedCount: 0,
      },
      hosts: {
        status: "empty",
        totalCount: 0,
      },
      config: {
        status: "placeholder",
        fields: ["model", "automation", "permissions", "preferences"],
      },
    });
  });

  it("keeps host substrate actions separate from the hosts control plane", () => {
    expect(getBuiltinsByNamespace("host").map((entry) => entry.id)).toEqual([
      "host.read",
      "host.write",
      "host.edit",
      "host.exec",
    ]);
    expect(getBuiltinsByNamespace("hosts").map((entry) => entry.id)).toEqual([
      "hosts.list",
      "hosts.get",
      "hosts.connect",
      "hosts.disconnect",
      "hosts.set_default",
      "hosts.health",
    ]);
    expect(
      getBuiltinsByNamespace("hosts")
        .filter((entry) => entry.sideEffects === "reads")
        .map((entry) => entry.id),
    ).toEqual(["hosts.list", "hosts.get", "hosts.health"]);
    expect(
      getBuiltinsByNamespace("hosts")
        .filter((entry) => entry.sideEffects === "writes")
        .map((entry) => entry.id),
    ).toEqual(["hosts.connect", "hosts.disconnect", "hosts.set_default"]);
  });

  it("routes host substrate requests through explicit hostId or default host", () => {
    const snapshot = createHostControlPlaneSnapshot({
      defaultHostId: "local",
      hosts: [
        {
          hostId: "local",
          kind: "local",
          connected: true,
        },
        {
          hostId: "ssh-prod",
          kind: "remote",
          connected: true,
        },
      ],
    });

    expect(resolveHostSubstrateTarget(snapshot, { hostId: "ssh-prod" })).toEqual({
      hostId: "ssh-prod",
      via: "explicit",
    });
    expect(resolveHostSubstrateTarget(snapshot, {})).toEqual({
      hostId: "local",
      via: "default",
    });
    expect(() =>
      resolveHostSubstrateTarget(
        createHostControlPlaneSnapshot({
          hosts: [
            {
              hostId: "local",
              kind: "local",
            },
          ],
        }),
        {},
      ),
    ).toThrow("host substrate requires hostId or a default host");
  });

  it("projects bridge-side MCP export handoffs from exportable descriptors only", () => {
    const registry = new CapabilityRegistry([
      descriptor({
        id: "runtime.summary",
        risk: "low",
        sideEffects: "reads",
        permissions: ["runtime.summary"],
        exportable: true,
        exportName: "runtime_summary",
        exportRisk: "medium",
        executionBinding: {
          family: "runtime",
          operation: "summary",
        },
      }),
      descriptor({
        id: "page.click",
        exportable: false,
      }),
    ]);

    expect(registry.projectMcpExportHandoffs()).toEqual([
      {
        capabilityId: "runtime.summary",
        exportName: "runtime_summary",
        description: "Click",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        risk: "medium",
        permissions: ["runtime.summary"],
        annotations: {
          sideEffects: "reads",
          supportsVerify: true,
          supportsStreaming: false,
        },
      },
    ]);
  });

  it("dispatches by family provider", async () => {
    const registry = new CapabilityRegistry([
      descriptor(),
      descriptor({
        id: "page.query",
        sideEffects: "reads",
        permissions: ["page.query"],
        executionBinding: {
          family: "page",
          operation: "query",
        },
      }),
    ]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: ({ binding, input }) => ({ operation: binding.operation, input }),
    });

    const ctx = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.page",
      permissions: ["page.*"],
    });

    await expect(ctx.call("page.click", { uid: "u1" })).resolves.toEqual({
      operation: "click",
      input: { uid: "u1" },
    });
    await expect(
      (ctx.capabilities.page as { query(input: unknown): Promise<unknown> }).query({
        text: "Search",
      }),
    ).resolves.toEqual({
      operation: "query",
      input: { text: "Search" },
    });
  });

  it("dispatches a registered capability through the runtime helper", async () => {
    const registry = new CapabilityRegistry([descriptor()]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: ({ binding, input }) => ({ operation: binding.operation, input }),
    });

    await expect(
      dispatchCapabilityCall({
        registry,
        providers,
        sessionId: "s1",
        capabilityId: "page.click",
        input: { uid: "u1" },
        skillId: "kernel.loop",
      }),
    ).resolves.toEqual({
      operation: "click",
      input: { uid: "u1" },
    });
  });

  it("blocks capabilities outside the declared permission set", async () => {
    const registry = new CapabilityRegistry([descriptor()]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: () => "ok",
    });
    const ctx = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.page",
      permissions: ["page.query"],
    });

    await expect(ctx.call("page.click", { uid: "u1" })).rejects.toMatchObject({
      code: "E_PERMISSION_DENIED",
    });
  });

  it("blocks reentrancy deeper than the configured depth limit", async () => {
    const registry = new CapabilityRegistry([
      descriptor(),
      descriptor({
        id: "skills.invoke",
        permissions: ["skills.invoke"],
        executionBinding: {
          family: "skills",
          operation: "invoke",
        },
      }),
    ]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: () => "ok",
    });

    const ctx = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.page",
      permissions: ["page.*", "skills.*"],
      depth: 3,
      invokeSkill: async () => "never",
    });

    await expect(ctx.skills.invoke("skill.child", "run", {})).rejects.toBeInstanceOf(
      CapabilityError,
    );
    await expect(ctx.skills.invoke("skill.child", "run", {})).rejects.toMatchObject({
      code: "E_REENTRANCY_BLOCKED",
    });
  });

  it("records trace entries for capability calls", async () => {
    const registry = new CapabilityRegistry([descriptor()]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: ({ input }) => ({ ok: true, input }),
    });

    const ctx = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.page",
      permissions: ["page.*"],
    });

    await ctx.call("page.click", { uid: "u1" });

    expect(ctx.trace).toHaveLength(1);
    expect(ctx.trace[0]).toMatchObject({
      traceId: ctx.traceId,
      capabilityId: "page.click",
      status: "succeeded",
      output: { ok: true, input: { uid: "u1" } },
    });
  });

  it("assigns a generated traceId to the runtime context and trace entries", async () => {
    const registry = new CapabilityRegistry([descriptor()]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: ({ input }) => ({ ok: true, input }),
    });

    const ctx = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.page",
      permissions: ["page.*"],
    });

    await ctx.call("page.click", { uid: "u1" });

    expect(ctx.traceId).toMatch(/^trace-/);
    expect(ctx.trace[0]?.traceId).toBe(ctx.traceId);
  });

  it("reuses an explicit traceId for the runtime context and trace entries", async () => {
    const registry = new CapabilityRegistry([descriptor()]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: ({ input }) => ({ ok: true, input }),
    });

    const ctx = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.page",
      permissions: ["page.*"],
      traceId: "trace-explicit",
    });

    await ctx.call("page.click", { uid: "u1" });

    expect(ctx.traceId).toBe("trace-explicit");
    expect(ctx.trace[0]?.traceId).toBe("trace-explicit");
  });

  describe("builtin catalog structure", () => {
    it("keeps memfs builtin surface aligned with the BrowserVfs public API", () => {
      const memfsOperations = BUILTIN_CATALOG.memfs
        .map((descriptor) => descriptor.id.replace("memfs.", ""))
        .sort();
      // Explicit list of BrowserVfs public methods that should map to memfs capabilities.
      // Maintained manually to avoid cross-package source import and prototype reflection.
      const expectedVfsMethods = [
        "copy",
        "edit",
        "list",
        "mkdir",
        "mv",
        "read",
        "rehydrate",
        "rm",
        "snapshot",
        "stage",
        "stat",
        "write",
      ];

      expect(memfsOperations).toEqual(expectedVfsMethods);
    });

    it("has an entry for every public namespace", () => {
      for (const ns of PUBLIC_CAPABILITY_NAMESPACES) {
        expect(BUILTIN_CATALOG[ns], `missing namespace: ${ns}`).toBeDefined();
        expect(BUILTIN_CATALOG[ns].length, `empty namespace: ${ns}`).toBeGreaterThan(0);
      }
    });

    it("every builtin passes assertCapabilityDescriptor", () => {
      for (const d of BUILTIN_CAPABILITIES) {
        expect(() => assertCapabilityDescriptor(d)).not.toThrow();
      }
    });

    it("every builtin id starts with its catalog namespace key", () => {
      for (const [ns, descriptors] of Object.entries(BUILTIN_CATALOG)) {
        for (const d of descriptors) {
          expect(capabilityNamespace(d.id)).toBe(ns);
        }
      }
    });

    it("has no duplicate capability ids", () => {
      const ids = BUILTIN_CAPABILITIES.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every builtin has an inputSchema with a type declaration", () => {
      for (const d of BUILTIN_CAPABILITIES) {
        expect(
          d.inputSchema.type || d.inputSchema.$ref || d.inputSchema.oneOf,
          `${d.id} inputSchema missing type`,
        ).toBeTruthy();
      }
    });

    it("read-only capabilities are exportable unless explicitly opted out", () => {
      for (const d of BUILTIN_CAPABILITIES) {
        if ((d.sideEffects === "reads" || d.sideEffects === "none") && d.id !== "page.screenshot") {
          expect(d.exportable, `${d.id} should be exportable`).toBe(true);
        }
      }
      expect(
        BUILTIN_CAPABILITIES.find((descriptor) => descriptor.id === "page.screenshot")?.exportable,
      ).toBe(false);
    });

    it("derives bridge-side MCP handoff data only from exportable builtins", () => {
      expect(BUILTIN_EXPORT_HANDOFFS.map((entry) => entry.capabilityId)).toEqual(
        expect.arrayContaining([
          "memfs.read",
          "memfs.stat",
          "page.query",
          "tabs.list",
          "runtime.list_capabilities",
          "runtime.capture_diagnostics",
        ]),
      );
      expect(BUILTIN_EXPORT_HANDOFFS.map((entry) => entry.capabilityId)).not.toEqual(
        expect.arrayContaining([
          "page.click",
          "page.screenshot",
          "memfs.write",
          "runner.invoke",
          "host.exec",
          "site.fetch_with_session",
        ]),
      );
      expect(BUILTIN_EXPORT_HANDOFFS.every((entry) => entry.exportName.trim().length > 0)).toBe(
        true,
      );
    });

    it("getBuiltinsByNamespace returns correct descriptors", () => {
      const memfs = getBuiltinsByNamespace("memfs");
      expect(memfs.length).toBe(12);
      expect(memfs.every((d) => d.id.startsWith("memfs."))).toBe(true);
      expect(memfs.map((d) => d.id)).toEqual(
        expect.arrayContaining(["memfs.edit", "memfs.stat", "memfs.stage"]),
      );

      expect(getBuiltinsByNamespace("nonexistent")).toEqual([]);
    });

    it("BUILTIN_CAPABILITIES is derived from BUILTIN_CATALOG", () => {
      const fromCatalog = Object.values(BUILTIN_CATALOG).flat();
      expect(BUILTIN_CAPABILITIES).toEqual(fromCatalog);
    });
  });

  describe("SkillInvocationService", () => {
    function buildService() {
      const registry = new CapabilityRegistry([
        descriptor(),
        descriptor({
          id: "memfs.read",
          risk: "low",
          sideEffects: "reads",
          permissions: ["memfs.read"],
          executionBinding: { family: "memfs", operation: "read" },
        }),
        descriptor({
          id: "skills.invoke",
          permissions: ["skills.invoke"],
          executionBinding: { family: "skills", operation: "invoke" },
        }),
      ]);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "page",
        invoke: ({ binding, input }) => ({ operation: binding.operation, input }),
      });
      providers.register({
        family: "memfs",
        invoke: ({ input }) => ({ content: "hello", input }),
      });
      const service = new SkillInvocationService({ registry, providers });
      return { registry, providers, service };
    }

    it("invokes a registered skill and returns result with trace", async () => {
      const { service } = buildService();
      service.register({
        id: "skill.greet",
        permissions: ["page.*"],
        handler: async (ctx, action, args) => {
          const clicked = await ctx.call("page.click", { uid: "btn1" });
          return { action, args, clicked };
        },
      });

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.greet",
        action: "run",
        args: { name: "world" },
      });

      expect(result.result).toMatchObject({
        action: "run",
        args: { name: "world" },
        clicked: { operation: "click", input: { uid: "btn1" } },
      });
      expect(result.trace).toHaveLength(1);
      expect(result.trace[0]).toMatchObject({
        traceId: result.traceId,
        capabilityId: "page.click",
        status: "succeeded",
      });
      expect(result.depth).toBe(1);
      expect(result.parentTraceId).toBeUndefined();
      expect(result.traceId).toMatch(/^trace-/);
    });

    it("throws on unknown skill", async () => {
      const { service } = buildService();

      await expect(
        service.invoke({
          sessionId: "s1",
          skillId: "skill.nonexistent",
          action: "run",
          args: {},
        }),
      ).rejects.toMatchObject({ code: "E_CAPABILITY_NOT_FOUND" });
    });

    it("enforces skill permission isolation", async () => {
      const { service } = buildService();
      service.register({
        id: "skill.readonly",
        permissions: ["memfs.read"],
        handler: async (ctx) => {
          await ctx.call("page.click", { uid: "u1" });
          return "should not reach";
        },
      });

      await expect(
        service.invoke({
          sessionId: "s1",
          skillId: "skill.readonly",
          action: "run",
          args: {},
        }),
      ).rejects.toMatchObject({ code: "E_PERMISSION_DENIED" });
    });

    it("supports nested skill invocation with depth tracking", async () => {
      const { service } = buildService();
      service.register({
        id: "skill.outer",
        permissions: ["page.*", "skills.*"],
        handler: async (ctx) => {
          const inner = await ctx.skills.invoke("skill.inner", "run", {});
          return { inner };
        },
      });
      service.register({
        id: "skill.inner",
        permissions: ["page.*"],
        handler: async (ctx, action) => {
          return { action, depth: ctx.depth };
        },
      });

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.outer",
        action: "run",
        args: {},
      });

      expect(result.result).toMatchObject({
        inner: { action: "run", depth: 2 },
      });
      expect(result.depth).toBe(1);
    });

    it("caps nested skill permissions to the caller grant set", async () => {
      const { service } = buildService();
      service.register({
        id: "skill.parent",
        permissions: ["memfs.read", "skills.invoke"],
        handler: async (ctx) => ctx.skills.invoke("skill.child", "run", {}),
      });
      service.register({
        id: "skill.child",
        permissions: ["memfs.read", "page.click"],
        handler: async (ctx) => ({
          permissions: ctx.permissions,
          canRead: typeof (ctx.capabilities.memfs as { read?: unknown } | undefined)?.read,
          canClick: typeof (ctx.capabilities.page as { click?: unknown } | undefined)?.click,
        }),
      });

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.parent",
        action: "run",
        args: {},
      });

      expect(result.result).toEqual({
        permissions: ["memfs.read"],
        canRead: "function",
        canClick: "undefined",
      });
    });

    it("blocks skill invocation beyond MAX_SKILL_CALL_DEPTH", async () => {
      const { service } = buildService();
      service.register({
        id: "skill.recursive",
        permissions: ["skills.*"],
        handler: async (ctx) => {
          return ctx.skills.invoke("skill.recursive", "run", {});
        },
      });

      await expect(
        service.invoke({
          sessionId: "s1",
          skillId: "skill.recursive",
          action: "run",
          args: {},
        }),
      ).rejects.toMatchObject({ code: "E_REENTRANCY_BLOCKED" });
    });

    it("registers, gets, and lists skills", () => {
      const { service } = buildService();
      service.register({
        id: "skill.a",
        permissions: [],
        handler: async () => null,
      });
      service.register({
        id: "skill.b",
        permissions: [],
        handler: async () => null,
      });

      expect(service.get("skill.a")).toBeDefined();
      expect(service.get("skill.a")!.id).toBe("skill.a");
      expect(service.get("skill.nonexistent")).toBeUndefined();
      expect(service.list()).toHaveLength(2);
    });

    it("keeps child capability traces isolated while recording the parent skills.invoke call", async () => {
      const { service } = buildService();
      let childTraceId: string | undefined;
      let childParentTraceId: string | undefined;
      service.register({
        id: "skill.parent",
        permissions: ["page.*", "skills.*"],
        handler: async (ctx) => {
          await ctx.call("page.click", { uid: "p1" });
          await ctx.skills.invoke("skill.child", "run", {});
          return "done";
        },
      });
      service.register({
        id: "skill.child",
        permissions: ["page.*"],
        handler: async (ctx) => {
          childTraceId = ctx.traceId;
          childParentTraceId = ctx.parentTraceId;
          await ctx.call("page.click", { uid: "c1" });
          return "child done";
        },
      });

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.parent",
        action: "run",
        args: {},
      });

      expect(result.trace).toHaveLength(2);
      expect(result.trace[0]).toMatchObject({
        traceId: result.traceId,
        capabilityId: "page.click",
        input: { uid: "p1" },
      });
      expect(result.trace[1]).toMatchObject({
        traceId: result.traceId,
        capabilityId: "skills.invoke",
        input: {
          skillId: "skill.child",
          action: "run",
          args: {},
        },
        childTraceId,
        output: "child done",
      });
      expect(childTraceId).toMatch(/^trace-/);
      expect(childTraceId).not.toBe(result.traceId);
      expect(childParentTraceId).toBe(result.traceId);
    });

    it("does not let a parent skill borrow a child skill's higher privilege", async () => {
      const { service } = buildService();
      service.register({
        id: "skill.parent",
        permissions: ["skills.invoke"],
        handler: async (ctx) => ctx.skills.invoke("skill.child", "run", {}),
      });
      service.register({
        id: "skill.child",
        permissions: ["page.click"],
        handler: async (ctx) => ctx.call("page.click", { uid: "u1" }),
      });

      await expect(
        service.invoke({
          sessionId: "s1",
          skillId: "skill.parent",
          action: "run",
          args: {},
        }),
      ).rejects.toMatchObject({ code: "E_PERMISSION_DENIED" });
    });
  });

  describe("typedCapabilities", () => {
    it("returns typed accessors for known namespaces", async () => {
      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "memfs",
        invoke: ({ binding, input }) => ({ operation: binding.operation, input }),
      });
      providers.register({
        family: "page",
        invoke: ({ binding, input }) => ({ operation: binding.operation, input }),
      });

      const ctx = createSkillRuntimeContext({
        registry,
        providers,
        sessionId: "s1",
        skillId: "skill.test",
        permissions: ["*"],
      });

      const caps = typedCapabilities(ctx);

      // memfs namespace should have read, write, list, etc.
      expect(caps.memfs).toBeDefined();
      expect(typeof caps.memfs?.read).toBe("function");
      expect(typeof caps.memfs?.write).toBe("function");
      expect(typeof caps.memfs?.edit).toBe("function");
      expect(typeof caps.memfs?.stat).toBe("function");
      expect(typeof caps.memfs?.stage).toBe("function");

      // page namespace should have query, click, fill
      expect(caps.page).toBeDefined();
      expect(typeof caps.page?.click).toBe("function");

      // call through typed accessor should work
      const result = await caps.memfs!.read!({ uri: "mem://test" });
      expect(result).toEqual({ operation: "read", input: { uri: "mem://test" } });
    });

    it("reflects only permitted capabilities", async () => {
      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "memfs",
        invoke: ({ binding, input }) => ({ operation: binding.operation, input }),
      });

      const ctx = createSkillRuntimeContext({
        registry,
        providers,
        sessionId: "s1",
        skillId: "skill.limited",
        permissions: ["memfs.read"],
      });

      const caps = typedCapabilities(ctx);
      expect(caps.memfs).toBeDefined();
      expect(typeof caps.memfs?.read).toBe("function");
      // write is not permitted, so it won't be attached
      expect(caps.memfs?.write).toBeUndefined();
    });

    it("can narrow the facade using declared permissions", async () => {
      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "memfs",
        invoke: ({ binding, input }) => ({ operation: binding.operation, input }),
      });

      const permissions = ["memfs.read"] as const;
      const ctx = createSkillRuntimeContext({
        registry,
        providers,
        sessionId: "s1",
        skillId: "skill.narrowed",
        permissions: [...permissions],
      });

      const caps = typedCapabilitiesForPermissions(ctx, permissions);
      const read: BuiltinCapabilityMap["memfs"]["read"] = caps.memfs.read;
      const result = await read({ uri: "mem://narrowed" });

      expect(result).toEqual({
        operation: "read",
        input: { uri: "mem://narrowed" },
      });
    });

    it("narrowed memfs facade exposes edit/stat/stage when declared", async () => {
      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "memfs",
        invoke: ({ binding, input }) => ({ operation: binding.operation, input }),
      });

      const permissions = ["memfs.edit", "memfs.stat", "memfs.stage"] as const;
      const ctx = createSkillRuntimeContext({
        registry,
        providers,
        sessionId: "s1",
        skillId: "skill.memfs",
        permissions: [...permissions],
      });

      const caps = typedCapabilitiesForPermissions(ctx, permissions);
      const edit: BuiltinCapabilityMap["memfs"]["edit"] = caps.memfs.edit;
      const stat: BuiltinCapabilityMap["memfs"]["stat"] = caps.memfs.stat;
      const stage: BuiltinCapabilityMap["memfs"]["stage"] = caps.memfs.stage;

      await expect(edit({ uri: "mem://workspace/file.txt", patch: "next" })).resolves.toEqual({
        operation: "edit",
        input: { uri: "mem://workspace/file.txt", patch: "next" },
      });
      await expect(stat({ uri: "mem://workspace/file.txt" })).resolves.toEqual({
        operation: "stat",
        input: { uri: "mem://workspace/file.txt" },
      });
      await expect(
        stage({ entries: [{ uri: "mem://workspace/file.txt", content: "next" }] }),
      ).resolves.toEqual({
        operation: "stage",
        input: { entries: [{ uri: "mem://workspace/file.txt", content: "next" }] },
      });
    });
  });
});
