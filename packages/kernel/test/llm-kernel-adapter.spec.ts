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

  it("defaults kernel adapter routing to the compaction lane when auxProfile is configured", async () => {
    fetchSpy.mockResolvedValue(
      new Response(sseBody([sseTextChunk("Summary profile"), "data: [DONE]"]), {
        status: 200,
      }),
    );

    const registry = new LlmProviderRegistry();
    registry.register(createOpenAiCompatibleProvider());
    registry.register({
      id: "summary_provider",
      resolveRequestUrl: () => "https://summary.example.test/chat/completions",
      send: async (input) =>
        fetch(input.requestUrl ?? "https://summary.example.test/chat/completions", {
          method: "POST",
          body: JSON.stringify(input.payload),
        }),
    });

    const adapter = createKernelLlmFromProvider(registry, {
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
          providerId: "summary_provider",
          llmBase: "https://summary.example.test",
          llmKey: "sk-summary",
          llmModel: "gpt-4.1-mini",
        },
      ],
      defaultProfile: "default",
      auxProfile: "summary",
    });

    const result = await adapter.complete({
      systemPrompt: "Summarize this session.",
      messages: [{ role: "user", content: "Context" }],
    });

    expect(result).toBe("Summary profile");

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://summary.example.test/chat/completions");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("gpt-4.1-mini");
  });

  it("requires chat completion capability when resolving compaction routes", async () => {
    fetchSpy.mockResolvedValue(
      new Response(sseBody([sseTextChunk("Fallback summary"), "data: [DONE]"]), {
        status: 200,
      }),
    );

    const registry = new LlmProviderRegistry();
    registry.register(
      {
        id: "summary_provider",
        resolveRequestUrl: () => "https://summary.example.test/chat/completions",
        send: async (input) =>
          fetch(input.requestUrl ?? "https://summary.example.test/chat/completions", {
            method: "POST",
            body: JSON.stringify(input.payload),
          }),
      },
      {
        healthStatus: "healthy",
        capabilities: ["tool_calls"],
      },
    );
    registry.register(
      {
        id: "fallback_provider",
        resolveRequestUrl: () => "https://fallback.example.test/chat/completions",
        send: async (input) =>
          fetch(input.requestUrl ?? "https://fallback.example.test/chat/completions", {
            method: "POST",
            body: JSON.stringify(input.payload),
          }),
      },
      {
        healthStatus: "healthy",
        capabilities: ["chat.completions"],
      },
    );

    const adapter = createKernelLlmFromProvider(registry, {
      profiles: [
        {
          id: "default",
          providerId: "summary_provider",
          llmBase: "https://summary.example.test",
          llmKey: "sk-default",
          llmModel: "gpt-4",
        },
        {
          id: "summary",
          providerId: "summary_provider",
          llmBase: "https://summary.example.test",
          llmKey: "sk-summary",
          llmModel: "gpt-4.1-mini",
        },
        {
          id: "fallback",
          providerId: "fallback_provider",
          llmBase: "https://fallback.example.test",
          llmKey: "sk-fallback",
          llmModel: "gpt-4.1",
        },
      ],
      defaultProfile: "default",
      auxProfile: "summary",
      fallbackProfile: "fallback",
    });

    const result = await adapter.complete({
      systemPrompt: "Summarize this session.",
      messages: [{ role: "user", content: "Context" }],
    });

    expect(result).toBe("Fallback summary");

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://fallback.example.test/chat/completions");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("gpt-4.1");
  });

  it("negotiates to the fallback route when the default provider is down", async () => {
    fetchSpy.mockResolvedValue(
      new Response(sseBody([sseTextChunk("Hello from fallback!"), "data: [DONE]"]), {
        status: 200,
      }),
    );

    const registry = new LlmProviderRegistry();
    registry.register(createOpenAiCompatibleProvider(), {
      healthStatus: "down",
    });
    registry.register(
      {
        id: "fallback_provider",
        resolveRequestUrl: () => "https://fallback.example.test/chat/completions",
        send: async (input) =>
          fetch(input.requestUrl ?? "https://fallback.example.test/chat/completions", {
            method: "POST",
            body: JSON.stringify(input.payload),
          }),
      },
      {
        healthStatus: "healthy",
      },
    );

    const adapter = createKernelLlmFromProvider(registry, {
      profiles: [
        {
          id: "default",
          providerId: "openai_compatible",
          llmBase: "https://api.openai.com/v1",
          llmKey: "sk-default",
          llmModel: "gpt-4",
        },
        {
          id: "fallback",
          providerId: "fallback_provider",
          llmBase: "https://fallback.example.test",
          llmKey: "sk-fallback",
          llmModel: "gpt-4.1",
        },
      ],
      defaultProfile: "default",
      fallbackProfile: "fallback",
    });

    const result = await adapter.complete({
      systemPrompt: "You are helpful.",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result).toBe("Hello from fallback!");

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://fallback.example.test/chat/completions");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("gpt-4.1");
  });

  it("still enforces route timeout when caller passes a signal", async () => {
    vi.useFakeTimers();
    try {
      const registry = new LlmProviderRegistry();
      registry.register({
        id: "slow_provider",
        resolveRequestUrl() {
          return "https://slow.example.test/chat/completions";
        },
        async send({ signal }) {
          return await new Promise<Response>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")), {
              once: true,
            });
          });
        },
      });

      const adapter = createKernelLlmFromProvider(
        registry,
        {
          profiles: [
            {
              id: "default",
              providerId: "slow_provider",
              llmBase: "https://slow.example.test",
              llmKey: "sk-test",
              llmModel: "gpt-4",
              llmTimeoutMs: 1000,
            },
          ],
          defaultProfile: "default",
        },
        "default",
      );

      const controller = new AbortController();
      const completion = adapter
        .complete({
          systemPrompt: "",
          messages: [],
          signal: controller.signal,
        })
        .then(
          () => ({ ok: true as const }),
          (error) => error,
        );

      await vi.advanceTimersByTimeAsync(1000);

      const result = await completion;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).name).toBe("TimeoutError");
    } finally {
      vi.useRealTimers();
    }
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
      "LLM route resolution failed: No eligible LLM route found",
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
