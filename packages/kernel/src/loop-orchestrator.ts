import type {
  LlmProfileConfig,
  LlmProviderAdapter,
  LlmProviderExecutionLane,
  LlmResolvedRoute,
  LlmToolCall,
  LoopTelemetryEntry,
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
import {
  type ActionFailureHint,
  type PromptBuilderOptions,
  buildSystemPromptBase,
  buildTaskProgressMessage,
} from "./prompt-builder.js";

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
  onStepTelemetry?: (entry: LoopTelemetryEntry) => void | Promise<void>;
  signal?: AbortSignal;
}

export interface RunLoopResult {
  terminalStatus: LoopTerminalStatus;
  stepCount: number;
  telemetry: LoopTelemetryEntry[];
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

function extractFailureTarget(args: unknown): string | undefined {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return undefined;
  }

  const target = args as Record<string, unknown>;
  if (typeof target.uid === "string" && target.uid.trim()) {
    return `uid ${target.uid.trim()}`;
  }
  if (typeof target.url === "string" && target.url.trim()) {
    return `url ${target.url.trim()}`;
  }
  if (typeof target.selector === "string" && target.selector.trim()) {
    return `selector ${target.selector.trim()}`;
  }
  if (typeof target.id === "string" && target.id.trim()) {
    return `id ${target.id.trim()}`;
  }
  if (typeof target.tabId === "number" && Number.isFinite(target.tabId)) {
    return `tab ${target.tabId}`;
  }

  return undefined;
}

function buildFailureHintKey(capabilityId: string, args: unknown): string {
  const target = extractFailureTarget(args);
  return target ? `${capabilityId}::${target}` : capabilityId;
}

function sortedFailureHints(failures: Map<string, ActionFailureHint>): ActionFailureHint[] {
  return [...failures.values()]
    .filter((hint) => hint.failureCount >= 2)
    .sort(
      (left, right) =>
        right.failureCount - left.failureCount || left.toolName.localeCompare(right.toolName),
    );
}

const ACTION_FAILURE_RECOVERY_PREFIXES = ["page.", "tabs.", "site.invoke:"] as const;

function supportsActionFailureRecovery(capabilityId: string): boolean {
  return ACTION_FAILURE_RECOVERY_PREFIXES.some((prefix) => capabilityId.startsWith(prefix));
}

function shouldContinueAfterToolFailure(input: {
  capabilityId: string;
  result: { ok: boolean };
  status: LoopTerminalStatus;
}): boolean {
  return (
    !input.result.ok &&
    input.status === "failed_execute" &&
    supportsActionFailureRecovery(input.capabilityId)
  );
}

const RETRYABLE_LLM_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);
const DEFAULT_LLM_RETRY_BASE_DELAY_MS = 250;

export interface RequestLlmWithRetryOptions {
  provider: LlmProviderAdapter;
  profileConfig: LlmProfileConfig;
  route: LlmResolvedRoute;
  payload: Record<string, unknown>;
  signal: AbortSignal;
  lane?: LlmProviderExecutionLane;
  sessionId?: string;
  step?: number;
}

export interface RequestLlmWithRetryResult {
  response: Response;
  route: LlmResolvedRoute;
  retryCount: number;
}

function createAbortError(reason?: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }

  const error = new Error(typeof reason === "string" ? reason : "The operation was aborted");
  error.name = "AbortError";
  return error;
}

function createTimeoutError(): Error {
  const error = new Error("LLM request timed out");
  error.name = "TimeoutError";
  return error;
}

function parseRetryAfterDelayMs(value?: string | null, now = Date.now()): number | null {
  const header = value?.trim();
  if (!header) {
    return null;
  }

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  const retryAt = Date.parse(header);
  if (Number.isNaN(retryAt)) {
    return null;
  }

  return Math.max(0, retryAt - now);
}

export function calculateLlmRetryDelayMs(input: {
  attempt: number;
  maxDelayMs: number;
  retryAfterHeader?: string | null;
  now?: number;
  baseDelayMs?: number;
}): number {
  const maxDelayMs = Math.max(0, input.maxDelayMs);
  const retryAfterDelayMs = parseRetryAfterDelayMs(input.retryAfterHeader, input.now);
  const backoffDelayMs =
    (input.baseDelayMs ?? DEFAULT_LLM_RETRY_BASE_DELAY_MS) * 2 ** Math.max(0, input.attempt);
  return Math.min(maxDelayMs, retryAfterDelayMs ?? backoffDelayMs);
}

async function waitForRetryDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError(signal.reason));
      return;
    }

    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError(signal.reason));
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function buildLlmFailureSignature(input: {
  status?: number;
  body?: string;
  error?: unknown;
}): string {
  if (typeof input.status === "number") {
    return `status:${input.status}:${(input.body ?? "").trim().slice(0, 200)}`;
  }

  if (input.error instanceof Error) {
    return `error:${input.error.name}:${input.error.message}`;
  }

  return `error:${String(input.error ?? "unknown")}`;
}

function resolveEscalatedRoute(
  profileConfig: LlmProfileConfig,
  currentRoute: LlmResolvedRoute,
): LlmResolvedRoute | null {
  if (currentRoute.escalationPolicy !== "upgrade_only") {
    return null;
  }

  const currentIndex = currentRoute.orderedProfiles.indexOf(currentRoute.profile);
  if (currentIndex < 0) {
    return null;
  }

  const nextProfile = currentRoute.orderedProfiles[currentIndex + 1];
  if (!nextProfile) {
    return null;
  }

  const nextRouteResult = resolveLlmRoute(profileConfig, nextProfile, currentRoute.role);
  return nextRouteResult.ok ? nextRouteResult.route : null;
}

function isRetryableLlmStatus(status: number): boolean {
  return RETRYABLE_LLM_STATUS_CODES.has(status);
}

export async function requestLlmWithRetry(
  opts: RequestLlmWithRetryOptions,
): Promise<RequestLlmWithRetryResult> {
  let route = opts.route;
  let retryCount = 0;
  let previousFailureSignature: string | null = null;
  let repeatedFailureCount = 0;

  while (true) {
    if (opts.signal.aborted) {
      throw createAbortError(opts.signal.reason);
    }

    const ctrl = new AbortController();
    const timeoutError = createTimeoutError();
    const forwardAbort = () => ctrl.abort(opts.signal.reason);
    opts.signal.addEventListener("abort", forwardAbort, { once: true });
    const timeoutId = setTimeout(() => ctrl.abort(timeoutError), route.llmTimeoutMs);

    let response: Response;
    try {
      response = await opts.provider.send({
        route,
        payload: { ...opts.payload, model: route.llmModel },
        signal: ctrl.signal,
        lane: opts.lane ?? "primary",
        sessionId: opts.sessionId,
        step: opts.step,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      opts.signal.removeEventListener("abort", forwardAbort);

      if (opts.signal.aborted) {
        throw createAbortError(opts.signal.reason);
      }

      if (retryCount >= route.llmRetryMaxAttempts) {
        throw error;
      }

      const failureSignature = buildLlmFailureSignature({ error });
      repeatedFailureCount =
        failureSignature === previousFailureSignature ? repeatedFailureCount + 1 : 1;
      previousFailureSignature = failureSignature;

      if (repeatedFailureCount >= 2) {
        const escalatedRoute = resolveEscalatedRoute(opts.profileConfig, route);
        if (escalatedRoute) {
          route = escalatedRoute;
          repeatedFailureCount = 0;
          previousFailureSignature = null;
        }
      }

      const delayMs = calculateLlmRetryDelayMs({
        attempt: retryCount,
        maxDelayMs: route.llmMaxRetryDelayMs,
      });
      retryCount += 1;
      await waitForRetryDelay(delayMs, opts.signal);
      continue;
    }

    clearTimeout(timeoutId);
    opts.signal.removeEventListener("abort", forwardAbort);

    if (response.ok) {
      return { response, route, retryCount };
    }

    const errorBody = await response.text().catch(() => "");
    if (!isRetryableLlmStatus(response.status) || retryCount >= route.llmRetryMaxAttempts) {
      throw new Error(`LLM API error ${response.status}: ${errorBody}`);
    }

    const failureSignature = buildLlmFailureSignature({
      status: response.status,
      body: errorBody,
    });
    repeatedFailureCount =
      failureSignature === previousFailureSignature ? repeatedFailureCount + 1 : 1;
    previousFailureSignature = failureSignature;

    if (repeatedFailureCount >= 2) {
      const escalatedRoute = resolveEscalatedRoute(opts.profileConfig, route);
      if (escalatedRoute) {
        route = escalatedRoute;
        repeatedFailureCount = 0;
        previousFailureSignature = null;
      }
    }

    const delayMs = calculateLlmRetryDelayMs({
      attempt: retryCount,
      maxDelayMs: route.llmMaxRetryDelayMs,
      retryAfterHeader: response.headers.get("retry-after"),
    });
    retryCount += 1;
    await waitForRetryDelay(delayMs, opts.signal);
  }
}

function getLoopMaxSteps(kernel: Kernel): number {
  return kernel.getMaxSteps();
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
  let route = routeResult.route;

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
  let llmStepCount = 0;
  let toolStepCount = 0;
  const actionFailures = new Map<string, ActionFailureHint>();
  const telemetryEntries: LoopTelemetryEntry[] = [];

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
      const runState = kernel.getRunState(input.sessionId);
      const progressPrompt = buildTaskProgressMessage({
        llmStep: llmStepCount + 1,
        maxLoopSteps: getLoopMaxSteps(kernel),
        toolStep: toolStepCount,
        retryAttempt: runState.retry.attempt,
        retryMaxAttempts: runState.retry.maxAttempts,
        actionFailureHints: sortedFailureHints(actionFailures),
      });

      // Prepend system message
      const fullMessages = [
        { role: "system", content: systemPrompt },
        { role: "system", content: progressPrompt },
        ...apiMessages,
      ];

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
      const requestResult = await requestLlmWithRetry({
        provider,
        profileConfig,
        route,
        payload,
        signal: input.signal ?? new AbortController().signal,
        lane: "primary",
        sessionId: input.sessionId,
        step: llmStepCount + 1,
      });
      const response = requestResult.response;
      route = requestResult.route;

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
      llmStepCount += 1;

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

        // Execute via kernel with timing
        const stepStartedAt = new Date();
        const { turn, result } = await kernel.executeStep(input.sessionId, {
          capabilityId,
          input: args,
        });
        const stepEndedAt = new Date();
        const durationMs = stepEndedAt.getTime() - stepStartedAt.getTime();

        const telemetryEntry: LoopTelemetryEntry = {
          stepIndex: toolStepCount,
          capabilityId,
          startedAt: stepStartedAt.toISOString(),
          endedAt: stepEndedAt.toISOString(),
          durationMs,
          ok: result.ok,
          ...(result.ok
            ? {}
            : {
                errorCode: String(
                  (result as unknown as Record<string, unknown>).error ?? "unknown",
                ),
              }),
        };
        telemetryEntries.push(telemetryEntry);
        await input.onStepTelemetry?.(telemetryEntry);

        const failureKey = buildFailureHintKey(capabilityId, args);
        const failureTarget = extractFailureTarget(args);
        if (result.ok) {
          actionFailures.delete(failureKey);
        } else {
          const previous = actionFailures.get(failureKey);
          actionFailures.set(failureKey, {
            toolName,
            capabilityId,
            target: failureTarget,
            failureCount: (previous?.failureCount ?? 0) + 1,
          });
        }

        await kernel.appendMessage(
          input.sessionId,
          stepResultToToolMessagePayload(result, { toolCallId, toolName }),
        );
        toolStepCount += 1;

        input.onToolResult?.(toolName, result);

        // Check terminal
        const status = kernel.checkTerminal(input.sessionId, turn);
        if (status) {
          if (shouldContinueAfterToolFailure({ capabilityId, result, status })) {
            continue;
          }
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
    telemetry: telemetryEntries,
  };
}
