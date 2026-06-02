import {
  AI_SURFACE_RESOURCE_IDS,
  CONFIG_CONTROL_PLANE_ACTIONS,
  CONFIG_MODEL_PROVIDER_ROUTING_FIELDS,
  CONFIG_MODEL_PROVIDER_ROUTING_OVERRIDE_FIELDS,
  type CapabilityDescriptor,
  CapabilityError,
  type ConfigBootstrapSummary,
  HOST_CONTROL_PLANE_ACTIONS,
  HOST_SUBSTRATE_ACTIONS,
  type ObservabilityReplayResource,
  PUBLIC_CAPABILITY_NAMESPACES,
  RUNTIME_CONTROL_PLANE_ACTIONS,
  SKILL_CONTROL_PLANE_ACTIONS,
  assertCapabilityDescriptor,
  capabilityNamespace,
} from "@bbl-next/contracts";
import * as contractsModule from "@bbl-next/contracts";
import {
  AI_SURFACE_BOUNDARY,
  AiSurfaceResourceProviderRegistry,
  BUILTIN_BOOTSTRAP_RESOURCE_KEYS,
  BUILTIN_CAPABILITIES,
  BUILTIN_CATALOG,
  BUILTIN_EXPORT_HANDOFFS,
  type BuiltinCapabilityMap,
  CapabilityRegistry,
  FamilyProviderRegistry,
  SkillInvocationService,
  connectExecutionHost,
  createBootstrapSummary,
  createConfigControlPlane,
  createHostControlPlaneSnapshot,
  createMcpCapabilityProjection,
  createObservabilityExportBuilder,
  createSkillRuntimeContext,
  disconnectExecutionHost,
  dispatchCapabilityCall,
  getBuiltinsByNamespace,
  hasPublicNamespaceCoverage,
  readAiSurfaceResource,
  readObservabilityExportResource,
  resolveHostSubstrateTarget,
  setDefaultExecutionHost,
  typedCapabilities,
  typedCapabilitiesForPermissions,
} from "@bbl-next/core";
import { describe, expect, it } from "vitest";
import { JsRunnerHost } from "../../js-runner/src/index";
import { invokeSingleActionSiteSkill } from "../../site-runtime/src/index";

function descriptor(overrides: Partial<CapabilityDescriptor> = {}): CapabilityDescriptor {
  return {
    id: "page.click_xy",
    version: 1,
    description: "Click coordinates",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    risk: "medium",
    sideEffects: "writes",
    permissions: ["page.click_xy"],
    supportsVerify: false,
    supportsStreaming: false,
    exportable: false,
    executionBinding: {
      family: "page",
      operation: "click_xy",
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
        inputSchema: {
          properties: {
            patch: {
              properties: {
                model: {
                  properties: {
                    provider: { type: "string" },
                    model: { type: "string" },
                    baseUrl: { type: "string" },
                    routing: {
                      properties: {
                        policy: {
                          enum: ["chat", "chat_with_tools"],
                        },
                        defaultProfile: { type: "string" },
                        fallbackProfile: { type: "string" },
                        laneProfiles: {
                          properties: {
                            primary: {
                              items: { type: "string" },
                            },
                            compaction: {
                              items: { type: "string" },
                            },
                            title: {
                              items: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ]);
    expect(CONFIG_MODEL_PROVIDER_ROUTING_FIELDS).toEqual(["provider", "model", "baseUrl"]);
    expect(CONFIG_MODEL_PROVIDER_ROUTING_OVERRIDE_FIELDS).toEqual([
      "policy",
      "defaultProfile",
      "fallbackProfile",
      "laneProfiles",
    ]);
  });

  it("keeps skill control-plane actions aligned with canonical contracts", () => {
    expect(SKILL_CONTROL_PLANE_ACTIONS).toEqual([
      "skills.discover",
      "skills.install",
      "skills.enable",
      "skills.disable",
      "skills.uninstall",
      "skills.rollback",
    ]);
    expect(getBuiltinsByNamespace("skills").map((entry) => entry.id)).toEqual([
      "skills.invoke",
      "skills.list",
      "skills.discover",
      "skills.install",
      "skills.enable",
      "skills.disable",
      "skills.uninstall",
      "skills.rollback",
    ]);
    expect(
      getBuiltinsByNamespace("skills").find((entry) => entry.id === "skills.rollback"),
    ).toMatchObject({
      id: "skills.rollback",
      executionBinding: {
        family: "skills",
        operation: "rollback",
      },
      sideEffects: "writes",
      permissions: ["skills.rollback"],
      inputSchema: {
        properties: {
          skillId: { type: "string" },
          versionUri: { type: "string" },
        },
        required: ["skillId"],
      },
      outputSchema: {
        properties: {
          rollback: {
            properties: {
              skillId: { type: "string" },
              versionUri: { type: "string" },
            },
          },
        },
      },
    });
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

  it("projects tools from the registry", () => {
    const registry = new CapabilityRegistry([descriptor()]);

    expect(registry.projectTools()).toMatchObject([
      {
        name: "page_click_xy",
        capabilityId: "page.click_xy",
      },
    ]);
  });

  it("lists and projects action capabilities by audience and default exposure", () => {
    const registry = new CapabilityRegistry([
      descriptor({
        id: "page.info",
        description: "Read compact page info",
        sideEffects: "reads",
        exportable: true,
        permissions: ["page.info"],
        executionBinding: {
          family: "page",
          operation: "info",
        },
      }),
      descriptor({
        id: "runner.invoke",
        description: "Invoke runner module",
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
      descriptor({
        id: "host.exec",
        description: "Execute on host",
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
    ]);

    expect(
      registry
        .listByProjection({
          audience: "chat",
        })
        .map((entry) => entry.id),
    ).toEqual(["page.info", "runner.invoke"]);
    expect(
      registry
        .projectTools({
          audience: "chat",
          defaultExposedOnly: true,
        })
        .map((entry) => entry.capabilityId),
    ).toEqual(["page.info"]);
    expect(
      registry
        .listByProjection({
          executionTarget: "host",
        })
        .map((entry) => entry.id),
    ).toEqual(["host.exec"]);
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

  it("reads every registered AI surface resource via the unified lookup path", () => {
    const registry = (contractsModule as Record<string, unknown>)
      .AI_SURFACE_RESOURCE_METADATA_REGISTRY;
    expect(Array.isArray(registry)).toBe(true);

    const results = (registry as Array<{ id: (typeof AI_SURFACE_RESOURCE_IDS)[number] }>).map(
      (entry) =>
        readAiSurfaceResource({
          resourceId: entry.id,
          bootstrap: createBootstrapSummary(),
          auditTail: { entries: [] },
          interventionAudit: { entries: [] },
          timelineEvents: [],
          rawEvents: [],
        }),
    );

    expect(results.map((entry) => entry.id)).toEqual(AI_SURFACE_RESOURCE_IDS);
    expect(results.every((entry) => entry.primitive === "resource")).toBe(true);
  });

  it("reads shared observability export resources through the unified AI surface lookup path", () => {
    const timelineEvents = [
      {
        id: "evt-1",
        source: "site-runtime" as const,
        eventType: "site.invoke",
        status: "started" as const,
        timestamp: "2026-04-17T00:00:00.000Z",
        summary: "Invoke compose action",
        skillId: "site.twitter",
        action: "compose",
        tabId: 7,
      },
      {
        id: "evt-2",
        source: "site-runtime" as const,
        eventType: "site.verify",
        status: "succeeded" as const,
        timestamp: "2026-04-17T00:00:01.000Z",
        summary: "Verify compose action",
        skillId: "site.twitter",
        action: "compose",
        tabId: 7,
      },
    ];
    const rawEvents = [
      {
        index: 1,
        timestamp: "2026-04-17T00:00:00.000Z",
        source: "site-runtime" as const,
        type: "site.invoke",
        payload: {
          skillId: "site.twitter",
          action: "compose",
        },
      },
      {
        index: 2,
        timestamp: "2026-04-17T00:00:01.000Z",
        source: "site-runtime" as const,
        type: "site.verify",
        payload: {
          skillId: "site.twitter",
          action: "compose",
        },
      },
    ];

    expect(
      readAiSurfaceResource({
        resourceId: "observability.timeline" as never,
        timelineEvents,
        rawEvents,
      }),
    ).toMatchObject({
      id: "observability.timeline",
      primitive: "resource",
      data: {
        status: "available",
        totalCount: 2,
      },
    });
    expect(
      readAiSurfaceResource({
        resourceId: "observability.summary" as never,
        timelineEvents,
        rawEvents,
      }),
    ).toMatchObject({
      id: "observability.summary",
      primitive: "resource",
      data: {
        status: "available",
        totalTimelineEvents: 2,
        totalRawEvents: 2,
      },
    });
    expect(
      readAiSurfaceResource({
        resourceId: "observability.rawEventTail" as never,
        timelineEvents,
        rawEvents,
      }),
    ).toMatchObject({
      id: "observability.rawEventTail",
      primitive: "resource",
      data: {
        status: "available",
        totalCount: 2,
      },
    });
  });

  it("dispatches AI surface resource reads through the owner provider registry", () => {
    const providers = new AiSurfaceResourceProviderRegistry();
    const seen: Array<{ owner: string; resourceId: string; audience: string }> = [];
    providers.register({
      owner: "runtime",
      read: ({ metadata, audience }) => {
        seen.push({
          owner: metadata.readOwner,
          resourceId: metadata.id,
          audience,
        });
        return {
          id: "runtime.summary",
          primitive: "resource",
          generatedAt: "2026-04-16T00:00:00.000Z",
          data: {
            status: "healthy",
            mode: "active-tab-only",
            sessionId: "session-provider",
            activeTab: null,
            loopState: "idle",
            lastError: null,
            hosts: {
              status: "empty",
              defaultHostId: null,
              defaultExecHostId: null,
              totalCount: 0,
              connectedCount: 0,
              items: [],
            },
            interventions: {
              status: "empty",
              totalCount: 0,
              activeCount: 0,
              recentCount: 0,
              active: [],
              recent: [],
            },
            actionCapabilities: {
              total: 0,
              namespaces: [],
            },
          },
        };
      },
    });

    expect(
      readAiSurfaceResource({
        resourceId: "runtime.summary",
        audience: "chat",
        providers,
      }),
    ).toMatchObject({
      id: "runtime.summary",
      data: {
        sessionId: "session-provider",
      },
    });
    expect(seen).toEqual([
      {
        owner: "runtime",
        resourceId: "runtime.summary",
        audience: "chat",
      },
    ]);
  });

  it("rejects resource reads when the caller audience is not allowed", () => {
    expect(
      readAiSurfaceResource({
        resourceId: "runtime.history",
        audience: "system",
        runtimeHistory: { entries: [] },
      }),
    ).toMatchObject({
      id: "runtime.history",
      primitive: "resource",
    });

    try {
      readAiSurfaceResource({
        resourceId: "runtime.history",
        audience: "skill",
        runtimeHistory: { entries: [] },
      });
      throw new Error("Expected resource audience enforcement to reject the read");
    } catch (error) {
      expect(error).toMatchObject({
        code: "E_PERMISSION_DENIED",
      });
    }
  });

  it("aggregates skill-runtime traces and site-runtime events into an observability export surface", async () => {
    const registry = new CapabilityRegistry([descriptor()]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: ({ input }) => ({ ok: true, input }),
    });

    const ctx = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "session-observability",
      skillId: "skill.runtime",
      permissions: ["page.*"],
    });
    await ctx.call("page.click_xy", { x: 100, y: 160 });

    const siteResult = await invokeSingleActionSiteSkill({
      request: {
        skillId: "site.twitter",
        action: "compose",
        tab: {
          tabId: 7,
          url: "https://x.com/home",
          active: true,
          title: "Home",
        },
        plan: {
          skillId: "site.twitter",
          action: "compose",
          steps: [
            {
              world: "content",
              scriptId: "site.twitter:compose:content",
            },
          ],
        },
        module: {
          id: "site.twitter.compose",
          source: "export default async function run() { return { ok: true }; }",
        },
        executeRunner: async () => ({ ok: true }),
      },
      runnerHost: new JsRunnerHost(),
      installer: {
        install: async () => ({ installed: true }),
      },
    });

    expect(siteResult.timelineEvents).toEqual([
      expect.objectContaining({
        source: "site-runtime",
        eventType: "site.match",
        status: "succeeded",
      }),
      expect.objectContaining({
        source: "site-runtime",
        eventType: "site.plan",
        status: "info",
      }),
      expect.objectContaining({
        source: "site-runtime",
        eventType: "site.install",
        status: "succeeded",
      }),
      expect.objectContaining({
        source: "site-runtime",
        eventType: "site.invoke",
        status: "succeeded",
      }),
    ]);

    const builder = createObservabilityExportBuilder();
    builder.addCapabilityTrace({
      trace: ctx.trace,
      sessionId: ctx.sessionId,
      skillId: ctx.skillId,
      action: "run",
    });
    builder.addTimelineEvents(siteResult.timelineEvents);
    builder.addRawEvents(siteResult.rawEvents);

    const surface = builder.build({
      generatedAt: "2026-04-16T00:00:00.000Z",
      rawEventLimit: 3,
    });

    expect(surface.timeline).toMatchObject({
      type: "timeline",
      generatedAt: "2026-04-16T00:00:00.000Z",
      data: {
        status: "available",
        totalCount: 5,
      },
    });
    expect(surface.timeline.data.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "skill-runtime",
          eventType: "skill.capability",
          capabilityId: "page.click_xy",
          skillId: "skill.runtime",
          status: "succeeded",
        }),
        expect.objectContaining({
          source: "site-runtime",
          eventType: "site.invoke",
          skillId: "site.twitter",
          action: "compose",
          status: "succeeded",
        }),
      ]),
    );
    expect(surface.summary).toMatchObject({
      type: "summary",
      data: {
        status: "available",
        totalTimelineEvents: 5,
        totalRawEvents: 5,
        countsBySource: {
          "skill-runtime": 1,
          "site-runtime": 4,
        },
        countsByStatus: {
          succeeded: 4,
          info: 1,
        },
        capabilityIds: ["page.click_xy"],
        skillIds: ["site.twitter", "skill.runtime"],
        lastError: null,
      },
    });
    expect(surface.rawEventTail).toMatchObject({
      type: "rawEventTail",
      data: {
        status: "available",
        totalCount: 3,
      },
    });
    expect(surface.rawEventTail.data.entries.at(-1)).toMatchObject({
      source: "site-runtime",
      type: "site.invoke",
    });
  });

  it("reads rawEventTail through the observability export resource path", () => {
    const resource = readObservabilityExportResource({
      resourceType: "rawEventTail",
      rawEvents: [
        {
          index: 1,
          timestamp: "2026-04-16T00:00:00.000Z",
          source: "skill-runtime",
          type: "skill.capability",
          payload: {
            capabilityId: "page.click_xy",
          },
        },
        {
          index: 2,
          timestamp: "2026-04-16T00:00:01.000Z",
          source: "site-runtime",
          type: "site.invoke",
          payload: {
            skillId: "site.twitter",
            action: "compose",
          },
        },
      ],
      generatedAt: "2026-04-16T00:00:02.000Z",
      limit: 1,
    });

    expect(resource).toEqual({
      type: "rawEventTail",
      generatedAt: "2026-04-16T00:00:02.000Z",
      data: {
        status: "available",
        totalCount: 1,
        entries: [
          {
            index: 2,
            timestamp: "2026-04-16T00:00:01.000Z",
            source: "site-runtime",
            type: "site.invoke",
            payload: {
              skillId: "site.twitter",
              action: "compose",
            },
          },
        ],
      },
    });
  });

  it("builds an ordered observability replay resource with compaction continuity", () => {
    const resource = readAiSurfaceResource({
      resourceId: "observability.replay",
      observabilityReplay: {
        loopEntries: [
          {
            stepIndex: 2,
            capabilityId: "tabs.navigate",
            startedAt: "2026-04-16T00:00:03.000Z",
            endedAt: "2026-04-16T00:00:04.000Z",
            durationMs: 1000,
            ok: true,
          },
        ],
        auditEntries: [
          {
            timestamp: "2026-04-16T00:00:01.000Z",
            sessionId: "session-observability",
            kind: "hosts.connect",
            hostId: "local",
            status: "connected",
          },
          {
            timestamp: "2026-04-16T00:00:02.000Z",
            sessionId: "session-observability",
            kind: "config.update",
            status: "updated",
            changedFields: ["model"],
          },
          {
            timestamp: "2026-04-16T00:00:04.000Z",
            sessionId: "session-observability",
            kind: "loop.step",
            capabilityId: "tabs.navigate",
            status: "executed",
            durationMs: 1000,
          },
          {
            timestamp: "2026-04-16T00:00:06.000Z",
            sessionId: "session-observability",
            kind: "intervention.escalation",
            interventionId: "int-1",
            status: "attention_required",
            escalation: {
              reason: "stale",
              thresholdMs: 30000,
            },
          },
        ],
        interventionEntries: [
          {
            eventId: "evt-1",
            interventionId: "int-1",
            sessionId: "session-observability",
            status: "requested",
            timestamp: "2026-04-16T00:00:05.000Z",
            kind: "takeover",
            trigger: "verify_failed",
          },
        ],
        continuityMarkers: [
          {
            entryId: "cmp-1",
            sessionId: "session-observability",
            timestamp: "2026-04-16T00:00:00.500Z",
            summary: "Earlier turns compacted",
            previousSummary: "Older session summary",
            firstKeptEntryId: "entry-9",
          },
        ],
      },
    });

    const replayResource = resource as ObservabilityReplayResource;

    expect(replayResource).toMatchObject({
      id: "observability.replay",
      primitive: "resource",
      data: {
        status: "available",
        totalCount: 5,
        continuityCount: 1,
      },
    });
    expect(
      replayResource.data.entries.map((entry) => `${entry.subsystem}:${entry.eventType}`),
    ).toEqual([
      "session:session.compaction",
      "host:hosts.connect",
      "config:config.update",
      "loop:loop.step",
      "intervention:intervention.requested",
    ]);
    expect(
      replayResource.data.entries.filter((entry) => entry.eventType === "loop.step"),
    ).toHaveLength(1);
    expect(
      replayResource.data.entries.filter((entry) => entry.eventType === "intervention.escalation"),
    ).toHaveLength(0);
    expect(replayResource.data.entries[0]).toMatchObject({
      sessionId: "session-observability",
      summary: "Earlier turns compacted",
      continuity: {
        kind: "compaction",
        entryId: "cmp-1",
        firstKeptEntryId: "entry-9",
        previousSummary: "Older session summary",
      },
    });
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
        items: [
          {
            skillId: "skill.twitter",
            status: "enabled",
            enabled: true,
            trusted: true,
            source: "package",
            recentChange: "skill.twitter enabled",
            lastChangedAt: "2026-03-29T00:00:00.000Z",
            packageUri: "mem://skills/skill.twitter",
            entry: "handler.js",
            version: 2,
            versionSurface: {
              skillId: "skill.twitter",
              lifecycle: {
                status: "enabled",
                trusted: true,
              },
              activeVersion: {
                versionId: "2",
                uri: "mem://skills/skill.twitter",
                trusted: true,
              },
              rollbackTarget: {
                versionId: "2026-03-29T00:00:00.000Z",
                uri: "mem://skills/skill.twitter/@versions/2026-03-29T00:00:00.000Z",
                createdAt: "2026-03-29T00:00:00.000Z",
                trusted: true,
              },
              policy: {
                snapshotRootUri: "mem://skills/skill.twitter/@versions",
                versionFormat: "iso-timestamp",
                retention: 3,
                rollbackTarget: "latest_trusted",
                rollbackTriggers: ["verifier_failed_with_confirmation", "release_gate_failed"],
              },
            },
            kind: "site",
            description: "Search posts on Twitter/X",
            permissions: ["site.fetch_with_session"],
            tags: ["social"],
            matches: ["https://x.com/*"],
            requiresActiveTab: true,
            actions: [
              {
                name: "search_posts",
                verifier: "results_visible",
              },
            ],
            eventSubscriptions: [
              {
                event: "runtime.route.after",
                action: "notify_success",
              },
            ],
          },
        ],
      },
      hosts: {
        items: [
          {
            hostId: "local",
            kind: "local",
            connected: true,
            state: "connected",
            isDefault: true,
            health: {
              checkedAt: "2026-03-29T00:00:00.000Z",
            },
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
        hosts: {
          status: "healthy",
          defaultHostId: "local",
          defaultExecHostId: null,
          totalCount: 1,
          connectedCount: 1,
          items: [
            expect.objectContaining({
              hostId: "local",
              state: "connected",
              health: {
                status: "healthy",
                checkedAt: "2026-03-29T00:00:00.000Z",
              },
            }),
          ],
        },
        actionCapabilities: {
          total: BUILTIN_CAPABILITIES.length,
        },
      },
      skills: {
        status: "healthy",
        installedCount: 2,
        enabledCount: 1,
        trustedCount: 1,
        items: [
          {
            skillId: "skill.twitter",
            source: "package",
            kind: "site",
            versionSurface: expect.objectContaining({
              rollbackTarget: expect.objectContaining({
                versionId: "2026-03-29T00:00:00.000Z",
              }),
            }),
            actions: [
              {
                name: "search_posts",
                verifier: "results_visible",
              },
            ],
            eventSubscriptions: [
              {
                event: "runtime.route.after",
                action: "notify_success",
              },
            ],
          },
        ],
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
            health: {
              status: "degraded",
            },
            error: {
              code: "E_REMOTE_UNAVAILABLE",
              message: "transport offline",
            },
          },
        ],
      },
    });

    expect(summary.status).toBe("degraded");
    expect(summary.runtime).toMatchObject({
      status: "degraded",
      sessionId: "session-2",
      loopState: "degraded",
      lastError: {
        code: "E_RUNTIME",
      },
    });
    expect(summary.hosts).toMatchObject({
      status: "degraded",
      connectedCount: 0,
    });
    expect(summary.runtime.hosts).toEqual(summary.hosts);
    expect(summary.hosts.items[0]).toMatchObject({
      hostId: "local",
      health: {
        status: "degraded",
      },
      error: {
        code: "E_REMOTE_UNAVAILABLE",
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

  it("rehydrates config control plane state from persisted summary and persists updates", async () => {
    let persistedSummary: ConfigBootstrapSummary = {
      status: "ready" as const,
      fields: ["model", "automation", "permissions", "preferences"],
      values: {
        automation: {
          activeTabOnly: true,
        },
      },
      note: null,
      updatedAt: "2026-04-09T00:00:00.000Z",
    };
    const persistedSnapshots: unknown[] = [];

    const controlPlane = createConfigControlPlane({
      summary: async () => persistedSummary,
      persist: async (summary) => {
        persistedSnapshots.push(summary);
        persistedSummary = summary;
      },
    });

    await expect(controlPlane.getBootstrapSummary()).resolves.toMatchObject({
      status: "ready",
      values: {
        automation: {
          activeTabOnly: true,
        },
      },
      updatedAt: "2026-04-09T00:00:00.000Z",
    });

    const updated = await controlPlane.update({
      preferences: {
        theme: "dark",
      },
    });

    expect(updated.config.status).toBe("ready");
    expect(typeof updated.config.updatedAt).toBe("string");
    expect(updated.config.values).toMatchObject({
      automation: {
        activeTabOnly: true,
      },
      preferences: {
        theme: "dark",
      },
    });
    expect(persistedSnapshots).toHaveLength(1);
    const persistedConfig = persistedSnapshots[0] as ConfigBootstrapSummary;
    expect(persistedConfig.status).toBe("ready");
    expect(persistedConfig.updatedAt).toBe(updated.config.updatedAt);
    expect(persistedConfig.values).toMatchObject({
      automation: {
        activeTabOnly: true,
      },
      preferences: {
        theme: "dark",
      },
    });

    const rehydrated = createConfigControlPlane({
      summary: async () => persistedConfig,
    });

    const rehydratedSummary = await rehydrated.getBootstrapSummary();
    expect(rehydratedSummary.status).toBe("ready");
    expect(rehydratedSummary.updatedAt).toBe(updated.config.updatedAt);
    expect(rehydratedSummary.values).toMatchObject({
      automation: {
        activeTabOnly: true,
      },
      preferences: {
        theme: "dark",
      },
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
      defaultExecHostId: "ssh-prod",
      hosts: [
        {
          hostId: "local",
          connected: false,
          state: "disconnected",
          isDefault: false,
          capabilities: {
            read: true,
            write: true,
            edit: true,
            exec: false,
          },
          health: {
            status: "unknown",
          },
        },
        {
          hostId: "ssh-prod",
          connected: false,
          state: "disconnected",
          isDefault: false,
          capabilities: {
            read: false,
            write: false,
            edit: false,
            exec: true,
          },
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
      defaultExecHostId: "ssh-prod",
      hosts: [
        {
          hostId: "local",
          kind: "local",
          connected: false,
          state: "disconnected",
          isDefault: false,
          capabilities: {
            read: true,
            write: true,
            edit: true,
            exec: false,
          },
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
          capabilities: {
            read: false,
            write: false,
            edit: false,
            exec: true,
          },
          health: {
            status: "healthy",
            checkedAt: "2026-03-29T00:00:00.000Z",
          },
        },
      ],
    });
    expect(defaulted).toMatchObject({
      defaultHostId: "ssh-prod",
      defaultExecHostId: "ssh-prod",
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
      defaultExecHostId: "ssh-prod",
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
    expect(resolveHostSubstrateTarget(snapshot, { operation: "exec" })).toEqual({
      hostId: "ssh-prod",
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
    expect(() =>
      resolveHostSubstrateTarget(
        createHostControlPlaneSnapshot({
          defaultHostId: "local",
          hosts: [
            {
              hostId: "local",
              kind: "local",
            },
          ],
        }),
        { operation: "exec" },
      ),
    ).toThrow("host exec requires hostId or a default exec-capable host");
  });

  it("projects bridge-side MCP export handoffs from exportable descriptors only", () => {
    const registry = new CapabilityRegistry([
      descriptor({
        id: "runtime.summary",
        description: "Runtime summary",
        risk: "low",
        sideEffects: "reads",
        permissions: ["runtime.summary"],
        supportsVerify: false,
        exportable: true,
        exportName: "runtime_summary",
        exportRisk: "medium",
        executionBinding: {
          family: "runtime",
          operation: "summary",
        },
      }),
      descriptor({
        id: "page.click_xy",
        exportable: false,
      }),
      descriptor({
        id: "runtime.history",
        description: "History",
        sideEffects: "reads",
        exportable: true,
        projection: {
          audiences: ["chat", "skill", "system"],
        },
        executionBinding: {
          family: "runtime",
          operation: "history",
        },
      }),
    ]);

    expect(registry.projectMcpExportHandoffs()).toEqual([
      {
        capabilityId: "runtime.summary",
        exportName: "runtime_summary",
        description: "Runtime summary",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        risk: "medium",
        permissions: ["runtime.summary"],
        annotations: {
          sideEffects: "reads",
          supportsVerify: false,
          supportsStreaming: false,
          audiences: ["chat", "skill", "system", "mcp"],
          defaultExposed: true,
          confirmPolicy: "inherit-risk",
          executionTarget: "browser",
        },
      },
    ]);
  });

  it("routes MCP export invocations by exportName through the concrete projection path", async () => {
    const registry = new CapabilityRegistry([
      descriptor({
        id: "page.info",
        description: "Read compact page info",
        sideEffects: "reads",
        permissions: ["page.info"],
        exportable: true,
        exportName: "page_info",
        executionBinding: {
          family: "page",
          operation: "info",
        },
      }),
      descriptor({
        id: "page.click_xy",
        exportable: false,
      }),
    ]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: ({ binding, input }) => ({ operation: binding.operation, input }),
    });
    const projection = createMcpCapabilityProjection({
      registry,
      providers,
    });

    expect(projection.listExports()).toEqual(registry.projectMcpExportHandoffs());
    await expect(
      projection.invoke({
        sessionId: "session-mcp",
        exportName: "page_info",
        input: { maxElements: 10 },
      }),
    ).resolves.toEqual({
      operation: "info",
      input: { maxElements: 10 },
    });
    await expect(
      projection.invoke({
        sessionId: "session-mcp",
        exportName: "page_click_xy",
        input: { x: 100, y: 160 },
      }),
    ).rejects.toMatchObject({
      code: "E_CAPABILITY_NOT_FOUND",
    });
  });

  it("dispatches by family provider", async () => {
    const registry = new CapabilityRegistry([
      descriptor(),
      descriptor({
        id: "page.info",
        sideEffects: "reads",
        permissions: ["page.info"],
        executionBinding: {
          family: "page",
          operation: "info",
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

    await expect(ctx.call("page.click_xy", { x: 100, y: 160 })).resolves.toEqual({
      operation: "click_xy",
      input: { x: 100, y: 160 },
    });
    await expect(
      (ctx.capabilities.page as { info(input: unknown): Promise<unknown> }).info({
        maxElements: 10,
      }),
    ).resolves.toEqual({
      operation: "info",
      input: { maxElements: 10 },
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
        capabilityId: "page.click_xy",
        input: { x: 100, y: 160 },
        skillId: "kernel.loop",
      }),
    ).resolves.toEqual({
      operation: "click_xy",
      input: { x: 100, y: 160 },
    });
  });

  it("passes the original skill management payload to the runtime manager", async () => {
    const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
    const providers = new FamilyProviderRegistry();
    const captured: Array<Record<string, unknown>> = [];
    const ctx = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.manager",
      permissions: ["skills.install"],
      manageSkill: async (request) => {
        captured.push(request as unknown as Record<string, unknown>);
        return { ok: true };
      },
    });

    const input = {
      skillId: "skill.setup",
      setupPlan: {
        writes: [{ uri: "mem://skills/skill.setup/SKILL.md", content: "# Skill\n" }],
      },
    };

    await expect(ctx.call("skills.install", input)).resolves.toEqual({ ok: true });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      skillId: "skill.setup",
      action: "skills.install",
      input,
    });
  });

  it("passes skill discovery payloads to the runtime manager without requiring skillId", async () => {
    const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
    const providers = new FamilyProviderRegistry();
    const captured: Array<Record<string, unknown>> = [];
    const ctx = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.manager",
      permissions: ["skills.discover"],
      manageSkill: async (request) => {
        captured.push(request as unknown as Record<string, unknown>);
        return { ok: true };
      },
    });

    const input = {
      root: "mem://skills",
      autoInstall: true,
      replace: true,
    };

    await expect(ctx.skills.discover(input)).resolves.toEqual({ ok: true });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      action: "skills.discover",
      input,
    });
    expect(captured[0]).not.toHaveProperty("skillId");
  });

  it("keeps string skill lifecycle helpers working while forwarding normalized input", async () => {
    const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
    const providers = new FamilyProviderRegistry();
    const captured: Array<Record<string, unknown>> = [];
    const ctx = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.manager",
      permissions: ["skills.*"],
      manageSkill: async (request) => {
        captured.push(request as unknown as Record<string, unknown>);
        return { ok: true };
      },
    });

    await ctx.skills.install("skill.lifecycle");
    await ctx.skills.enable("skill.lifecycle");
    await ctx.skills.disable("skill.lifecycle");
    await ctx.skills.uninstall("skill.lifecycle");
    await ctx.skills.rollback("skill.lifecycle", {
      versionUri: "mem://skills/skill.lifecycle/@versions/2026-05-27T00:00:00.000Z",
    });
    await ctx.skills.install("skill.lifecycle.setup", { setupPlan: { notes: ["ready"] } });

    expect(captured.map((request) => request.action)).toEqual([
      "skills.install",
      "skills.enable",
      "skills.disable",
      "skills.uninstall",
      "skills.rollback",
      "skills.install",
    ]);
    expect(captured.map((request) => request.input)).toEqual([
      { skillId: "skill.lifecycle" },
      { skillId: "skill.lifecycle" },
      { skillId: "skill.lifecycle" },
      { skillId: "skill.lifecycle" },
      {
        skillId: "skill.lifecycle",
        versionUri: "mem://skills/skill.lifecycle/@versions/2026-05-27T00:00:00.000Z",
      },
      { setupPlan: { notes: ["ready"] }, skillId: "skill.lifecycle.setup" },
    ]);
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
      permissions: ["page.info"],
    });

    await expect(ctx.call("page.click_xy", { x: 100, y: 160 })).rejects.toMatchObject({
      code: "E_PERMISSION_DENIED",
    });
  });

  it("honors descriptor confirmPolicy overrides in the runtime context", async () => {
    const registry = new CapabilityRegistry([
      descriptor({
        id: "config.update",
        risk: "medium",
        permissions: ["config.update"],
        projection: {
          confirmPolicy: "always",
        },
        executionBinding: {
          family: "page",
          operation: "update",
        },
      }),
    ]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: ({ binding, input }) => ({ operation: binding.operation, input }),
    });

    const denied = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.config",
      permissions: ["config.update"],
      confirm: async () => false,
    });

    await expect(denied.call("config.update", { patch: {} })).rejects.toMatchObject({
      code: "E_PERMISSION_DENIED",
    });

    const approved = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.config",
      permissions: ["config.update"],
      confirm: async () => true,
    });

    await expect(approved.call("config.update", { patch: {} })).resolves.toEqual({
      operation: "update",
      input: { patch: {} },
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

    await ctx.call("page.click_xy", { x: 100, y: 160 });

    expect(ctx.trace).toHaveLength(1);
    expect(ctx.trace[0]).toMatchObject({
      traceId: ctx.traceId,
      capabilityId: "page.click_xy",
      status: "succeeded",
      output: { ok: true, input: { x: 100, y: 160 } },
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

    await ctx.call("page.click_xy", { x: 100, y: 160 });

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

    await ctx.call("page.click_xy", { x: 100, y: 160 });

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

    it("read-only capabilities are exportable", () => {
      for (const d of BUILTIN_CAPABILITIES) {
        if (d.sideEffects === "reads" || d.sideEffects === "none") {
          expect(d.exportable, `${d.id} should be exportable`).toBe(true);
        }
      }
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
          "page.click_xy",
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

    it("keeps default chat tool surface focused on Browser Harness and explicit diagnostics", () => {
      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const defaultChatToolIds = registry
        .projectTools({ audience: "chat", defaultExposedOnly: true })
        .map((entry) => entry.capabilityId);

      expect(defaultChatToolIds).toEqual([
        "page.info",
        "page.click_xy",
        "page.type_text",
        "page.press_key",
        "page.scroll",
        "page.screenshot",
        "tabs.list",
        "tabs.get_active",
        "tabs.navigate",
        "runtime.capture_diagnostics",
        "debug.bundle",
      ]);
      expect(defaultChatToolIds).not.toEqual(
        expect.arrayContaining([
          "config.update",
          "host.exec",
          "hosts.connect",
          "intervention.resolve",
          "memfs.list",
          "page.query",
          "page.click",
          "page.fill",
          "skills.invoke",
          "site.fetch_with_session",
        ]),
      );
      expect(BUILTIN_CAPABILITIES.map((entry) => entry.id)).not.toEqual(
        expect.arrayContaining(["page.click", "page.fill"]),
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

    it("exposes intervention control-plane actions in BUILTIN_CAPABILITIES", () => {
      const ids = BUILTIN_CAPABILITIES.map((d) => d.id);
      expect(ids).toContain("intervention.list");
      expect(ids).toContain("intervention.resolve");
      expect(ids).toContain("intervention.cancel");
    });

    it("intervention namespace is present in BUILTIN_CATALOG with 3 entries", () => {
      expect(BUILTIN_CATALOG.intervention).toBeDefined();
      expect(BUILTIN_CATALOG.intervention.length).toBe(3);
      expect(BUILTIN_CATALOG.intervention.map((d) => d.id)).toEqual([
        "intervention.list",
        "intervention.resolve",
        "intervention.cancel",
      ]);
    });

    it("intervention descriptors project to valid tool contracts", () => {
      const registry = new CapabilityRegistry(BUILTIN_CATALOG.intervention);
      const tools = registry.projectTools();
      expect(tools.map((t) => t.name)).toEqual([
        "intervention_list",
        "intervention_resolve",
        "intervention_cancel",
      ]);
      for (const tool of tools) {
        expect(tool.capabilityId).toMatch(/^intervention\./);
      }
    });

    it("intervention.list is exportable (reads sideEffect)", () => {
      const listEntry = BUILTIN_CATALOG.intervention.find((d) => d.id === "intervention.list");
      expect(listEntry).toBeDefined();
      expect(listEntry?.sideEffects).toBe("reads");
      expect(listEntry?.exportable).toBe(true);
    });

    it("intervention.resolve and intervention.cancel are not exportable (writes sideEffect)", () => {
      const resolve = BUILTIN_CATALOG.intervention.find((d) => d.id === "intervention.resolve");
      const cancel = BUILTIN_CATALOG.intervention.find((d) => d.id === "intervention.cancel");
      expect(resolve?.sideEffects).toBe("writes");
      expect(resolve?.exportable).toBe(false);
      expect(cancel?.sideEffects).toBe("writes");
      expect(cancel?.exportable).toBe(false);
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
          const clicked = await ctx.call("page.click_xy", { x: 100, y: 160 });
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
        clicked: { operation: "click_xy", input: { x: 100, y: 160 } },
      });
      expect(result.trace).toHaveLength(1);
      expect(result.trace[0]).toMatchObject({
        traceId: result.traceId,
        capabilityId: "page.click_xy",
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
          await ctx.call("page.click_xy", { x: 100, y: 160 });
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
        permissions: ["memfs.read", "page.click_xy"],
        handler: async (ctx) => ({
          permissions: ctx.permissions,
          canRead: typeof (ctx.capabilities.memfs as { read?: unknown } | undefined)?.read,
          canClick: typeof (ctx.capabilities.page as { click_xy?: unknown } | undefined)?.click_xy,
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
          await ctx.call("page.click_xy", { x: 100, y: 160 });
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
          await ctx.call("page.click_xy", { x: 120, y: 180 });
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
        capabilityId: "page.click_xy",
        input: { x: 100, y: 160 },
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
        permissions: ["page.click_xy"],
        handler: async (ctx) => ctx.call("page.click_xy", { x: 100, y: 160 }),
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

      // page namespace should expose Browser Harness primitives, not UID-only actions
      expect(caps.page).toBeDefined();
      expect(typeof caps.page?.click_xy).toBe("function");
      expect(typeof caps.page?.type_text).toBe("function");
      const pageCaps = caps.page as Record<string, unknown> | undefined;
      expect(pageCaps?.click).toBeUndefined();
      expect(pageCaps?.fill).toBeUndefined();

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
