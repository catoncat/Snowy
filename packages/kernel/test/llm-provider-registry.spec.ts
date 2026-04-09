import type { LlmProviderAdapter } from "@bbl-next/contracts";
import { LlmProviderRegistry } from "@bbl-next/kernel";
import { beforeEach, describe, expect, it } from "vitest";

function stubProvider(id: string): LlmProviderAdapter {
  return {
    id,
    resolveRequestUrl: () => `https://stub/${id}`,
    send: async () => new Response("ok"),
  };
}

describe("LlmProviderRegistry", () => {
  let registry: LlmProviderRegistry;

  beforeEach(() => {
    registry = new LlmProviderRegistry();
  });

  it("registers and retrieves a provider", () => {
    const p = stubProvider("openai");
    registry.register(p);

    expect(registry.has("openai")).toBe(true);
    expect(registry.get("openai")).toBe(p);
  });

  it("stores provider health status and capability declarations", () => {
    registry.register(stubProvider("openai"), {
      healthStatus: "degraded",
      capabilities: ["chat", "vision", "chat"],
    });

    expect(registry.getState("openai")).toEqual({
      healthStatus: "degraded",
      capabilities: ["chat", "vision"],
    });
  });

  it("updates provider runtime state without replacing the provider", () => {
    const provider = stubProvider("openai");
    registry.register(provider, {
      healthStatus: "healthy",
      capabilities: ["chat"],
    });

    registry.setHealthStatus("openai", "down");
    registry.setCapabilities("openai", ["vision"]);

    expect(registry.get("openai")).toBe(provider);
    expect(registry.getState("openai")).toEqual({
      healthStatus: "down",
      capabilities: ["vision"],
    });
  });

  it("lists registered providers with their negotiation state", () => {
    registry.register(stubProvider("a"), { capabilities: ["chat"] });
    registry.register(stubProvider("b"), {
      healthStatus: "degraded",
      capabilities: ["vision"],
    });

    expect(registry.list()).toEqual([
      { id: "a", healthStatus: "healthy", capabilities: ["chat"] },
      { id: "b", healthStatus: "degraded", capabilities: ["vision"] },
    ]);
  });

  it("throws on duplicate registration without replace", () => {
    registry.register(stubProvider("openai"));

    expect(() => registry.register(stubProvider("openai"))).toThrow(
      "llm provider already registered: openai",
    );
  });

  it("allows replacing a provider with replace option", () => {
    registry.register(stubProvider("openai"), {
      healthStatus: "degraded",
      capabilities: ["chat"],
    });
    const replacement = stubProvider("openai");
    registry.register(replacement, {
      replace: true,
      healthStatus: "healthy",
      capabilities: ["chat", "vision"],
    });

    expect(registry.get("openai")).toBe(replacement);
    expect(registry.getState("openai")).toEqual({
      healthStatus: "healthy",
      capabilities: ["chat", "vision"],
    });
  });

  it("throws on empty id", () => {
    expect(() => registry.register(stubProvider(""))).toThrow("llm provider id must not be empty");
  });

  it("throws on whitespace-only id", () => {
    expect(() => registry.register(stubProvider("  "))).toThrow(
      "llm provider id must not be empty",
    );
  });

  it("unregisters a provider", () => {
    registry.register(stubProvider("openai"));

    expect(registry.unregister("openai")).toBe(true);
    expect(registry.has("openai")).toBe(false);
    expect(registry.get("openai")).toBeUndefined();
    expect(registry.getState("openai")).toBeUndefined();
  });

  it("unregister returns false for unknown id", () => {
    expect(registry.unregister("unknown")).toBe(false);
  });

  it("has returns false for unknown id", () => {
    expect(registry.has("unknown")).toBe(false);
  });

  it("get returns undefined for unknown id", () => {
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("list returns empty array when no providers registered", () => {
    expect(registry.list()).toEqual([]);
  });
});
