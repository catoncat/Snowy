import { listBootstrapResourceMetadata } from "@bbl-next/contracts";
import type {
  AuditTailResource,
  ObservabilityReplayResource,
  RuntimeHistoryResource,
} from "@bbl-next/contracts";
import { BUILTIN_CAPABILITIES } from "@bbl-next/core";
import { describe, expect, it } from "vitest";
import {
  SIDEPANEL_MANAGEMENT_ACTION_KINDS,
  SIDEPANEL_MANAGEMENT_RESOURCE_IDS,
  applyManagementResourceDocument,
  buildManagementBootstrapRequests,
  createInitialManagementState,
  createManagementActionMessage,
  createSkillEditorSetupPlan,
  createSkillPackageSetupPlan,
  createSkillRunPrompt,
  listPendingInterventions,
  listRuntimeDebugTimeline,
  listSkillCatalogItems,
  parseSkillMarkdown,
} from "../src/sidepanel/management";

describe("sidepanel management state", () => {
  it("bootstraps only through unified resource.read requests", () => {
    expect(SIDEPANEL_MANAGEMENT_RESOURCE_IDS).toEqual([
      "runtime.summary",
      "runtime.history",
      "audit.tail",
      "observability.replay",
      "config.summary",
      "skills.summary",
      "hosts.summary",
    ]);

    expect(buildManagementBootstrapRequests()).toEqual([
      { kind: "resource.read", resourceId: "runtime.summary", world: "main" },
      { kind: "resource.read", resourceId: "runtime.history", world: "main" },
      { kind: "resource.read", resourceId: "audit.tail", world: "main" },
      { kind: "resource.read", resourceId: "observability.replay", world: "main" },
      { kind: "resource.read", resourceId: "config.summary", world: "main" },
      { kind: "resource.read", resourceId: "skills.summary", world: "main" },
      { kind: "resource.read", resourceId: "hosts.summary", world: "main" },
    ]);
  });

  it("hydrates runtime/config/skills/hosts summaries without app-local bootstrap truth", () => {
    let state = createInitialManagementState();

    state = applyManagementResourceDocument(state, {
      id: "runtime.summary",
      primitive: "resource",
      generatedAt: "2026-04-09T00:00:00.000Z",
      data: {
        status: "healthy",
        mode: "active-tab-only",
        sessionId: "session-1",
        activeTab: {
          tabId: 7,
          url: "https://fixture.test/runtime",
          title: "Runtime",
          world: "main",
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
          namespaces: ["runtime", "config"],
        },
      },
    });
    state = applyManagementResourceDocument(state, {
      id: "config.summary",
      primitive: "resource",
      generatedAt: "2026-04-09T00:00:00.000Z",
      data: {
        status: "ready",
        fields: ["model", "automation"],
        values: {
          model: {
            provider: "openai",
            model: "gpt-5.4",
          },
        },
        note: null,
        updatedAt: "2026-04-09T00:00:00.000Z",
      },
    });
    state = applyManagementResourceDocument(state, {
      id: "skills.summary",
      primitive: "resource",
      generatedAt: "2026-04-09T00:00:00.000Z",
      data: {
        status: "healthy",
        installedCount: 2,
        enabledCount: 1,
        trustedCount: 1,
        recentChange: "skills.enable",
        items: [],
      },
    });
    state = applyManagementResourceDocument(state, {
      id: "hosts.summary",
      primitive: "resource",
      generatedAt: "2026-04-09T00:00:00.000Z",
      data: {
        status: "healthy",
        defaultHostId: "local",
        defaultExecHostId: null,
        totalCount: 1,
        connectedCount: 1,
        items: [
          {
            hostId: "local",
            kind: "local",
            connected: true,
            state: "connected",
            isDefault: true,
            capabilities: {
              read: true,
              write: true,
              edit: true,
              exec: false,
            },
          },
        ],
      },
    });

    expect(state.runtime?.data.activeTab?.url).toBe("https://fixture.test/runtime");
    expect(state.config?.data.values.model).toEqual({
      provider: "openai",
      model: "gpt-5.4",
    });
    expect(state.skills?.data.installedCount).toBe(2);
    expect(state.hosts?.data.defaultHostId).toBe("local");
  });

  it("management resource IDs match bootstrap resources from shared registry", () => {
    const bootstrapResourceIds = listBootstrapResourceMetadata().map((entry) => entry.id);
    expect(bootstrapResourceIds).toEqual([
      "runtime.summary",
      "config.summary",
      "skills.summary",
      "hosts.summary",
    ]);
    for (const resourceId of bootstrapResourceIds) {
      expect(SIDEPANEL_MANAGEMENT_RESOURCE_IDS).toContain(resourceId);
    }
    expect(SIDEPANEL_MANAGEMENT_RESOURCE_IDS).toEqual([
      "runtime.summary",
      "runtime.history",
      "audit.tail",
      "observability.replay",
      "config.summary",
      "skills.summary",
      "hosts.summary",
    ]);
  });

  it("management action kinds are all registered in the shared capability catalog", () => {
    const capabilityIds = new Set(BUILTIN_CAPABILITIES.map((c) => c.id));
    for (const actionKind of SIDEPANEL_MANAGEMENT_ACTION_KINDS) {
      expect(
        capabilityIds.has(actionKind),
        `${actionKind} must exist in BUILTIN_CAPABILITIES`,
      ).toBe(true);
    }
  });

  it("derives package-backed skill catalog items from shared skills summary items", () => {
    const catalog = listSkillCatalogItems({
      status: "healthy",
      installedCount: 2,
      enabledCount: 1,
      trustedCount: 1,
      recentChange: "skills.enable",
      items: [
        {
          skillId: "skill.cutover.catalog",
          name: "Cutover Catalog",
          status: "enabled",
          enabled: true,
          trusted: false,
          source: "package",
          recentChange: "skills.enable",
          lastChangedAt: "2026-05-27T00:00:00.000Z",
          packageUri: "mem://skills/skill.cutover.catalog",
          entry: "handler.js",
          version: 3,
          versionSurface: {
            skillId: "skill.cutover.catalog",
            lifecycle: {
              status: "enabled",
              trusted: false,
            },
            activeVersion: {
              versionId: "3",
              uri: "mem://skills/skill.cutover.catalog",
              trusted: false,
            },
            rollbackTarget: {
              versionId: "2026-05-27T00:00:00.000Z",
              uri: "mem://skills/skill.cutover.catalog/@versions/2026-05-27T00:00:00.000Z",
              createdAt: "2026-05-27T00:00:00.000Z",
              trusted: true,
            },
            policy: {
              snapshotRootUri: "mem://skills/skill.cutover.catalog/@versions",
              versionFormat: "iso-timestamp",
              retention: 3,
              rollbackTarget: "latest_trusted",
              rollbackTriggers: ["verifier_failed_with_confirmation", "release_gate_failed"],
            },
          },
          kind: "site",
          description: "Catalog package",
          permissions: ["tabs.get_active"],
          tags: ["cutover", "site"],
          matches: ["https://fixture.test/*"],
          requiresActiveTab: true,
          actions: [
            {
              name: "inspect_active_tab",
              verifier: "tab_visible",
              description: "Inspect the visible tab",
              injectionSteps: [
                {
                  world: "content",
                  scriptId: "fixture.dom-helper",
                },
              ],
            },
          ],
        },
        {
          skillId: "skill.cutover.lifecycle",
          status: "installed",
          enabled: false,
          trusted: false,
          source: "lifecycle",
          recentChange: "skills.install",
          lastChangedAt: "2026-05-27T00:01:00.000Z",
          version: null,
          kind: null,
          description: null,
          permissions: [],
          tags: [],
          matches: [],
          requiresActiveTab: false,
          actions: [],
        },
      ],
    });

    expect(catalog).toEqual([
      {
        skillId: "skill.cutover.catalog",
        name: "Cutover Catalog",
        status: "enabled",
        enabled: true,
        trusted: false,
        source: "package",
        packageUri: "mem://skills/skill.cutover.catalog",
        entry: "handler.js",
        version: 3,
        versionSurface: expect.objectContaining({
          policy: expect.objectContaining({
            snapshotRootUri: "mem://skills/skill.cutover.catalog/@versions",
          }),
          activeVersion: expect.objectContaining({
            versionId: "3",
          }),
          rollbackTarget: expect.objectContaining({
            versionId: "2026-05-27T00:00:00.000Z",
          }),
        }),
        kind: "site",
        description: "Catalog package",
        permissions: ["tabs.get_active"],
        tags: ["cutover", "site"],
        matches: ["https://fixture.test/*"],
        requiresActiveTab: true,
        actions: [
          {
            name: "inspect_active_tab",
            verifier: "tab_visible",
            description: "Inspect the visible tab",
          },
        ],
      },
      expect.objectContaining({
        skillId: "skill.cutover.lifecycle",
        source: "lifecycle",
        actions: [],
      }),
    ]);
  });

  it("builds package setup plans from Skill Studio package convention fields", () => {
    expect(
      createSkillPackageSetupPlan("skill.demo", {
        manifest: {
          version: 2,
          permissions: ["memfs.read"],
          description: "Demo package",
          entry: "src/handler.js",
        },
        skillMarkdown: "# Demo Skill\n",
        handlerSource: "exports.default = async () => ({ ok: true });",
        readme: "# Demo README\n",
        files: [
          {
            path: "scripts/bootstrap.js",
            content: "export const ready = true;\n",
          },
        ],
        notes: ["from-studio"],
      }),
    ).toEqual({
      skillId: "skill.demo",
      phase: "install",
      baseUri: "mem://skills/skill.demo",
      writes: [
        {
          uri: "mem://skills/skill.demo/SKILL.md",
          content: "# Demo Skill\n",
        },
        {
          uri: "mem://skills/skill.demo/skill.json",
          content: `${JSON.stringify(
            {
              version: 2,
              permissions: ["memfs.read"],
              description: "Demo package",
              entry: "src/handler.js",
              id: "skill.demo",
            },
            null,
            2,
          )}\n`,
        },
        {
          uri: "mem://skills/skill.demo/src/handler.js",
          content: "exports.default = async () => ({ ok: true });",
        },
        {
          uri: "mem://skills/skill.demo/README.md",
          content: "# Demo README\n",
        },
        {
          uri: "mem://skills/skill.demo/scripts/bootstrap.js",
          content: "export const ready = true;\n",
        },
      ],
      notes: ["from-studio"],
    });
  });

  it("builds install setup plans from old-product Skill editor fields", () => {
    const plan = createSkillEditorSetupPlan({
      skillId: "Skill Demo",
      skillName: "页面巡检",
      skillDescription: "检查当前页面状态",
      body: "# SKILL\n1. 读取当前标签页\n2. 输出巡检结果\n",
    });

    expect(plan.skillId).toBe("skill-demo");
    expect(plan.baseUri).toBe("mem://skills/skill-demo");
    expect(plan.writes).toContainEqual({
      uri: "mem://skills/skill-demo/SKILL.md",
      content: [
        "---",
        "id: skill-demo",
        "name: 页面巡检",
        "description: 检查当前页面状态",
        "---",
        "# SKILL\n1. 读取当前标签页\n2. 输出巡检结果",
      ].join("\n"),
    });
    expect(plan.writes).toContainEqual({
      uri: "mem://skills/skill-demo/skill.json",
      content: `${JSON.stringify(
        {
          version: 1,
          permissions: [],
          description: "检查当前页面状态",
          kind: "prompt",
          entry: "handler.js",
          name: "页面巡检",
          id: "skill-demo",
        },
        null,
        2,
      )}\n`,
    });
    expect(plan.writes).toContainEqual({
      uri: "mem://skills/skill-demo/handler.js",
      content:
        "exports.default = async ({ input }) => ({ action: input.action, args: input.args });",
    });
    expect(plan.notes).toEqual(["sidepanel-skill-editor"]);
  });

  it("parses old-product frontmatter Skill markdown for editor fields", () => {
    expect(
      parseSkillMarkdown(
        [
          "---",
          "id: skill.demo",
          "name: 页面巡检",
          "description: 检查当前页面状态",
          "---",
          "# SKILL",
          "1. 读取当前标签页",
        ].join("\n"),
      ),
    ).toEqual({
      skillId: "skill.demo",
      skillName: "页面巡检",
      skillDescription: "检查当前页面状态",
      body: "# SKILL\n1. 读取当前标签页",
    });
  });

  it("builds old-product /skill run prompts from management run args", () => {
    expect(createSkillRunPrompt("skill.cutover.catalog")).toBe("/skill:skill.cutover.catalog");
    expect(createSkillRunPrompt(" skill.cutover.catalog ", " inspect active tab ")).toBe(
      "/skill:skill.cutover.catalog inspect active tab",
    );
    expect(() => createSkillRunPrompt(" ")).toThrow("skillId 不能为空");
  });

  it("builds only approved control-plane action messages", () => {
    expect(SIDEPANEL_MANAGEMENT_ACTION_KINDS).toEqual([
      "runtime.capture_diagnostics",
      "runtime.clear_error",
      "config.update",
      "intervention.resolve",
      "intervention.cancel",
      "skills.discover",
      "skills.install",
      "skills.enable",
      "skills.disable",
      "skills.uninstall",
      "skills.rollback",
      "hosts.connect",
      "hosts.disconnect",
      "hosts.set_default",
    ]);

    expect(
      createManagementActionMessage("runtime.capture_diagnostics", { world: "main", tabId: 9 }),
    ).toEqual({ kind: "runtime.capture_diagnostics", world: "main", tabId: 9 });
    expect(createManagementActionMessage("runtime.clear_error")).toEqual({
      kind: "runtime.clear_error",
    });
    expect(
      createManagementActionMessage("config.update", {
        patch: {
          model: {
            provider: "openai",
          },
        },
      }),
    ).toEqual({
      kind: "config.update",
      patch: {
        model: {
          provider: "openai",
        },
      },
    });
    expect(
      createManagementActionMessage("intervention.resolve", {
        interventionId: "ivr-1",
        resolution: {
          resolution: "resume",
        },
      }),
    ).toEqual({
      kind: "intervention.resolve",
      interventionId: "ivr-1",
      resolution: {
        resolution: "resume",
      },
    });
    expect(
      createManagementActionMessage("intervention.cancel", {
        interventionId: "ivr-1",
        reason: "Rejected from sidepanel",
      }),
    ).toEqual({
      kind: "intervention.cancel",
      interventionId: "ivr-1",
      reason: "Rejected from sidepanel",
    });
    expect(
      createManagementActionMessage("skills.discover", {
        root: "mem://skills",
        autoInstall: true,
        replace: true,
      }),
    ).toEqual({
      kind: "skills.discover",
      root: "mem://skills",
      autoInstall: true,
      replace: true,
    });
    expect(createManagementActionMessage("skills.install", { skillId: "skill.demo" })).toEqual({
      kind: "skills.install",
      skillId: "skill.demo",
    });
    expect(
      createManagementActionMessage("skills.install", {
        skillId: "skill.demo",
        setupPlan: {
          skillId: "skill.demo",
          phase: "install",
          baseUri: "mem://skills/skill.demo",
          writes: [
            {
              uri: "mem://skills/skill.demo/SKILL.md",
              content: "# Demo\n",
            },
          ],
          notes: ["from-studio"],
        },
        metadata: {
          source: "studio",
        },
      }),
    ).toEqual({
      kind: "skills.install",
      skillId: "skill.demo",
      setupPlan: {
        skillId: "skill.demo",
        phase: "install",
        baseUri: "mem://skills/skill.demo",
        writes: [
          {
            uri: "mem://skills/skill.demo/SKILL.md",
            content: "# Demo\n",
          },
        ],
        notes: ["from-studio"],
      },
      metadata: {
        source: "studio",
      },
    });
    expect(
      createManagementActionMessage("skills.rollback", {
        skillId: "skill.demo",
        versionUri: "mem://skills/skill.demo/@versions/2026-05-27T00:00:00.000Z",
      }),
    ).toEqual({
      kind: "skills.rollback",
      skillId: "skill.demo",
      versionUri: "mem://skills/skill.demo/@versions/2026-05-27T00:00:00.000Z",
    });
    expect(createManagementActionMessage("hosts.connect", { hostId: "local" })).toEqual({
      kind: "hosts.connect",
      hostId: "local",
    });
  });

  it("projects runtime history and audit resources into old-product debug timeline rows", () => {
    let state = createInitialManagementState();

    const runtimeHistory: RuntimeHistoryResource = {
      id: "runtime.history",
      primitive: "resource",
      generatedAt: "2026-05-28T00:00:00.000Z",
      data: {
        status: "available",
        totalCount: 1,
        entries: [
          {
            stepIndex: 2,
            capabilityId: "browser.click",
            startedAt: "2026-05-28T00:00:00.000Z",
            endedAt: "2026-05-28T00:00:01.000Z",
            durationMs: 1000,
            ok: true,
          },
        ],
      },
    };
    const auditTail: AuditTailResource = {
      id: "audit.tail",
      primitive: "resource",
      generatedAt: "2026-05-28T00:00:00.000Z",
      data: {
        status: "available",
        totalCount: 1,
        entries: [
          {
            timestamp: "2026-05-28T00:00:02.000Z",
            sessionId: "session-1",
            kind: "loop.step",
            capabilityId: "runtime.chat",
            status: "executed",
            durationMs: 20,
          },
        ],
      },
    };
    const observabilityReplay: ObservabilityReplayResource = {
      id: "observability.replay",
      primitive: "resource",
      generatedAt: "2026-05-28T00:00:00.000Z",
      data: {
        status: "available",
        totalCount: 1,
        continuityCount: 0,
        entries: [
          {
            id: "evt-1",
            timestamp: "2026-05-28T00:00:03.000Z",
            sessionId: "session-1",
            subsystem: "intervention",
            eventType: "intervention.requested",
            status: "attention",
            summary: "Manual review required",
            interventionId: "ivr-1",
          },
        ],
      },
    };

    state = applyManagementResourceDocument(state, runtimeHistory);
    state = applyManagementResourceDocument(state, auditTail);
    state = applyManagementResourceDocument(state, observabilityReplay);

    expect(listRuntimeDebugTimeline(state)).toEqual([
      "step 2 · browser.click · ok · 1000ms",
      "loop.step · executed · runtime.chat · 20ms",
      "intervention:intervention.requested · attention · Manual review required",
    ]);
  });

  it("lists only pending interventions for the sidepanel handoff queue", () => {
    const pending = listPendingInterventions({
      status: "healthy",
      mode: "active-tab-only",
      sessionId: "session-1",
      activeTab: null,
      loopState: "paused",
      lastError: null,
      interventions: {
        status: "requested",
        totalCount: 3,
        activeCount: 2,
        recentCount: 3,
        active: [
          {
            id: "ivr-requested",
            sessionId: "session-1",
            kind: "takeover",
            trigger: "verify_failed",
            title: "Manual review",
            message: "Finish the login flow in the browser.",
            status: "requested",
            requestedAt: "2026-04-15T00:00:00.000Z",
            updatedAt: "2026-04-15T00:00:00.000Z",
            expiresAt: null,
            escalation: null,
          },
          {
            id: "ivr-timeout",
            sessionId: "session-1",
            kind: "confirm",
            trigger: "runtime_blocked",
            title: "Timed out",
            message: "The request expired before approval.",
            status: "timed_out",
            requestedAt: "2026-04-15T00:00:00.000Z",
            updatedAt: "2026-04-15T00:05:00.000Z",
            expiresAt: "2026-04-15T00:05:00.000Z",
            escalation: null,
          },
        ],
        recent: [],
      },
      actionCapabilities: {
        total: 2,
        namespaces: ["runtime", "intervention"],
      },
    });

    expect(pending).toEqual([
      expect.objectContaining({
        id: "ivr-requested",
        status: "requested",
      }),
    ]);
  });
});
