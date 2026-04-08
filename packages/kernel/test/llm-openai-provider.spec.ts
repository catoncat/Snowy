import type { LlmProviderSendInput, LlmResolvedRoute } from "@bbl-next/contracts";
import { createOpenAiCompatibleProvider } from "@bbl-next/kernel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeRoute(overrides: Partial<LlmResolvedRoute> = {}): LlmResolvedRoute {
  return {
    profile: "default",
    provider: "openai_compatible",
    llmBase: "https://api.openai.com/v1",
    llmKey: "sk-test-key",
    llmModel: "gpt-4",
    llmTimeoutMs: 30_000,
    llmRetryMaxAttempts: 3,
    llmMaxRetryDelayMs: 4_000,
    role: "worker",
    escalationPolicy: "disabled",
    orderedProfiles: ["default"],
    ...overrides,
  };
}

describe("createOpenAiCompatibleProvider", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a provider with default id", () => {
    const provider = createOpenAiCompatibleProvider();
    expect(provider.id).toBe("openai_compatible");
  });

  it("creates a provider with custom id", () => {
    const provider = createOpenAiCompatibleProvider("my_provider");
    expect(provider.id).toBe("my_provider");
  });

  it("falls back to default id for empty string", () => {
    const provider = createOpenAiCompatibleProvider("");
    expect(provider.id).toBe("openai_compatible");
  });

  it("resolves request URL from route base", () => {
    const provider = createOpenAiCompatibleProvider();
    const route = makeRoute({ llmBase: "https://api.example.com/v1" });

    expect(provider.resolveRequestUrl(route)).toBe("https://api.example.com/v1/chat/completions");
  });

  it("strips trailing slashes from base URL", () => {
    const provider = createOpenAiCompatibleProvider();
    const route = makeRoute({ llmBase: "https://api.example.com/v1///" });

    expect(provider.resolveRequestUrl(route)).toBe("https://api.example.com/v1/chat/completions");
  });

  it("sends request with correct headers and body", async () => {
    const provider = createOpenAiCompatibleProvider();
    const route = makeRoute();
    const payload = { model: "gpt-4", messages: [] };

    const input: LlmProviderSendInput = {
      route,
      payload,
      signal: AbortSignal.timeout(5000),
    };

    await provider.send(input);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(opts.method).toBe("POST");
    expect(opts.headers["content-type"]).toBe("application/json");
    expect(opts.headers.authorization).toBe("Bearer sk-test-key");
    expect(JSON.parse(opts.body)).toEqual(payload);
  });

  it("uses requestUrl override when provided", async () => {
    const provider = createOpenAiCompatibleProvider();
    const route = makeRoute();

    const input: LlmProviderSendInput = {
      route,
      payload: {},
      signal: AbortSignal.timeout(5000),
      requestUrl: "https://custom.endpoint.com/chat",
    };

    await provider.send(input);

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://custom.endpoint.com/chat");
  });
});
