import type { LlmProfileConfig } from "@bbl-next/contracts";
import {
  LlmProviderRegistry,
  createKernelLlmFromProvider,
  createOpenAiCompatibleProvider,
} from "@bbl-next/kernel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const text = `${chunks.join("\n")}\n`;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function sseTextChunk(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`;
}

const profileConfig: LlmProfileConfig = {
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
};

describe("createKernelLlmFromProvider", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("bridges provider/profile layer into KernelLlmAdapter.complete()", async () => {
    fetchSpy.mockResolvedValue(
      new Response(sseBody([sseTextChunk("Hello from GPT-4!"), "data: [DONE]"]), {
        status: 200,
      }),
    );

    const registry = new LlmProviderRegistry();
    registry.register(createOpenAiCompatibleProvider());

    const adapter = createKernelLlmFromProvider(registry, profileConfig);

    const result = await adapter.complete({
      systemPrompt: "You are helpful.",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result).toBe("Hello from GPT-4!");

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("gpt-4");
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ]);
  });

  it("passes maxTokens when provided", async () => {
    fetchSpy.mockResolvedValue(
      new Response(sseBody([sseTextChunk("OK"), "data: [DONE]"]), { status: 200 }),
    );

    const registry = new LlmProviderRegistry();
    registry.register(createOpenAiCompatibleProvider());
    const adapter = createKernelLlmFromProvider(registry, profileConfig);

    await adapter.complete({
      systemPrompt: "sys",
      messages: [],
      maxTokens: 100,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(100);
  });

  it("throws when profile not found", async () => {
    const registry = new LlmProviderRegistry();
    registry.register(createOpenAiCompatibleProvider());

    const adapter = createKernelLlmFromProvider(registry, profileConfig, "nonexistent");

    await expect(adapter.complete({ systemPrompt: "", messages: [] })).rejects.toThrow(
      "LLM route resolution failed",
    );
  });

  it("throws when provider not registered", async () => {
    const registry = new LlmProviderRegistry();
    // Don't register any provider

    const adapter = createKernelLlmFromProvider(registry, profileConfig);

    await expect(adapter.complete({ systemPrompt: "", messages: [] })).rejects.toThrow(
      "LLM provider not found: openai_compatible",
    );
  });

  it("throws on non-OK HTTP response", async () => {
    fetchSpy.mockResolvedValue(new Response("rate limited", { status: 429 }));

    const registry = new LlmProviderRegistry();
    registry.register(createOpenAiCompatibleProvider());
    const adapter = createKernelLlmFromProvider(registry, profileConfig);

    await expect(adapter.complete({ systemPrompt: "", messages: [] })).rejects.toThrow(
      "LLM request failed (429)",
    );
  });

  it("returns empty string when LLM returns null content", async () => {
    fetchSpy.mockResolvedValue(new Response(sseBody(["data: [DONE]"]), { status: 200 }));

    const registry = new LlmProviderRegistry();
    registry.register(createOpenAiCompatibleProvider());
    const adapter = createKernelLlmFromProvider(registry, profileConfig);

    const result = await adapter.complete({
      systemPrompt: "",
      messages: [],
    });

    expect(result).toBe("");
  });
});
