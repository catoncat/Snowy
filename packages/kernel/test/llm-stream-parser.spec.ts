import { readLlmMessageFromSseStream } from "@bbl-next/kernel";
import { describe, expect, it, vi } from "vitest";

function sseStream(lines: string[]): ReadableStream<Uint8Array> {
  return rawSseStream(`${lines.join("\n")}\n`);
}

function rawSseStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function sseChunk(
  content?: string,
  toolCalls?: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>,
  finishReason?: string,
): string {
  const delta: Record<string, unknown> = {};
  if (content !== undefined) delta.content = content;
  if (toolCalls !== undefined) delta.tool_calls = toolCalls;
  const choice: Record<string, unknown> = { delta };
  if (finishReason) choice.finish_reason = finishReason;
  return `data: ${JSON.stringify({ choices: [choice] })}`;
}

describe("readLlmMessageFromSseStream", () => {
  it("parses a text-only response", async () => {
    const stream = sseStream([
      sseChunk("Hello"),
      sseChunk(", world!"),
      sseChunk(undefined, undefined, "stop"),
      "data: [DONE]",
    ]);

    const result = await readLlmMessageFromSseStream(stream);

    expect(result.message.role).toBe("assistant");
    expect(result.message.content).toBe("Hello, world!");
    expect(result.message.tool_calls).toBeUndefined();
    expect(result.message.stop_reason).toBe("stop");
    expect(result.packetCount).toBe(3);
  });

  it("parses tool calls across multiple chunks", async () => {
    const stream = sseStream([
      sseChunk(undefined, [{ index: 0, id: "call_1", function: { name: "get_", arguments: "" } }]),
      sseChunk(undefined, [{ index: 0, function: { name: "weather", arguments: '{"city":' } }]),
      sseChunk(undefined, [{ index: 0, function: { arguments: '"SF"}' } }]),
      sseChunk(undefined, undefined, "tool_calls"),
      "data: [DONE]",
    ]);

    const result = await readLlmMessageFromSseStream(stream);

    expect(result.message.content).toBeNull();
    expect(result.message.tool_calls).toEqual([
      {
        id: "call_1",
        type: "function",
        function: {
          name: "get_weather",
          arguments: '{"city":"SF"}',
        },
      },
    ]);
  });

  it("parses mixed text and tool calls", async () => {
    const stream = sseStream([
      sseChunk("Let me check "),
      sseChunk("the weather."),
      sseChunk(undefined, [
        { index: 0, id: "call_1", function: { name: "get_weather", arguments: '{"city":"NYC"}' } },
      ]),
      sseChunk(undefined, undefined, "tool_calls"),
      "data: [DONE]",
    ]);

    const result = await readLlmMessageFromSseStream(stream);

    expect(result.message.content).toBe("Let me check the weather.");
    expect(result.message.tool_calls).toHaveLength(1);
  });

  it("parses multiple tool calls by index", async () => {
    const stream = sseStream([
      sseChunk(undefined, [
        { index: 0, id: "call_1", function: { name: "fn_a", arguments: "{}" } },
        { index: 1, id: "call_2", function: { name: "fn_b", arguments: "{}" } },
      ]),
      "data: [DONE]",
    ]);

    const result = await readLlmMessageFromSseStream(stream);

    expect(result.message.tool_calls).toEqual([
      { id: "call_1", type: "function", function: { name: "fn_a", arguments: "{}" } },
      { id: "call_2", type: "function", function: { name: "fn_b", arguments: "{}" } },
    ]);
  });

  it("handles empty stream", async () => {
    const stream = sseStream(["data: [DONE]"]);

    const result = await readLlmMessageFromSseStream(stream);

    expect(result.message.content).toBeNull();
    expect(result.message.tool_calls).toBeUndefined();
    expect(result.packetCount).toBe(0);
  });

  it("skips malformed JSON lines", async () => {
    const stream = sseStream(["data: {invalid json}", sseChunk("Hello"), "data: [DONE]"]);

    const result = await readLlmMessageFromSseStream(stream);

    expect(result.message.content).toBe("Hello");
    expect(result.packetCount).toBe(1);
  });

  it("skips comment lines", async () => {
    const stream = sseStream([": this is a comment", sseChunk("Hello"), "data: [DONE]"]);

    const result = await readLlmMessageFromSseStream(stream);

    expect(result.message.content).toBe("Hello");
  });

  it("calls onDeltaText callback for each text chunk", async () => {
    const onDelta = vi.fn();
    const stream = sseStream([
      sseChunk("Hello"),
      sseChunk(", "),
      sseChunk("world!"),
      "data: [DONE]",
    ]);

    await readLlmMessageFromSseStream(stream, onDelta);

    expect(onDelta).toHaveBeenCalledTimes(3);
    expect(onDelta).toHaveBeenNthCalledWith(1, "Hello");
    expect(onDelta).toHaveBeenNthCalledWith(2, ", ");
    expect(onDelta).toHaveBeenNthCalledWith(3, "world!");
  });

  it("parses final packet without trailing newline", async () => {
    const stream = rawSseStream(sseChunk("tail", undefined, "stop"));

    const result = await readLlmMessageFromSseStream(stream);

    expect(result.message.content).toBe("tail");
    expect(result.message.stop_reason).toBe("stop");
    expect(result.packetCount).toBe(1);
  });

  it("preserves rawBody of the full stream", async () => {
    const stream = sseStream([sseChunk("Hi"), "data: [DONE]"]);

    const result = await readLlmMessageFromSseStream(stream);

    expect(result.rawBody).toContain("Hi");
    expect(result.rawBody).toContain("[DONE]");
  });
});
