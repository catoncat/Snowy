import type { LlmProfileConfig, LlmProviderAdapter } from "@bbl-next/contracts";
import { LlmProviderRegistry, resolveLlmRoute } from "@bbl-next/kernel";
import { describe, expect, it } from "vitest";
import {
  getRequiredCapabilitiesForLane,
  getRequiredCapabilitiesForPolicy,
} from "../src/llm-profile-resolver.js";

function makeConfig(overrides: Partial<LlmProfileConfig> = {}): LlmProfileConfig {
  return {
    profiles: [
      {
        id: "default",
        providerId: "openai_compatible",
        llmBase: "https://api.openai.com/v1",
        llmKey: "sk-test",
        llmModel: "gpt-4",
      },
    ],
    defaultProfile: "default",
    ...overrides,
  };
}

function stubProvider(id: string): LlmProviderAdapter {
  return {
    id,
    resolveRequestUrl: () => `https://stub/${id}`,
    send: async () => new Response("ok"),
  };
}

function makeRegistry(
  entries: Array<{
    id: string;
    healthStatus?: "healthy" | "degraded" | "down";
    capabilities?: string[];
  }>,
): LlmProviderRegistry {
  const registry = new LlmProviderRegistry();
  for (const entry of entries) {
    registry.register(stubProvider(entry.id), {
      healthStatus: entry.healthStatus,
      capabilities: entry.capabilities,
    });
  }
  return registry;
}

describe("resolveLlmRoute", () => {
  it("resolves the default profile when no profileId given", () => {
    const result = resolveLlmRoute(makeConfig());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.profile).toBe("default");
    expect(result.route.provider).toBe("openai_compatible");
    expect(result.route.llmBase).toBe("https://api.openai.com/v1");
    expect(result.route.llmModel).toBe("gpt-4");
    expect(result.route.llmKey).toBe("sk-test");
  });

  it("resolves an explicit profileId", () => {
    const config = makeConfig({
      profiles: [
        {
          id: "default",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-test",
          llmModel: "gpt-4",
        },
        {
          id: "fast",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-fast",
          llmModel: "gpt-3.5-turbo",
        },
      ],
    });
    const result = resolveLlmRoute(config, "fast");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.profile).toBe("fast");
    expect(result.route.llmModel).toBe("gpt-3.5-turbo");
  });

  it("returns error for missing profile", () => {
    const result = resolveLlmRoute(makeConfig(), "nonexistent");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("profile_not_found");
    expect(result.profile).toBe("nonexistent");
  });

  it("returns error when llmBase is missing", () => {
    const config = makeConfig({
      profiles: [
        {
          id: "default",
          providerId: "openai_compatible",
          llmBase: "",
          llmKey: "sk-test",
          llmModel: "gpt-4",
        },
      ],
    });
    const result = resolveLlmRoute(config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing_llm_config");
  });

  it("returns error when llmModel is missing", () => {
    const config = makeConfig({
      profiles: [
        {
          id: "default",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-test",
          llmModel: "",
        },
      ],
    });
    const result = resolveLlmRoute(config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing_llm_config");
  });

  it("clamps timeout to valid range", () => {
    const config = makeConfig({
      profiles: [
        {
          id: "default",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-test",
          llmModel: "gpt-4",
          llmTimeoutMs: 999_999,
        },
      ],
    });
    const result = resolveLlmRoute(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.llmTimeoutMs).toBe(300_000);
  });

  it("clamps timeout below minimum", () => {
    const config = makeConfig({
      profiles: [
        {
          id: "default",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-test",
          llmModel: "gpt-4",
          llmTimeoutMs: 100,
        },
      ],
    });
    const result = resolveLlmRoute(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.llmTimeoutMs).toBe(1_000);
  });

  it("clamps retryMaxAttempts to valid range", () => {
    const config = makeConfig({
      profiles: [
        {
          id: "default",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-test",
          llmModel: "gpt-4",
          llmRetryMaxAttempts: 100,
        },
      ],
    });
    const result = resolveLlmRoute(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.llmRetryMaxAttempts).toBe(6);
  });

  it("uses default timeout and retry when not specified", () => {
    const result = resolveLlmRoute(makeConfig());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.llmTimeoutMs).toBe(30_000);
    expect(result.route.llmRetryMaxAttempts).toBe(3);
    expect(result.route.llmMaxRetryDelayMs).toBe(4_000);
  });

  it("sets escalationPolicy to upgrade_only when fallback exists", () => {
    const config = makeConfig({
      profiles: [
        {
          id: "default",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-test",
          llmModel: "gpt-4",
        },
        {
          id: "fallback",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-test",
          llmModel: "gpt-3.5-turbo",
        },
      ],
      fallbackProfile: "fallback",
    });
    const result = resolveLlmRoute(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.escalationPolicy).toBe("upgrade_only");
    expect(result.route.orderedProfiles).toEqual(["default", "fallback"]);
  });

  it("sets escalationPolicy to disabled when no fallback", () => {
    const result = resolveLlmRoute(makeConfig());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.escalationPolicy).toBe("disabled");
    expect(result.route.orderedProfiles).toEqual(["default"]);
  });

  it("uses provided role parameter", () => {
    const result = resolveLlmRoute(makeConfig(), undefined, "supervisor");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.role).toBe("supervisor");
  });

  it("defaults to worker role", () => {
    const result = resolveLlmRoute(makeConfig());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.role).toBe("worker");
  });

  it("declares runtime-owned provider capability requirements per lane", () => {
    expect(getRequiredCapabilitiesForLane("primary")).toEqual(["chat.completions", "tool_calls"]);
    expect(getRequiredCapabilitiesForLane("compaction")).toEqual(["chat.completions"]);
    expect(getRequiredCapabilitiesForLane("title")).toEqual(["chat.completions"]);
  });

  it("declares reusable provider capability policies beyond lane names", () => {
    expect(getRequiredCapabilitiesForPolicy("chat")).toEqual(["chat.completions"]);
    expect(getRequiredCapabilitiesForPolicy("chat_with_tools")).toEqual([
      "chat.completions",
      "tool_calls",
    ]);
  });

  it("uses auxProfile as the default root for compaction and title lanes", () => {
    const config = makeConfig({
      profiles: [
        {
          id: "default",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-default",
          llmModel: "gpt-4",
        },
        {
          id: "summary",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-summary",
          llmModel: "gpt-4.1-mini",
        },
        {
          id: "fallback",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-fallback",
          llmModel: "gpt-4.1",
        },
      ],
      auxProfile: "summary",
      fallbackProfile: "fallback",
    });

    const compaction = resolveLlmRoute(config, undefined, "worker", {
      lane: "compaction",
    });
    const title = resolveLlmRoute(config, undefined, "worker", {
      lane: "title",
    });

    expect(compaction.ok).toBe(true);
    expect(title.ok).toBe(true);
    if (!compaction.ok || !title.ok) return;
    expect(compaction.route.profile).toBe("summary");
    expect(compaction.route.orderedProfiles).toEqual(["summary", "fallback"]);
    expect(title.route.profile).toBe("summary");
    expect(title.route.orderedProfiles).toEqual(["summary", "fallback"]);
  });

  it("uses laneProfiles ordered chains and resumes from an explicit target within that chain", () => {
    const config = makeConfig({
      profiles: [
        {
          id: "default",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-default",
          llmModel: "gpt-4",
        },
        {
          id: "balanced",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-balanced",
          llmModel: "gpt-4.1-mini",
        },
        {
          id: "fallback",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-fallback",
          llmModel: "gpt-4.1",
        },
      ],
      fallbackProfile: "fallback",
      laneProfiles: {
        primary: ["default", "balanced", "fallback"],
      },
    });

    const initial = resolveLlmRoute(config, undefined, "worker", {
      lane: "primary",
    });
    const resumed = resolveLlmRoute(config, "balanced", "worker", {
      lane: "primary",
    });

    expect(initial.ok).toBe(true);
    expect(resumed.ok).toBe(true);
    if (!initial.ok || !resumed.ok) return;
    expect(initial.route.orderedProfiles).toEqual(["default", "balanced", "fallback"]);
    expect(resumed.route.profile).toBe("balanced");
    expect(resumed.route.orderedProfiles).toEqual(["balanced", "fallback"]);
  });

  it("skips down providers and resolves the next eligible fallback profile", () => {
    const config = makeConfig({
      profiles: [
        {
          id: "default",
          providerId: "primary_provider",
          llmBase: "https://primary.example/v1",
          llmKey: "sk-primary",
          llmModel: "gpt-4.1-mini",
        },
        {
          id: "fallback",
          providerId: "fallback_provider",
          llmBase: "https://fallback.example/v1",
          llmKey: "sk-fallback",
          llmModel: "gpt-4.1",
        },
      ],
      fallbackProfile: "fallback",
    });
    const registry = makeRegistry([
      { id: "primary_provider", healthStatus: "down", capabilities: ["chat"] },
      { id: "fallback_provider", healthStatus: "healthy", capabilities: ["chat"] },
    ]);

    const result = resolveLlmRoute(config, undefined, "worker", {
      providerRegistry: registry,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.profile).toBe("fallback");
    expect(result.route.provider).toBe("fallback_provider");
    expect(result.route.orderedProfiles).toEqual(["default", "fallback"]);
  });

  it("rejects routes when required capabilities are unavailable", () => {
    const registry = makeRegistry([
      { id: "openai_compatible", healthStatus: "healthy", capabilities: ["chat"] },
    ]);

    const result = resolveLlmRoute(makeConfig(), undefined, "worker", {
      providerRegistry: registry,
      requiredCapabilities: ["vision"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("route_unavailable");
    expect(result.message).toContain("required capabilities");
  });

  it("keeps providers with undeclared capabilities eligible during capability rollout", () => {
    const registry = makeRegistry([{ id: "openai_compatible", healthStatus: "healthy" }]);

    const result = resolveLlmRoute(makeConfig(), undefined, "worker", {
      providerRegistry: registry,
      requiredCapabilities: ["chat.completions"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.profile).toBe("default");
  });

  it("returns route_unavailable when every candidate provider is down", () => {
    const config = makeConfig({
      profiles: [
        {
          id: "default",
          providerId: "primary_provider",
          llmBase: "https://primary.example/v1",
          llmKey: "sk-primary",
          llmModel: "gpt-4.1-mini",
        },
        {
          id: "fallback",
          providerId: "fallback_provider",
          llmBase: "https://fallback.example/v1",
          llmKey: "sk-fallback",
          llmModel: "gpt-4.1",
        },
      ],
      fallbackProfile: "fallback",
    });
    const registry = makeRegistry([
      { id: "primary_provider", healthStatus: "down", capabilities: ["chat"] },
      { id: "fallback_provider", healthStatus: "down", capabilities: ["chat"] },
    ]);

    const result = resolveLlmRoute(config, undefined, "worker", {
      providerRegistry: registry,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("route_unavailable");
    expect(result.message).toContain("No eligible LLM route found");
  });

  it("selects the first fallback provider that satisfies required capabilities", () => {
    const config = makeConfig({
      profiles: [
        {
          id: "default",
          providerId: "primary_provider",
          llmBase: "https://primary.example/v1",
          llmKey: "sk-primary",
          llmModel: "gpt-4.1-mini",
        },
        {
          id: "fallback",
          providerId: "fallback_provider",
          llmBase: "https://fallback.example/v1",
          llmKey: "sk-fallback",
          llmModel: "gpt-4.1",
        },
      ],
      fallbackProfile: "fallback",
    });
    const registry = makeRegistry([
      { id: "primary_provider", healthStatus: "healthy", capabilities: ["chat"] },
      {
        id: "fallback_provider",
        healthStatus: "healthy",
        capabilities: ["chat", "vision"],
      },
    ]);

    const result = resolveLlmRoute(config, undefined, "worker", {
      providerRegistry: registry,
      requiredCapabilities: ["vision"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.profile).toBe("fallback");
    expect(result.route.provider).toBe("fallback_provider");
  });
});
