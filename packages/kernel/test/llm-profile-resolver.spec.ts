import type { LlmProfileConfig } from "@bbl-next/contracts";
import { resolveLlmRoute } from "@bbl-next/kernel";
import { describe, expect, it } from "vitest";

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
});
