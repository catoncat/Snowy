import {
  AI_SURFACE_ACTION_AUDIENCES,
  AI_SURFACE_BOUNDARY,
  AI_SURFACE_PRIMITIVES,
  AI_SURFACE_RESOURCE_AUDIENCES,
  AI_SURFACE_RESOURCE_IDS,
  type AiSurfaceResourceDocument,
  type AuditTailResource,
  BOOTSTRAP_RESOURCE_KEYS,
  CAPABILITY_CONFIRM_POLICIES,
  CAPABILITY_EXECUTION_TARGETS,
  COMPACTION_REASONS,
  CONFIG_AUDIT_KINDS,
  CONFIG_AUDIT_STATUSES,
  CONFIG_CONTROL_PLANE_ACTIONS,
  CONTROL_PLANE_AUDIT_KINDS,
  CONTROL_PLANE_AUDIT_STATUSES,
  type CapabilityDescriptor,
  type CapabilityTraceEntry,
  type CompactionDraft,
  type CompactionPayload,
  type ConfigSummaryResource,
  DEFAULT_SKILL_VERSION_RETENTION,
  HOST_AUDIT_KINDS,
  HOST_AUDIT_STATUSES,
  HOST_CONTROL_PLANE_ACTIONS,
  HOST_SUBSTRATE_ACTIONS,
  type HostsSummaryResource,
  INTERVENTION_KINDS,
  INTERVENTION_TRIGGERS,
  type InterventionAuditResource,
  type InterventionAuditSummary,
  type InterventionRecord,
  type InterventionRequest,
  type KernelLlmAdapter,
  LOOP_AUDIT_KINDS,
  LOOP_AUDIT_STATUSES,
  LOOP_TERMINAL_STATUSES,
  LOOP_TURN_STATUSES,
  type LabelPayload,
  type LoopTurn,
  type MessagePayload,
  type ModelChangePayload,
  NO_PROGRESS_REASONS,
  type ObservabilityReplayResource,
  PUBLIC_CAPABILITY_NAMESPACES,
  RUNTIME_CONTROL_PLANE_ACTIONS,
  RUN_PHASES,
  RUN_PHASE_TRANSITIONS,
  type RunState,
  type RuntimeDiagnosticsPayload,
  type RuntimeSummaryResource,
  SESSION_ENTRY_TYPES,
  SKILL_AUDIT_KINDS,
  SKILL_AUDIT_STATUSES,
  SKILL_CONTROL_PLANE_ACTIONS,
  type SessionContext,
  type SessionContextMessage,
  type SessionEntry,
  type SessionEntryPayloadMap,
  type SessionHeader,
  type SessionInfoPayload,
  type SessionStorage,
  type SkillsSummaryResource,
  THINKING_LEVELS,
  type ThinkingLevelChangePayload,
  allowedActorsForSkillTransition,
  assertCapabilityDescriptor,
  canActorGrantSkillTrusted,
  canActorTransitionSkillState,
  canTransitionRunPhase,
  canTransitionSkillState,
  capabilityNamespace,
  createSkillLifecycleVersionSurface,
  descriptorToToolContract,
  descriptorsToCapabilityExportHandoffs,
  filterCapabilityDescriptorsByProjection,
  getCapabilityProjectionMetadata,
  grantSkillTrusted,
  isPublicCapabilityNamespace,
  selectLatestTrustedSkillVersion,
  skillVersionRootUri,
  skillVersionUri,
  transitionSkillState,
} from "@bbl-next/contracts";
import * as contractsModule from "@bbl-next/contracts";
import { describe, expect, it } from "vitest";

function buildDescriptor(overrides: Partial<CapabilityDescriptor> = {}): CapabilityDescriptor {
  return {
    id: "page.click",
    version: 1,
    description: "Click an element on the page",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    risk: "medium",
    sideEffects: "writes",
    permissions: ["page.*"],
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

describe("contracts", () => {
  it("accepts a valid capability descriptor", () => {
    const descriptor = buildDescriptor();

    expect(assertCapabilityDescriptor(descriptor)).toEqual(descriptor);
  });

  it("rejects invalid capability ids", () => {
    expect(() => assertCapabilityDescriptor(buildDescriptor({ id: "page-click" }))).toThrow(
      "Invalid capability id",
    );
  });

  it("projects a tool contract from a descriptor", () => {
    const tool = descriptorToToolContract(buildDescriptor());

    expect(tool).toMatchObject({
      name: "page_click",
      capabilityId: "page.click",
      annotations: {
        risk: "medium",
        sideEffects: "writes",
        supportsVerify: true,
        supportsStreaming: false,
      },
    });
  });

  it("derives action projection metadata and exposes it through tool annotations", () => {
    const descriptor = buildDescriptor({
      projection: {
        defaultExposed: false,
        confirmPolicy: "always",
        executionTarget: "runner",
      },
    });

    expect(AI_SURFACE_ACTION_AUDIENCES).toEqual(["chat", "skill", "system", "mcp"]);
    expect(CAPABILITY_CONFIRM_POLICIES).toEqual(["inherit-risk", "always"]);
    expect(CAPABILITY_EXECUTION_TARGETS).toEqual(["browser", "runner", "host"]);
    expect(getCapabilityProjectionMetadata(descriptor)).toEqual({
      audiences: ["chat", "skill", "system"],
      defaultExposed: false,
      confirmPolicy: "always",
      executionTarget: "runner",
    });
    expect(descriptorToToolContract(descriptor)).toMatchObject({
      capabilityId: "page.click",
      annotations: {
        audiences: ["chat", "skill", "system"],
        defaultExposed: false,
        confirmPolicy: "always",
        executionTarget: "runner",
      },
    });
  });

  it("filters descriptors by audience default exposure and execution target", () => {
    const projected = filterCapabilityDescriptorsByProjection(
      [
        buildDescriptor({
          id: "page.click",
          projection: {
            executionTarget: "browser",
          },
        }),
        buildDescriptor({
          id: "runner.invoke",
          sideEffects: "reads",
          exportable: false,
          projection: {
            defaultExposed: false,
            executionTarget: "runner",
          },
          executionBinding: {
            family: "runner",
            operation: "invoke",
          },
        }),
        buildDescriptor({
          id: "host.exec",
          sideEffects: "external",
          exportable: false,
          projection: {
            audiences: ["skill", "system"],
            executionTarget: "host",
          },
          executionBinding: {
            family: "host",
            operation: "exec",
          },
        }),
      ],
      {
        audience: "chat",
        defaultExposedOnly: true,
      },
    );

    expect(projected.map((descriptor) => descriptor.id)).toEqual(["page.click"]);
    expect(
      filterCapabilityDescriptorsByProjection(projected, {
        executionTarget: "browser",
      }).map((descriptor) => descriptor.id),
    ).toEqual(["page.click"]);
  });

  it("requires the mcp audience in addition to exportable for MCP handoffs", () => {
    expect(
      descriptorsToCapabilityExportHandoffs([
        buildDescriptor({
          id: "page.query",
          sideEffects: "reads",
          exportable: true,
          projection: {
            audiences: ["chat", "skill", "system"],
          },
          executionBinding: {
            family: "page",
            operation: "query",
          },
        }),
      ]),
    ).toEqual([]);
  });

  it("locks CapabilityDescriptor and ToolContract to the action primitive", () => {
    expect(AI_SURFACE_PRIMITIVES).toEqual(["action", "resource", "workflow"]);
    expect(BOOTSTRAP_RESOURCE_KEYS).toEqual(["runtime", "config", "skills", "hosts"]);
    expect(AI_SURFACE_BOUNDARY).toEqual({
      actions: {
        primitive: "action",
        descriptorModel: "CapabilityDescriptor",
        toolProjection: "ToolContract",
      },
      bootstrapResources: ["runtime", "config", "skills", "hosts"],
      workflows: {
        primitive: "workflow",
        packaging: "skill-package",
        invocation: "skills.invoke",
      },
    });
  });

  it("locks the lightweight AI surface resource ids and audiences", () => {
    expect(AI_SURFACE_RESOURCE_IDS).toEqual([
      "runtime.summary",
      "runtime.history",
      "config.summary",
      "skills.summary",
      "hosts.summary",
      "audit.tail",
      "audit.intervention",
      "observability.replay",
    ]);
    expect(AI_SURFACE_RESOURCE_AUDIENCES).toEqual(["chat", "skill", "system", "mcp"]);
  });

  it("defines a first-class resource metadata registry with full id coverage", () => {
    const registry = (contractsModule as Record<string, unknown>)
      .AI_SURFACE_RESOURCE_METADATA_REGISTRY;
    expect(Array.isArray(registry)).toBe(true);
    expect((registry as Array<{ id: string }>).map((entry) => entry.id)).toEqual(
      AI_SURFACE_RESOURCE_IDS,
    );
    expect(
      (registry as Array<Record<string, unknown>>).find((entry) => entry.id === "runtime.summary"),
    ).toMatchObject({
      id: "runtime.summary",
      readOwner: "runtime",
      bootstrapKey: "runtime",
      projections: ["resource.read", "runtime.bootstrap"],
      audiences: ["chat", "skill", "system", "mcp"],
    });
    expect(
      (registry as Array<Record<string, unknown>>).find((entry) => entry.id === "runtime.history"),
    ).toMatchObject({
      id: "runtime.history",
      readOwner: "runtime",
      projections: ["resource.read"],
      audiences: ["system"],
    });
    expect(
      (registry as Array<Record<string, unknown>>).find(
        (entry) => entry.id === "audit.intervention",
      ),
    ).toMatchObject({
      id: "audit.intervention",
      readOwner: "audit",
      projections: ["resource.read"],
      audiences: ["chat", "skill", "system", "mcp"],
    });
    expect(
      (registry as Array<Record<string, unknown>>).find(
        (entry) => entry.id === "observability.replay",
      ),
    ).toMatchObject({
      id: "observability.replay",
      readOwner: "audit",
      projections: ["resource.read"],
      audiences: ["chat", "skill", "system", "mcp"],
    });
  });

  it("projects resource metadata by audience", () => {
    const projectForAudience = (contractsModule as Record<string, unknown>)
      .listAiSurfaceResourcesForAudience;
    expect(typeof projectForAudience).toBe("function");
    expect(
      (projectForAudience as (audience: string) => Array<{ id: string }>)("chat").map(
        (entry) => entry.id,
      ),
    ).toEqual(AI_SURFACE_RESOURCE_IDS.filter((resourceId) => resourceId !== "runtime.history"));
    expect(
      (projectForAudience as (audience: string) => Array<{ id: string }>)("system").map(
        (entry) => entry.id,
      ),
    ).toEqual(AI_SURFACE_RESOURCE_IDS);
  });

  it("accepts typed resource documents for runtime summary and audit tail", () => {
    const runtimeResource = {
      id: "runtime.summary",
      primitive: "resource",
      generatedAt: "2026-03-30T00:00:00.000Z",
      data: {
        status: "healthy",
        mode: "active-tab-only",
        sessionId: "session-1",
        activeTab: {
          tabId: 1,
          url: "https://example.com",
        },
        loopState: "idle",
        lastError: null,
        interventions: {
          status: "empty",
          totalCount: 0,
          activeCount: 0,
          recentCount: 0,
          active: [],
          recent: [],
        },
        actionCapabilities: {
          total: 4,
          namespaces: ["runtime", "page"],
        },
      },
    } satisfies RuntimeSummaryResource;

    const auditResource = {
      id: "audit.tail",
      primitive: "resource",
      generatedAt: "2026-03-30T00:00:02.000Z",
      data: {
        status: "available" as const,
        totalCount: 2,
        entries: [
          {
            timestamp: "2026-03-30T00:00:00.000Z",
            sessionId: "session-1",
            kind: "hosts.connect",
            hostId: "local",
            status: "connected",
          },
          {
            timestamp: "2026-03-30T00:00:02.000Z",
            sessionId: "session-1",
            kind: "config.update",
            changedFields: ["model"],
            status: "updated",
          },
          {
            timestamp: "2026-03-30T00:00:03.000Z",
            sessionId: "session-1",
            kind: "intervention.escalation",
            interventionId: "ivr:session-1:verify",
            status: "attention_required",
            escalation: {
              reason: "stale",
              thresholdMs: 30_000,
            },
          },
        ],
      },
    } satisfies AuditTailResource;

    const configResource = {
      id: "config.summary",
      primitive: "resource",
      generatedAt: "2026-03-30T00:00:03.000Z",
      data: {
        status: "ready" as const,
        fields: ["model", "automation"],
        values: { model: { provider: "openai" } },
        note: null,
        updatedAt: "2026-03-30T00:00:03.000Z",
      },
    } satisfies ConfigSummaryResource;

    const skillsResource = {
      id: "skills.summary",
      primitive: "resource",
      generatedAt: "2026-03-30T00:00:04.000Z",
      data: {
        status: "healthy" as const,
        installedCount: 1,
        enabledCount: 1,
        trustedCount: 1,
        recentChange: "skills.enable",
      },
    } satisfies SkillsSummaryResource;

    const hostsResource = {
      id: "hosts.summary",
      primitive: "resource",
      generatedAt: "2026-03-30T00:00:05.000Z",
      data: {
        status: "healthy" as const,
        defaultHostId: "local",
        connectedCount: 1,
        totalCount: 1,
        items: [
          {
            hostId: "local",
            kind: "local" as const,
            connected: true,
            isDefault: true,
            state: "connected" as const,
          },
        ],
      },
    } satisfies HostsSummaryResource;

    const interventionAuditResource = {
      id: "audit.intervention",
      primitive: "resource",
      generatedAt: "2026-03-30T00:00:06.000Z",
      data: {
        status: "available" as const,
        totalCount: 1,
        entries: [
          {
            eventId: "evt-1",
            timestamp: "2026-03-30T00:00:06.000Z",
            sessionId: "session-1",
            interventionId: "int-1",
            kind: "confirm",
            trigger: "verify_failed",
            status: "requested",
            details: {
              requestId: "req-1",
              reason: "verification_failed",
            },
          },
        ],
      },
    } satisfies InterventionAuditResource;

    const replayResource = {
      id: "observability.replay",
      primitive: "resource",
      generatedAt: "2026-03-30T00:00:07.000Z",
      data: {
        status: "available" as const,
        totalCount: 2,
        continuityCount: 1,
        entries: [
          {
            id: "cmp-1",
            timestamp: "2026-03-30T00:00:00.500Z",
            sessionId: "session-1",
            subsystem: "session" as const,
            eventType: "session.compaction",
            status: "info" as const,
            summary: "Earlier turns compacted",
            continuity: {
              kind: "compaction" as const,
              entryId: "cmp-1",
              firstKeptEntryId: "entry-9",
              previousSummary: "Older summary",
            },
          },
          {
            id: "loop-1",
            timestamp: "2026-03-30T00:00:06.000Z",
            sessionId: "session-1",
            subsystem: "loop" as const,
            eventType: "loop.step",
            status: "succeeded" as const,
            summary: "tabs.navigate succeeded",
            capabilityId: "tabs.navigate",
            stepIndex: 0,
          },
        ],
      },
    } satisfies ObservabilityReplayResource;

    const resourceDocs = [
      runtimeResource,
      auditResource,
      configResource,
      skillsResource,
      hostsResource,
      interventionAuditResource,
      replayResource,
    ] satisfies AiSurfaceResourceDocument[];

    expect(resourceDocs[0]?.id).toBe("runtime.summary");
    expect(auditResource.data.entries[0]?.kind).toBe("hosts.connect");
    expect(auditResource.data.entries[1]?.kind).toBe("config.update");
    expect(resourceDocs[5]?.id).toBe("audit.intervention");
    expect(resourceDocs[6]?.id).toBe("observability.replay");
  });

  it("accepts a typed runtime diagnostics payload with kernel-owned snapshot", () => {
    const diagnostics = {
      capturedAt: "2026-04-09T07:45:00.000Z",
      status: "healthy" as const,
      kernel: {
        session: {
          id: "session-1",
          createdAt: "2026-04-09T07:00:00.000Z",
          title: "mv3-shell runtime session",
          model: "gpt-4.1-mini",
        },
        run: {
          phase: "running" as const,
          queuedPrompts: {
            steer: 1,
            followUp: 0,
          },
          retry: {
            active: true,
            attempt: 1,
            maxAttempts: 2,
          },
        },
        loop: {
          stepCount: 3,
          noProgress: null,
          maxSteps: 50,
        },
        interventions: {
          status: "requested" as const,
          totalCount: 1,
          activeCount: 1,
          recentCount: 1,
          active: [
            {
              id: "ivr-1",
              kind: "takeover" as const,
              trigger: "verify_failed" as const,
              status: "requested" as const,
              title: "Need manual verification",
              message: "Finish the login flow manually.",
              sessionId: "session-1",
              requestedAt: "2026-04-09T07:44:00.000Z",
              updatedAt: "2026-04-09T07:44:00.000Z",
              expiresAt: null,
              escalation: null,
            },
          ],
          recent: [],
        },
        provider: {
          route: {
            status: "configured" as const,
            profile: "default",
            provider: "openai_compatible",
            llmModel: "gpt-4.1-mini",
            orderedProfiles: ["default"],
          },
          registered: [
            {
              id: "openai_compatible",
              healthStatus: "healthy" as const,
              capabilities: ["chat.completions"],
            },
          ],
        },
      },
      bridge: {
        hostReady: true,
        offscreenPresent: true,
        offscreenPath: "src/offscreen.html",
      },
      runner: {
        reachable: true,
        ready: true,
        health: {
          status: "idle",
          inflightCount: 0,
        },
      },
      site: {
        status: "healthy" as const,
        tabId: 21,
        world: "main" as const,
        snapshot: {
          installs: 1,
          invocations: 2,
        },
      },
      debug: {
        error: {
          status: "empty" as const,
          lastError: null,
          clearedAt: null,
          recentAudit: {
            status: "empty" as const,
            totalCount: 0,
            entries: [],
          },
        },
      },
    } satisfies RuntimeDiagnosticsPayload;

    expect(diagnostics.kernel.provider.route).toMatchObject({
      status: "configured",
      profile: "default",
      provider: "openai_compatible",
    });
  });

  it("locks the minimal execution host control plane action set", () => {
    expect(HOST_CONTROL_PLANE_ACTIONS).toEqual([
      "hosts.list",
      "hosts.get",
      "hosts.connect",
      "hosts.disconnect",
      "hosts.set_default",
      "hosts.health",
    ]);
  });

  it("locks the unified control-plane audit vocabulary", () => {
    expect(HOST_AUDIT_KINDS).toEqual(["hosts.connect", "hosts.disconnect", "hosts.set_default"]);
    expect(HOST_AUDIT_STATUSES).toEqual(["connected", "disconnected", "default_set", "failed"]);
    expect(CONFIG_AUDIT_KINDS).toEqual(["config.update"]);
    expect(CONFIG_AUDIT_STATUSES).toEqual(["updated"]);
    expect(SKILL_AUDIT_KINDS).toEqual([
      "skills.install",
      "skills.enable",
      "skills.disable",
      "skills.uninstall",
    ]);
    expect(SKILL_AUDIT_STATUSES).toEqual(["installed", "enabled", "disabled", "archived"]);
    expect(LOOP_AUDIT_KINDS).toEqual(["loop.step"]);
    expect(LOOP_AUDIT_STATUSES).toEqual(["executed", "failed"]);
    expect(CONTROL_PLANE_AUDIT_KINDS).toEqual([
      "hosts.connect",
      "hosts.disconnect",
      "hosts.set_default",
      "config.update",
      "skills.install",
      "skills.enable",
      "skills.disable",
      "skills.uninstall",
      "loop.step",
      "intervention.escalation",
    ]);
    expect(CONTROL_PLANE_AUDIT_STATUSES).toEqual([
      "connected",
      "disconnected",
      "default_set",
      "failed",
      "updated",
      "installed",
      "enabled",
      "disabled",
      "archived",
      "executed",
      "failed",
      "attention_required",
      "timed_out",
    ]);
  });

  it("locks the intervention vocabulary and request shape", () => {
    expect(INTERVENTION_KINDS).toEqual(["confirm", "takeover", "input"]);
    expect(INTERVENTION_TRIGGERS).toEqual(["confirm_policy", "verify_failed", "runtime_blocked"]);

    const request = {
      id: "ivr:twitter.login:complete_login:verify_failed:7:1",
      kind: "takeover",
      trigger: "verify_failed",
      status: "requested",
      title: "Need human takeover",
      message: "CAPTCHA blocks the automation flow.",
      skillId: "twitter.login",
      action: "complete_login",
      tabId: 7,
      payload: {
        verifier: "login_complete",
      },
    } satisfies InterventionRequest;

    expect(request.kind).toBe("takeover");
    expect(request.trigger).toBe("verify_failed");

    const record = {
      ...request,
      sessionId: "session-1",
      requestedAt: "2026-03-31T00:00:00.000Z",
      updatedAt: "2026-03-31T00:00:01.000Z",
      expiresAt: "2026-03-31T00:05:00.000Z",
      escalation: null,
      resolution: {
        verifier: "login_complete",
      },
    } satisfies InterventionRecord;

    const audit = {
      status: "available",
      totalCount: 1,
      entries: [
        {
          eventId: "ive-1",
          interventionId: record.id,
          sessionId: record.sessionId,
          status: "requested",
          timestamp: "2026-03-31T00:00:00.000Z",
          kind: record.kind,
          trigger: record.trigger,
        },
      ],
    } satisfies InterventionAuditSummary;

    expect(audit.entries[0]?.interventionId).toBe(record.id);
  });

  it("locks the minimal config control plane action set", () => {
    expect(CONFIG_CONTROL_PLANE_ACTIONS).toEqual(["config.update"]);
  });

  it("locks the minimal runtime control plane action set", () => {
    expect(RUNTIME_CONTROL_PLANE_ACTIONS).toEqual([
      "runtime.list_capabilities",
      "runtime.get_capability",
      "runtime.capture_diagnostics",
      "runtime.clear_error",
    ]);
  });

  it("locks the skill lifecycle control-plane action set", () => {
    expect(SKILL_CONTROL_PLANE_ACTIONS).toEqual([
      "skills.install",
      "skills.enable",
      "skills.disable",
      "skills.uninstall",
    ]);
  });

  it("locks the minimal execution host substrate action set", () => {
    expect(HOST_SUBSTRATE_ACTIONS).toEqual(["host.read", "host.write", "host.edit", "host.exec"]);
  });

  it("enforces the lifecycle state machine", () => {
    expect(canTransitionSkillState("draft", "staged")).toBe(true);
    expect(canTransitionSkillState("draft", "enabled")).toBe(false);

    expect(transitionSkillState({ status: "installed", trusted: false }, "enabled")).toEqual({
      status: "enabled",
      trusted: false,
    });
  });

  it("allows all legal skill status transitions", () => {
    const legalTransitions: [string, string][] = [
      ["draft", "staged"],
      ["draft", "archived"],
      ["staged", "installed"],
      ["staged", "archived"],
      ["installed", "enabled"],
      ["installed", "archived"],
      ["enabled", "disabled"],
      ["enabled", "archived"],
      ["disabled", "enabled"],
      ["disabled", "archived"],
    ];
    for (const [from, to] of legalTransitions) {
      expect(canTransitionSkillState(from as any, to as any)).toBe(true);
    }
    expect(legalTransitions).toHaveLength(10);
  });

  it("blocks all illegal skill status transitions", () => {
    const allStatuses: string[] = [
      "draft",
      "staged",
      "installed",
      "enabled",
      "disabled",
      "archived",
    ];
    const legalSet = new Set([
      "draft->staged",
      "draft->archived",
      "staged->installed",
      "staged->archived",
      "installed->enabled",
      "installed->archived",
      "enabled->disabled",
      "enabled->archived",
      "disabled->enabled",
      "disabled->archived",
    ]);
    const illegalTransitions: [string, string][] = [];
    for (const from of allStatuses) {
      for (const to of allStatuses) {
        if (from === to) continue;
        if (!legalSet.has(`${from}->${to}`)) {
          illegalTransitions.push([from, to]);
        }
      }
    }
    for (const [from, to] of illegalTransitions) {
      expect(canTransitionSkillState(from as any, to as any)).toBe(false);
    }
    // Verify we actually checked a meaningful number of illegal transitions
    expect(illegalTransitions.length).toBeGreaterThanOrEqual(20);
  });

  it("transitionSkillState throws on illegal transitions", () => {
    const illegals: [string, string][] = [
      ["archived", "draft"],
      ["enabled", "installed"],
      ["disabled", "draft"],
      ["staged", "enabled"],
      ["draft", "enabled"],
    ];
    for (const [from, to] of illegals) {
      expect(() =>
        transitionSkillState({ status: from as any, trusted: false }, to as any),
      ).toThrow(`Illegal skill transition: ${from} -> ${to}`);
    }
  });

  it("resets trusted flag on transitions away from enabled", () => {
    const result = transitionSkillState({ status: "enabled", trusted: true }, "disabled");
    expect(result).toEqual({ status: "disabled", trusted: false });

    const archived = transitionSkillState({ status: "enabled", trusted: true }, "archived");
    expect(archived).toEqual({ status: "archived", trusted: false });
  });

  it("preserves trusted flag when transitioning to enabled", () => {
    // disabled→enabled preserves the existing trusted value
    const result = transitionSkillState({ status: "disabled", trusted: false }, "enabled");
    expect(result).toEqual({ status: "enabled", trusted: false });
  });

  it("archived is a terminal state with no outgoing transitions", () => {
    const allStatuses: string[] = [
      "draft",
      "staged",
      "installed",
      "enabled",
      "disabled",
      "archived",
    ];
    for (const to of allStatuses) {
      if (to === "archived") continue;
      expect(canTransitionSkillState("archived", to as any)).toBe(false);
    }
  });

  it("keeps trusted as an enabled-only flag", () => {
    const trusted = grantSkillTrusted({ status: "enabled", trusted: false });

    expect(trusted).toEqual({ status: "enabled", trusted: true });
    expect(() => grantSkillTrusted({ status: "installed", trusted: false })).toThrow(
      "Trusted flag can only be granted while enabled",
    );
  });

  it("rejects descriptors whose inputSchema lacks a type declaration", () => {
    expect(() => assertCapabilityDescriptor(buildDescriptor({ inputSchema: {} }))).toThrow(
      "inputSchema must declare a type",
    );
  });

  it("rejects descriptors whose outputSchema lacks a type declaration", () => {
    expect(() => assertCapabilityDescriptor(buildDescriptor({ outputSchema: {} }))).toThrow(
      "outputSchema must declare a type",
    );
  });

  it("accepts schemas using $ref or combinators instead of type", () => {
    expect(() =>
      assertCapabilityDescriptor(buildDescriptor({ inputSchema: { $ref: "#/definitions/Foo" } })),
    ).not.toThrow();
    expect(() =>
      assertCapabilityDescriptor(
        buildDescriptor({ outputSchema: { oneOf: [{ type: "string" }, { type: "number" }] } }),
      ),
    ).not.toThrow();
  });

  it("extracts the namespace from a capability id", () => {
    expect(capabilityNamespace("page.click")).toBe("page");
    expect(capabilityNamespace("memfs.read")).toBe("memfs");
    expect(capabilityNamespace("runtime.list_capabilities")).toBe("runtime");
  });

  it("validates public namespace membership", () => {
    expect(isPublicCapabilityNamespace("memfs")).toBe(true);
    expect(isPublicCapabilityNamespace("page")).toBe(true);
    expect(isPublicCapabilityNamespace("unknown")).toBe(false);
  });

  it("exports all expected public namespaces", () => {
    expect(PUBLIC_CAPABILITY_NAMESPACES).toEqual([
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
    ]);
  });

  it("allows trace entries to link parent and child skill invocations", () => {
    const entry: CapabilityTraceEntry = {
      traceId: "trace-root",
      parentTraceId: "trace-parent",
      childTraceId: "trace-child",
      capabilityId: "skills.invoke",
      startedAt: "2026-03-29T00:00:00.000Z",
      status: "started",
      input: {
        skillId: "skill.child",
        action: "run",
      },
    };

    expect(entry.traceId).toBe("trace-root");
    expect(entry.parentTraceId).toBe("trace-parent");
    expect(entry.childTraceId).toBe("trace-child");
  });

  it("limits lifecycle transitions by actor according to the engine boundary", () => {
    expect(allowedActorsForSkillTransition("draft", "staged")).toEqual(["agent"]);
    expect(canActorTransitionSkillState("agent", "draft", "staged")).toBe(true);
    expect(canActorTransitionSkillState("user", "draft", "staged")).toBe(false);

    expect(canActorTransitionSkillState("user", "installed", "enabled")).toBe(true);
    expect(canActorTransitionSkillState("system", "installed", "enabled")).toBe(true);
    expect(canActorTransitionSkillState("agent", "installed", "enabled")).toBe(false);

    expect(canActorTransitionSkillState("user", "enabled", "disabled")).toBe(true);
    expect(canActorTransitionSkillState("system", "disabled", "enabled")).toBe(true);
    expect(canActorTransitionSkillState("agent", "enabled", "archived")).toBe(false);
    expect(canActorTransitionSkillState("system", "enabled", "archived")).toBe(true);

    expect(canActorGrantSkillTrusted("user")).toBe(true);
    expect(canActorGrantSkillTrusted("system")).toBe(false);
  });

  it("builds a lifecycle/version surface with canonical version policy and latest trusted rollback", () => {
    const trustedVersion = {
      versionId: "2026-03-29T00:00:00.000Z",
      uri: skillVersionUri("twitter", "2026-03-29T00:00:00.000Z"),
      createdAt: "2026-03-29T00:00:00.000Z",
      trusted: true,
    };
    const untrustedVersion = {
      versionId: "2026-03-29T00:01:00.000Z",
      uri: skillVersionUri("twitter", "2026-03-29T00:01:00.000Z"),
      createdAt: "2026-03-29T00:01:00.000Z",
      trusted: false,
    };

    expect(selectLatestTrustedSkillVersion([untrustedVersion, trustedVersion])).toEqual(
      trustedVersion,
    );

    const surface = createSkillLifecycleVersionSurface({
      skillId: "twitter",
      lifecycle: { status: "enabled", trusted: true },
      activeVersion: untrustedVersion,
      versions: [untrustedVersion, trustedVersion],
    });

    expect(surface).toEqual({
      skillId: "twitter",
      lifecycle: { status: "enabled", trusted: true },
      activeVersion: untrustedVersion,
      rollbackTarget: trustedVersion,
      policy: {
        snapshotRootUri: skillVersionRootUri("twitter"),
        versionFormat: "iso-timestamp",
        retention: DEFAULT_SKILL_VERSION_RETENTION,
        rollbackTarget: "latest_trusted",
        rollbackTriggers: ["verifier_failed_with_confirmation", "release_gate_failed"],
      },
    });
  });

  // ── Session / Run / Loop / Compaction contract tests ──

  describe("session model", () => {
    it("exports all session entry types", () => {
      expect(SESSION_ENTRY_TYPES).toEqual([
        "message",
        "compaction",
        "thinking_level_change",
        "model_change",
        "label",
        "session_info",
      ]);
    });

    it("accepts a valid SessionHeader", () => {
      const header: SessionHeader = {
        id: "s-001",
        createdAt: "2026-03-29T00:00:00.000Z",
        title: "Test session",
      };
      expect(header.id).toBe("s-001");
      expect(header.parentSessionId).toBeUndefined();
    });

    it("accepts a valid SessionEntry with message payload", () => {
      const payload: MessagePayload = {
        role: "user",
        text: "Hello",
      };
      const entry: SessionEntry = {
        entryId: "e-001",
        type: "message",
        timestamp: "2026-03-29T00:00:00.000Z",
        payload,
      };
      expect(entry.type).toBe("message");
      expect((entry.payload as MessagePayload).role).toBe("user");
    });

    it("accepts a valid SessionEntry with compaction payload", () => {
      const payload: CompactionPayload = {
        reason: "threshold",
        summary: "User discussed project setup.",
        firstKeptEntryId: "e-005",
        tokensBefore: 12000,
        tokensAfter: 3000,
      };
      const entry: SessionEntry = {
        entryId: "e-010",
        type: "compaction",
        timestamp: "2026-03-29T00:01:00.000Z",
        payload,
      };
      expect(entry.type).toBe("compaction");
      expect((entry.payload as CompactionPayload).reason).toBe("threshold");
    });

    it("accepts a valid thinking_level_change entry", () => {
      const payload: ThinkingLevelChangePayload = { level: "high" };
      const entry: SessionEntry = {
        entryId: "e-020",
        type: "thinking_level_change",
        timestamp: "2026-04-09T00:00:00.000Z",
        payload,
      };
      expect(entry.type).toBe("thinking_level_change");
      expect((entry.payload as ThinkingLevelChangePayload).level).toBe("high");
      expect(THINKING_LEVELS).toEqual(["low", "medium", "high"]);
    });

    it("accepts a valid model_change entry", () => {
      const payload: ModelChangePayload = {
        from: "gpt-4o",
        to: "claude-opus-4-6",
        reason: "escalation",
      };
      const entry: SessionEntry = {
        entryId: "e-021",
        type: "model_change",
        timestamp: "2026-04-09T00:00:00.000Z",
        payload,
      };
      expect(entry.type).toBe("model_change");
      expect((entry.payload as ModelChangePayload).from).toBe("gpt-4o");
      expect((entry.payload as ModelChangePayload).to).toBe("claude-opus-4-6");
      expect((entry.payload as ModelChangePayload).reason).toBe("escalation");
    });

    it("accepts a valid label entry", () => {
      const payload: LabelPayload = { label: "debugging", color: "#ff0000" };
      const entry: SessionEntry = {
        entryId: "e-022",
        type: "label",
        timestamp: "2026-04-09T00:00:00.000Z",
        payload,
      };
      expect(entry.type).toBe("label");
      expect((entry.payload as LabelPayload).label).toBe("debugging");
      expect((entry.payload as LabelPayload).color).toBe("#ff0000");
    });

    it("accepts a valid session_info entry", () => {
      const payload: SessionInfoPayload = { key: "workspaceId", value: "ws-001" };
      const entry: SessionEntry = {
        entryId: "e-023",
        type: "session_info",
        timestamp: "2026-04-09T00:00:00.000Z",
        payload,
      };
      expect(entry.type).toBe("session_info");
      expect((entry.payload as SessionInfoPayload).key).toBe("workspaceId");
      expect((entry.payload as SessionInfoPayload).value).toBe("ws-001");
    });

    it("SessionEntryPayloadMap covers all entry types", () => {
      const allTypes: readonly string[] = SESSION_ENTRY_TYPES;
      const mapKeys: Array<keyof SessionEntryPayloadMap> = [
        "message",
        "compaction",
        "thinking_level_change",
        "model_change",
        "label",
        "session_info",
      ];
      expect(mapKeys).toEqual(expect.arrayContaining([...allTypes]));
      expect(allTypes).toEqual(expect.arrayContaining(mapKeys));
    });

    it("accepts a valid SessionContext with compaction summary", () => {
      const msg: SessionContextMessage = {
        role: "compactionSummary",
        content: "Previously: user discussed setup.",
        entryId: "e-010",
      };
      const ctx: SessionContext = {
        sessionId: "s-001",
        entries: [],
        messages: [msg],
      };
      expect(ctx.messages[0].role).toBe("compactionSummary");
    });
  });

  describe("run state model", () => {
    it("exports all run phases", () => {
      expect(RUN_PHASES).toEqual(["idle", "running", "paused", "compacting", "stopped"]);
    });

    it("validates run phase transitions", () => {
      expect(canTransitionRunPhase("idle", "running")).toBe(true);
      expect(canTransitionRunPhase("idle", "stopped")).toBe(false);
      expect(canTransitionRunPhase("running", "paused")).toBe(true);
      expect(canTransitionRunPhase("running", "compacting")).toBe(true);
      expect(canTransitionRunPhase("running", "stopped")).toBe(true);
      expect(canTransitionRunPhase("running", "idle")).toBe(false);
      expect(canTransitionRunPhase("paused", "running")).toBe(true);
      expect(canTransitionRunPhase("paused", "stopped")).toBe(false);
      expect(canTransitionRunPhase("compacting", "running")).toBe(true);
      expect(canTransitionRunPhase("compacting", "idle")).toBe(true);
      expect(canTransitionRunPhase("stopped", "idle")).toBe(true);
      expect(canTransitionRunPhase("stopped", "running")).toBe(false);
    });

    it("accepts a valid RunState", () => {
      const state: RunState = {
        sessionId: "s-001",
        phase: "idle",
        retry: { active: false, attempt: 0, maxAttempts: 2 },
        queue: { steer: [], followUp: [] },
      };
      expect(state.phase).toBe("idle");
    });

    it("locks the run phase transition table", () => {
      expect(RUN_PHASE_TRANSITIONS).toEqual({
        idle: ["running"],
        running: ["paused", "compacting", "stopped"],
        paused: ["running"],
        compacting: ["running", "idle"],
        stopped: ["idle"],
      });
    });
  });

  describe("loop turn model", () => {
    it("exports all loop terminal statuses", () => {
      expect(LOOP_TERMINAL_STATUSES).toEqual([
        "done",
        "failed_execute",
        "failed_verify",
        "progress_uncertain",
        "max_steps",
        "stopped",
        "timeout",
      ]);
    });

    it("exports all loop turn statuses", () => {
      expect(LOOP_TURN_STATUSES).toEqual([
        "pending",
        "executing",
        "succeeded",
        "failed",
        "skipped",
      ]);
    });

    it("exports all no-progress reasons", () => {
      expect(NO_PROGRESS_REASONS).toEqual(["repeat_signature", "ping_pong"]);
    });

    it("accepts a valid LoopTurn", () => {
      const turn: LoopTurn = {
        turnId: "t-001",
        sessionId: "s-001",
        stepIndex: 0,
        capabilityId: "page.click",
        status: "executing",
        startedAt: "2026-03-29T00:00:00.000Z",
      };
      expect(turn.status).toBe("executing");
      expect(turn.terminalStatus).toBeUndefined();
    });
  });

  describe("compaction contract", () => {
    it("exports all compaction reasons", () => {
      expect(COMPACTION_REASONS).toEqual(["overflow", "threshold", "manual"]);
    });

    it("accepts a valid CompactionDraft", () => {
      const draft: CompactionDraft = {
        reason: "overflow",
        summary: "Context was too long, summarized.",
        firstKeptEntryId: "e-005",
        tokensBefore: 20000,
        tokensAfter: 4000,
      };
      expect(draft.reason).toBe("overflow");
      expect(draft.previousSummary).toBeUndefined();
    });

    it("accepts a CompactionDraft with iterative previousSummary", () => {
      const draft: CompactionDraft = {
        reason: "threshold",
        summary: "Updated summary.",
        firstKeptEntryId: "e-010",
        previousSummary: "Previous context summary.",
        tokensBefore: 15000,
        tokensAfter: 3500,
      };
      expect(draft.previousSummary).toBe("Previous context summary.");
    });
  });

  describe("kernel adapter interfaces", () => {
    it("accepts a KernelLlmAdapter shape", () => {
      const adapter: KernelLlmAdapter = {
        complete: async () => "summary",
      };
      expect(typeof adapter.complete).toBe("function");
    });

    it("accepts a SessionStorage shape", () => {
      const storage: SessionStorage = {
        createSession: async () => {},
        appendEntry: async () => {},
        getEntries: async () => [],
        listSessions: async () => [],
        deleteSession: async () => {},
        readKernelSnapshot: async () => ({}),
        writeKernelSnapshot: async () => {},
      };
      expect(typeof storage.createSession).toBe("function");
      expect(typeof storage.appendEntry).toBe("function");
      expect(typeof storage.getEntries).toBe("function");
      expect(typeof storage.listSessions).toBe("function");
      expect(typeof storage.deleteSession).toBe("function");
    });
  });
});
