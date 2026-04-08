import type {
  LlmProfileConfig,
  LlmProviderAdapter,
  LlmToolCall,
  LoopTerminalStatus,
  ToolContract,
} from "@bbl-next/contracts";
import type { CapabilityRegistry } from "@bbl-next/core";
import type { Kernel } from "./kernel-facade.js";
import {
  buildAssistantContentBlocks,
  contextMessagesToLlmMessages,
  llmAssistantMessageToMessagePayload,
  llmMessagesToApiPayload,
  normalizeToolCallId,
  stepResultToToolMessagePayload,
} from "./llm-message-model.js";
import { resolveLlmRoute } from "./llm-profile-resolver.js";
import { readLlmMessageFromSseStream } from "./llm-stream-parser.js";
import { type PromptBuilderOptions, buildSystemPromptBase } from "./prompt-builder.js";

export interface LoopOrchestratorOptions {
  kernel: Kernel;
  registry: CapabilityRegistry;
  provider: LlmProviderAdapter;
  profileConfig: LlmProfileConfig;
  systemPromptBuilder?: (tools: ToolContract[]) => string;
  promptOptions?: PromptBuilderOptions;
  contextWindow?: number;
}

export interface RunLoopInput {
  sessionId: string;
  prompt: string;
  onDelta?: (chunk: string) => void;
  onToolCall?: (toolName: string, args: unknown) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  signal?: AbortSignal;
}

export interface RunLoopResult {
  terminalStatus: LoopTerminalStatus;
  stepCount: number;
}

function toolNameToCapabilityId(toolName: string): string {
  return toolName.replace(/_/g, ".");
}

function defaultSystemPrompt(tools: ToolContract[], promptOptions?: PromptBuilderOptions): string {
  return buildSystemPromptBase(tools, promptOptions);
}

function toolContractsToOpenAiTools(tools: ToolContract[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema ?? { type: "object", properties: {} },
    },
  }));
}

export async function runLoop(
  opts: LoopOrchestratorOptions,
  input: RunLoopInput,
): Promise<RunLoopResult> {
  const { kernel, registry, provider, profileConfig } = opts;
  const contextWindow = opts.contextWindow ?? 8192;
  const buildSystemPrompt =
    opts.systemPromptBuilder ??
    ((tools: ToolContract[]) => defaultSystemPrompt(tools, opts.promptOptions));

  // Resolve LLM route
  const routeResult = resolveLlmRoute(profileConfig);
  if (!routeResult.ok) {
    throw new Error(`LLM route resolution failed: ${routeResult.message}`);
  }
  const route = routeResult.route;

  // Project tools
  const tools = registry.projectTools();
  const openAiTools = toolContractsToOpenAiTools(tools);
  const systemPrompt = buildSystemPrompt(tools);

  // Start run
  kernel.startRun(input.sessionId);

  // Append user message
  await kernel.appendMessage(input.sessionId, {
    role: "user",
    text: input.prompt,
  });

  let terminalStatus: LoopTerminalStatus | null = null;

  try {
    while (!terminalStatus) {
      if (input.signal?.aborted) {
        terminalStatus = "stopped";
        break;
      }

      // Build context
      const context = await kernel.buildContext(input.sessionId);
      const llmMessages = contextMessagesToLlmMessages(context.messages);
      const apiMessages = llmMessagesToApiPayload(llmMessages);

      // Prepend system message
      const fullMessages = [{ role: "system", content: systemPrompt }, ...apiMessages];

      // Build payload
      const payload: Record<string, unknown> = {
        model: route.llmModel,
        messages: fullMessages,
        tools: openAiTools,
        tool_choice: "auto",
        temperature: 0.2,
        stream: true,
      };

      // Send to LLM
      const ctrl = new AbortController();
      if (input.signal) {
        input.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
      }

      const timeoutId = setTimeout(() => ctrl.abort(), route.llmTimeoutMs);
      let response: Response;
      try {
        response = await provider.send({
          route,
          payload,
          signal: ctrl.signal,
          lane: "primary",
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`LLM API error ${response.status}: ${errorBody}`);
      }

      if (!response.body) {
        throw new Error("LLM response has no body");
      }

      // Parse streaming response
      const streamResult = await readLlmMessageFromSseStream(response.body, input.onDelta);
      const message = streamResult.message;

      const textContent = (message.content as string) || "";
      const toolCalls = ((message.tool_calls as LlmToolCall[] | undefined) ?? []).map((tc) => ({
        ...tc,
        id: normalizeToolCallId(tc.id),
      }));

      await kernel.appendMessage(
        input.sessionId,
        llmAssistantMessageToMessagePayload({
          role: "assistant",
          content: buildAssistantContentBlocks(textContent || null, toolCalls),
        }),
      );

      // No tool calls → done
      if (toolCalls.length === 0) {
        terminalStatus = "done";
        break;
      }

      // Execute each tool call
      for (const tc of toolCalls) {
        const toolCallId = tc.id;
        const toolName = tc.function.name;
        const capabilityId = toolNameToCapabilityId(toolName);

        let args: unknown;
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }

        input.onToolCall?.(toolName, args);

        // Execute via kernel
        const { turn, result } = await kernel.executeStep(input.sessionId, {
          capabilityId,
          input: args,
        });

        await kernel.appendMessage(
          input.sessionId,
          stepResultToToolMessagePayload(result, { toolCallId, toolName }),
        );

        input.onToolResult?.(toolName, result);

        // Check terminal
        const status = kernel.loop.checkTerminal(input.sessionId, turn);
        if (status) {
          terminalStatus = status;
          break;
        }
      }

      // Check compaction
      if (!terminalStatus) {
        const shouldCompact = await kernel.shouldCompact(input.sessionId, contextWindow);
        if (shouldCompact) {
          await kernel.triggerCompaction(input.sessionId, "overflow");
        }
      }
    }
  } finally {
    try {
      kernel.stop(input.sessionId);
    } catch {
      // Already stopped or not running
    }
  }

  return {
    terminalStatus: terminalStatus ?? "done",
    stepCount: kernel.getStepCount(input.sessionId),
  };
}
