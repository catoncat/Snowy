import { listBootstrapResourceMetadata } from "@bbl-next/contracts";
import { BUILTIN_CAPABILITIES } from "@bbl-next/core";
import { describe, expect, it } from "vitest";
import {
  SIDEPANEL_MANAGEMENT_ACTION_KINDS,
  SIDEPANEL_MANAGEMENT_RESOURCE_IDS,
  applyManagementResourceDocument,
  buildManagementBootstrapRequests,
  createInitialManagementState,
  createManagementActionMessage,
  listPendingInterventions,
} from "../src/sidepanel/management";

describe("sidepanel management state", () => {
  it("bootstraps only through unified resource.read requests", () => {
    expect(SIDEPANEL_MANAGEMENT_RESOURCE_IDS).toEqual([
      "runtime.summary",
      "config.summary",
      "skills.summary",
      "hosts.summary",
    ]);

    expect(buildManagementBootstrapRequests()).toEqual([
      { kind: "resource.read", resourceId: "runtime.summary", world: "main" },
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
    expect([...SIDEPANEL_MANAGEMENT_RESOURCE_IDS].sort()).toEqual([...bootstrapResourceIds].sort());
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

  it("builds only approved control-plane action messages", () => {
    expect(SIDEPANEL_MANAGEMENT_ACTION_KINDS).toEqual([
      "runtime.capture_diagnostics",
      "runtime.clear_error",
      "config.update",
      "intervention.resolve",
      "intervention.cancel",
      "skills.install",
      "skills.enable",
      "skills.disable",
      "skills.uninstall",
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
    expect(createManagementActionMessage("skills.install", { skillId: "skill.demo" })).toEqual({
      kind: "skills.install",
      skillId: "skill.demo",
    });
    expect(createManagementActionMessage("hosts.connect", { hostId: "local" })).toEqual({
      kind: "hosts.connect",
      hostId: "local",
    });
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
