import type {
  CapabilityDescriptor,
  InterventionRecord,
  InterventionRequest,
  LlmProfileConfig,
  LlmProviderAdapter,
  LlmProviderExecutionLane,
  LlmResolvedRoute,
  LlmToolCall,
  LoopTelemetryEntry,
  LoopTerminalStatus,
  ObservabilityTimelineEvent,
  RawEventTailEntry,
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
import { getRequiredCapabilitiesForLane, resolveLlmRoute } from "./llm-profile-resolver.js";
import type { LlmProviderRegistry } from "./llm-provider-registry.js";
import { readLlmMessageFromSseStream } from "./llm-stream-parser.js";
import {
  type ActionFailureHint,
  type PromptBuilderOptions,
  buildSystemPromptBase,
  buildSystemPromptMessages,
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
  interventionPolicy?: LoopInterventionPolicy;
}

export interface RunLoopInput {
  sessionId: string;
  prompt: string;
  historyText?: string;
  onDelta?: (chunk: string) => void;
  onToolCall?: (toolName: string, args: unknown) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  onStepTelemetry?: (entry: LoopTelemetryEntry) => void | Promise<void>;
  onObservabilityEvent?: (
    event: ObservabilityTimelineEvent,
    rawEvent?: Omit<RawEventTailEntry, "index">,
  ) => void | Promise<void>;
  onIntervention?: (
    record: InterventionRecord,
    context: LoopInterventionContext & { phase: "requested" | "resolved" },
  ) =>
    | undefined
    | LoopInterventionHandlerResult
    | Promise<undefined | LoopInterventionHandlerResult>;
  signal?: AbortSignal;
}

export interface RunLoopResult {
  terminalStatus: LoopTerminalStatus;
  stepCount: number;
  telemetry: LoopTelemetryEntry[];
}

type QueuedPromptBehavior = "steer" | "followUp";

export interface LoopInterventionContext {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  capabilityId: string;
  args: unknown;
  descriptor?: CapabilityDescriptor;
  result?: { ok: boolean; data?: unknown; error?: string; verified?: boolean };
  status?: LoopTerminalStatus | null;
}

export interface LoopInterventionHandlerResult {
  resume?: boolean;
  resolution?: Record<string, unknown>;
}

export interface LoopInterventionPolicy {
  beforeStep?(context: LoopInterventionContext): InterventionRequest | null;
  afterStep?(context: LoopInterventionContext): InterventionRequest | null;
}

function toolNameToCapabilityId(toolName: string): string {
  return toolName.replace(/_/g, ".");
}

function defaultSystemPrompt(tools: ToolContract[], promptOptions?: PromptBuilderOptions): string {
  return buildSystemPromptBase(tools, promptOptions);
}

function defaultSystemPromptMessages(
  tools: ToolContract[],
  promptOptions?: PromptBuilderOptions,
): string[] {
  return buildSystemPromptMessages(tools, promptOptions);
}

function formatQueuedPromptText(behavior: QueuedPromptBehavior, text: string): string {
  const label = behavior === "steer" ? "User steering update" : "User follow-up";
  return `[${label}]\n${text}`;
}

function applyInitialPromptOverride(
  messages: Array<Record<string, unknown>>,
  input: RunLoopInput,
  llmStepCount: number,
): Array<Record<string, unknown>> {
  if (!input.historyText || input.historyText === input.prompt || llmStepCount !== 0) {
    return messages;
  }
  const next = [...messages];
  for (let index = next.length - 1; index >= 0; index--) {
    const message = next[index];
    if (message?.role !== "user") {
      continue;
    }
    next[index] = {
      ...message,
      content: input.prompt,
    };
    return next;
  }
  return next;
}

const DEBUG_SECRET_KEY_PATTERN =
  /api[-_]?key|authorization|bearer|credential|llmKey|password|secret|token/i;
const DEBUG_MAX_STRING_LENGTH = 1000;
const DEBUG_MAX_ARRAY_LENGTH = 20;
const DEBUG_MAX_OBJECT_KEYS = 40;
const DEBUG_MAX_DEPTH = 4;

type RuntimeObservabilityEventInput = {
  eventType: string;
  status: ObservabilityTimelineEvent["status"];
  summary: string;
  sessionId?: string;
  action?: string;
  capabilityId?: string;
  traceId?: string;
  parentTraceId?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
  rawType?: string;
  rawPayload?: unknown;
};

function isDebugRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeDebugValue(value: unknown, depth = 0): unknown {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value.length > DEBUG_MAX_STRING_LENGTH
      ? `${value.slice(0, DEBUG_MAX_STRING_LENGTH)}[truncated]`
      : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "undefined") {
    return "[undefined]";
  }

  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value}]`;
  }

  if (depth >= DEBUG_MAX_DEPTH) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, DEBUG_MAX_ARRAY_LENGTH)
      .map((item) => sanitizeDebugValue(item, depth + 1));
    if (value.length > DEBUG_MAX_ARRAY_LENGTH) {
      items.push(`[${value.length - DEBUG_MAX_ARRAY_LENGTH} more]`);
    }
    return items;
  }

  if (isDebugRecord(value)) {
    const entries = Object.entries(value);
    const result: Record<string, unknown> = {};
    for (const [key, entryValue] of entries.slice(0, DEBUG_MAX_OBJECT_KEYS)) {
      result[key] = DEBUG_SECRET_KEY_PATTERN.test(key)
        ? "[redacted]"
        : sanitizeDebugValue(entryValue, depth + 1);
    }
    if (entries.length > DEBUG_MAX_OBJECT_KEYS) {
      result.__truncatedKeys = entries.length - DEBUG_MAX_OBJECT_KEYS;
    }
    return result;
  }

  return String(value);
}

function sanitizeDebugRecord(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  const sanitized = sanitizeDebugValue(value);
  return isDebugRecord(sanitized) ? sanitized : undefined;
}

function createRuntimeObservabilityId(eventType: string): string {
  return `rto-${eventType.replace(/[^a-zA-Z0-9]+/g, "-")}-${crypto.randomUUID()}`;
}

function terminalStatusToObservabilityStatus(
  status: LoopTerminalStatus | null,
  error?: unknown,
): ObservabilityTimelineEvent["status"] {
  if (error) {
    return "failed";
  }
  if (status === "done") {
    return "succeeded";
  }
  if (status === "failed_execute" || status === "failed_verify" || status === "timeout") {
    return "failed";
  }
  if (status === "stopped" || status === "progress_uncertain" || status === "max_steps") {
    return "attention";
  }
  return "info";
}

function summarizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    message: String(error ?? "unknown"),
  };
}

function resolveDebugRequestUrl(
  provider: LlmProviderAdapter,
  route: LlmResolvedRoute,
): string | undefined {
  try {
    return provider.resolveRequestUrl(route);
  } catch {
    return undefined;
  }
}

function createRouteDebugDetails(
  provider: LlmProviderAdapter,
  route: LlmResolvedRoute,
): Record<string, unknown> {
  return {
    profile: route.profile,
    provider: route.provider,
    providerAdapter: provider.id,
    model: route.llmModel,
    baseUrl: route.llmBase,
    requestUrl: resolveDebugRequestUrl(provider, route),
    role: route.role,
    timeoutMs: route.llmTimeoutMs,
    retryMaxAttempts: route.llmRetryMaxAttempts,
    escalationPolicy: route.escalationPolicy,
  };
}

function summarizeApiMessage(message: Record<string, unknown>): Record<string, unknown> {
  const content = message.content;
  return {
    role: typeof message.role === "string" ? message.role : "unknown",
    contentLength:
      typeof content === "string" ? content.length : JSON.stringify(content ?? "").length,
  };
}

async function emitRuntimeObservability(
  input: RunLoopInput,
  eventInput: RuntimeObservabilityEventInput,
): Promise<void> {
  if (!input.onObservabilityEvent) {
    return;
  }

  const timestamp = new Date().toISOString();
  const details = sanitizeDebugRecord(eventInput.details);
  const event: ObservabilityTimelineEvent = {
    id: createRuntimeObservabilityId(eventInput.eventType),
    source: "runtime",
    eventType: eventInput.eventType,
    status: eventInput.status,
    timestamp,
    summary: eventInput.summary,
    ...(eventInput.sessionId ? { sessionId: eventInput.sessionId } : {}),
    ...(eventInput.action ? { action: eventInput.action } : {}),
    ...(eventInput.capabilityId ? { capabilityId: eventInput.capabilityId } : {}),
    ...(eventInput.traceId ? { traceId: eventInput.traceId } : {}),
    ...(eventInput.parentTraceId ? { parentTraceId: eventInput.parentTraceId } : {}),
    ...(typeof eventInput.durationMs === "number" ? { durationMs: eventInput.durationMs } : {}),
    ...(details ? { details } : {}),
  };
  const rawEvent =
    typeof eventInput.rawType === "string"
      ? {
          timestamp,
          source: "runtime" as const,
          type: eventInput.rawType,
          payload: sanitizeDebugValue(eventInput.rawPayload ?? details ?? {}),
        }
      : undefined;

  try {
    await input.onObservabilityEvent(event, rawEvent);
  } catch {
    // Debug telemetry must never break the primary loop.
  }
}

async function appendQueuedPrompts(
  kernel: Kernel,
  sessionId: string,
  behavior: QueuedPromptBehavior,
): Promise<number> {
  const prompts = kernel.dequeue(sessionId, behavior);
  for (const prompt of prompts) {
    await kernel.appendMessage(sessionId, {
      role: "user",
      text: formatQueuedPromptText(behavior, prompt.text),
    });
  }
  return prompts.length;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneInterventionPayload(payload: unknown): Record<string, unknown> | undefined {
  return isPlainObject(payload) ? { ...payload } : undefined;
}

function normalizeInterventionRequest(value: unknown): InterventionRequest | null {
  if (!isPlainObject(value)) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.trigger !== "string" ||
    typeof value.title !== "string" ||
    typeof value.message !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    kind: value.kind as InterventionRequest["kind"],
    trigger: value.trigger as InterventionRequest["trigger"],
    status: "requested",
    title: value.title,
    message: value.message,
    ...(typeof value.skillId === "string" ? { skillId: value.skillId } : {}),
    ...(typeof value.action === "string" ? { action: value.action } : {}),
    ...(typeof value.sessionId === "string" || value.sessionId === null
      ? { sessionId: value.sessionId }
      : {}),
    ...(typeof value.tabId === "number" || value.tabId === null ? { tabId: value.tabId } : {}),
    ...(cloneInterventionPayload(value.payload)
      ? { payload: cloneInterventionPayload(value.payload) }
      : {}),
  };
}

function createConfirmPolicyIntervention(
  context: LoopInterventionContext,
): InterventionRequest | null {
  const descriptor = context.descriptor;
  if (!descriptor) {
    return null;
  }

  const sideEffectful =
    descriptor.sideEffects === "writes" || descriptor.sideEffects === "external";
  if (descriptor.risk !== "high" || !sideEffectful) {
    return null;
  }

  return {
    id: `ivr:${context.toolCallId}:confirm_policy`,
    kind: "confirm",
    trigger: "confirm_policy",
    status: "requested",
    title: `Confirm ${context.capabilityId} before execution`,
    message: `High-risk step ${context.capabilityId} requires confirmation before execution.`,
    payload: {
      capabilityId: context.capabilityId,
      risk: descriptor.risk,
      sideEffects: descriptor.sideEffects,
      args: isPlainObject(context.args) ? { ...context.args } : context.args,
    },
  };
}

function createVerifyFailedIntervention(
  context: LoopInterventionContext,
): InterventionRequest | null {
  const provided = normalizeInterventionRequest(
    isPlainObject(context.result?.data) ? context.result?.data.intervention : undefined,
  );
  if (provided) {
    return provided;
  }

  const verifyFailed =
    context.status === "failed_verify" ||
    context.result?.verified === false ||
    (isPlainObject(context.result?.data) && context.result.data.verified === false);
  if (!verifyFailed) {
    return null;
  }

  return {
    id: `ivr:${context.toolCallId}:verify_failed`,
    kind: "takeover",
    trigger: "verify_failed",
    status: "requested",
    title: `Manual verification required for ${context.capabilityId}`,
    message: `Verification failed after ${context.capabilityId}; manual intervention is required.`,
    payload: {
      capabilityId: context.capabilityId,
      args: isPlainObject(context.args) ? { ...context.args } : context.args,
    },
  };
}

const DEFAULT_INTERVENTION_POLICY: LoopInterventionPolicy = {
  beforeStep: createConfirmPolicyIntervention,
  afterStep: createVerifyFailedIntervention,
};

async function handlePolicyIntervention(input: {
  kernel: Kernel;
  sessionId: string;
  request: InterventionRequest;
  context: LoopInterventionContext;
  handler?: RunLoopInput["onIntervention"];
}): Promise<{
  resolved: boolean;
  requested: InterventionRecord;
  resolvedRecord?: InterventionRecord;
}> {
  const requested = input.kernel.requestIntervention(input.sessionId, input.request);
  input.kernel.pause(input.sessionId);

  if (!input.handler) {
    return { resolved: false, requested };
  }

  const handlerResult = await input.handler(requested, {
    ...input.context,
    phase: "requested",
  });
  if (handlerResult && typeof handlerResult === "object" && handlerResult.resume === false) {
    return { resolved: false, requested };
  }

  const resolution =
    handlerResult && typeof handlerResult === "object" && isPlainObject(handlerResult.resolution)
      ? { ...handlerResult.resolution }
      : undefined;
  const resolvedRecord = input.kernel.resolveIntervention(requested.id, resolution);
  await input.handler(resolvedRecord, {
    ...input.context,
    phase: "resolved",
  });
  input.kernel.resume(input.sessionId);

  return {
    resolved: true,
    requested,
    resolvedRecord,
  };
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
const MAX_OVERFLOW_COMPACTION_ATTEMPTS = 1;
const CONTEXT_OVERFLOW_ERROR_PATTERNS = [
  "context window exceeded",
  "context length exceeded",
  "maximum context length",
  "maximum context",
  "context overflow",
  "too many tokens",
  "prompt is too long",
  "token limit exceeded",
] as const;

function isRetryableLlmStatus(status: number): boolean {
  return RETRYABLE_LLM_STATUS_CODES.has(status);
}

function markProviderDown(
  providerRegistry: LlmProviderRegistry | undefined,
  providerId: string,
): void {
  if (!providerRegistry) {
    return;
  }
  try {
    providerRegistry.setHealthStatus(providerId, "down");
  } catch {
    // Provider may not be in registry (e.g. implicit openai_compatible)
  }
}

export type EscalationSignalReason = "capability_mismatch" | "quality_degradation" | "policy";

export interface EscalationSignal {
  reason: EscalationSignalReason;
  message?: string;
}

export interface RequestLlmWithRetryOptions {
  provider: LlmProviderAdapter;
  profileConfig: LlmProfileConfig;
  providerRegistry?: LlmProviderRegistry;
  route: LlmResolvedRoute;
  payload: Record<string, unknown>;
  signal: AbortSignal;
  lane?: LlmProviderExecutionLane;
  sessionId?: string;
  step?: number;
  escalationSignal?: EscalationSignal;
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
  providerRegistry: LlmProviderRegistry | undefined,
  currentRoute: LlmResolvedRoute,
  lane: LlmProviderExecutionLane,
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

  const nextRouteResult = resolveLlmRoute(profileConfig, nextProfile, currentRoute.role, {
    lane,
    providerRegistry,
    requiredCapabilities: getRequiredCapabilitiesForLane(lane),
  });
  return nextRouteResult.ok ? nextRouteResult.route : null;
}

export async function requestLlmWithRetry(
  opts: RequestLlmWithRetryOptions,
): Promise<RequestLlmWithRetryResult> {
  let route = opts.route;
  let retryCount = 0;
  let previousFailureSignature: string | null = null;
  let repeatedFailureCount = 0;

  // Policy-driven pre-flight escalation: if caller provides an escalation signal,
  // attempt to escalate before the first request.
  if (opts.escalationSignal) {
    const previousProvider = route.provider;
    const escalatedRoute = resolveEscalatedRoute(
      opts.profileConfig,
      opts.providerRegistry,
      route,
      opts.lane ?? "primary",
    );
    if (escalatedRoute) {
      markProviderDown(opts.providerRegistry, previousProvider);
      route = escalatedRoute;
    }
  }

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
        const previousProvider = route.provider;
        const escalatedRoute = resolveEscalatedRoute(
          opts.profileConfig,
          opts.providerRegistry,
          route,
          opts.lane ?? "primary",
        );
        if (escalatedRoute) {
          markProviderDown(opts.providerRegistry, previousProvider);
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
      const previousProvider = route.provider;
      const escalatedRoute = resolveEscalatedRoute(
        opts.profileConfig,
        opts.providerRegistry,
        route,
        opts.lane ?? "primary",
      );
      if (escalatedRoute) {
        markProviderDown(opts.providerRegistry, previousProvider);
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

function isContextOverflowError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return CONTEXT_OVERFLOW_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function createPersistentOverflowError(error: unknown, attempts: number): Error {
  const message = error instanceof Error ? error.message : String(error ?? "unknown");
  return new Error(
    `LLM context overflow persisted after ${attempts} compaction attempt${attempts === 1 ? "" : "s"}: ${message}`,
  );
}

export async function runLoop(
  opts: LoopOrchestratorOptions,
  input: RunLoopInput,
): Promise<RunLoopResult> {
  const { kernel, registry, provider, profileConfig } = opts;
  const providerRegistry = kernel.getProviderRegistry() ?? undefined;
  const contextWindow = opts.contextWindow ?? 8192;
  const buildSystemPrompt =
    opts.systemPromptBuilder ??
    ((tools: ToolContract[]) => defaultSystemPrompt(tools, opts.promptOptions));

  // Resolve LLM route
  const routeResult = resolveLlmRoute(profileConfig, undefined, "worker", {
    lane: "primary",
    providerRegistry,
    requiredCapabilities: getRequiredCapabilitiesForLane("primary"),
  });
  if (!routeResult.ok) {
    throw new Error(`LLM route resolution failed: ${routeResult.message}`);
  }
  let route = routeResult.route;

  // Project tools
  const tools = registry.projectTools({ audience: "chat", defaultExposedOnly: true });
  const openAiTools = toolContractsToOpenAiTools(tools);
  const systemPromptMessages = opts.systemPromptBuilder
    ? [buildSystemPrompt(tools)]
    : defaultSystemPromptMessages(tools, opts.promptOptions);
  const interventionPolicy = opts.interventionPolicy ?? DEFAULT_INTERVENTION_POLICY;

  // Start run
  const initialRunState = kernel.getRunState(input.sessionId);
  if (initialRunState.phase === "paused") {
    const interventionSummary = kernel.getInterventionSummary({ sessionId: input.sessionId });
    if (interventionSummary.activeCount > 0) {
      return {
        terminalStatus: "stopped",
        stepCount: kernel.getStepCount(input.sessionId),
        telemetry: [],
      };
    }
    kernel.resume(input.sessionId);
  } else {
    if (initialRunState.phase === "stopped") {
      kernel.resetRun(input.sessionId);
    }
    kernel.startRun(input.sessionId);
  }

  // Append user message
  await kernel.appendMessage(input.sessionId, {
    role: "user",
    text: input.historyText ?? input.prompt,
  });

  let terminalStatus: LoopTerminalStatus | null = null;
  let llmStepCount = 0;
  let toolStepCount = 0;
  let overflowCompactionAttempts = 0;
  const actionFailures = new Map<string, ActionFailureHint>();
  const telemetryEntries: LoopTelemetryEntry[] = [];
  const runStartedAt = new Date();
  let loopError: unknown;

  await emitRuntimeObservability(input, {
    eventType: "runtime.chat.run.started",
    status: "started",
    summary: "Chat run started",
    sessionId: input.sessionId,
    details: {
      promptLength: input.prompt.length,
      historyLength: input.historyText?.length ?? 0,
      profile: route.profile,
      provider: route.provider,
      model: route.llmModel,
      toolCount: openAiTools.length,
    },
    rawType: "runtime.chat.run",
    rawPayload: {
      phase: "started",
      sessionId: input.sessionId,
      promptLength: input.prompt.length,
      historyLength: input.historyText?.length ?? 0,
    },
  });

  try {
    while (!terminalStatus) {
      if (input.signal?.aborted) {
        terminalStatus = "stopped";
        break;
      }

      await appendQueuedPrompts(kernel, input.sessionId, "steer");

      // Build context
      const context = await kernel.buildContext(input.sessionId);
      const llmMessages = contextMessagesToLlmMessages(context.messages);
      const apiMessages = applyInitialPromptOverride(
        llmMessagesToApiPayload(llmMessages),
        input,
        llmStepCount,
      );
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
        ...systemPromptMessages.map((content) => ({ role: "system" as const, content })),
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
      const llmStep = llmStepCount + 1;
      const llmRequestStartedAt = new Date();

      await emitRuntimeObservability(input, {
        eventType: "runtime.llm.request.started",
        status: "started",
        summary: `LLM request started: ${route.provider}/${route.llmModel}`,
        sessionId: input.sessionId,
        details: {
          ...createRouteDebugDetails(provider, route),
          lane: "primary",
          step: llmStep,
          messageCount: fullMessages.length,
          toolCount: openAiTools.length,
          messages: fullMessages.map(summarizeApiMessage),
        },
        rawType: "runtime.llm.request",
        rawPayload: {
          phase: "started",
          sessionId: input.sessionId,
          step: llmStep,
          route: createRouteDebugDetails(provider, route),
          messageCount: fullMessages.length,
          toolCount: openAiTools.length,
        },
      });

      // Send to LLM
      let requestResult: RequestLlmWithRetryResult;
      try {
        requestResult = await requestLlmWithRetry({
          provider,
          profileConfig,
          providerRegistry,
          route,
          payload,
          signal: input.signal ?? new AbortController().signal,
          lane: "primary",
          sessionId: input.sessionId,
          step: llmStep,
        });
      } catch (error) {
        if (isContextOverflowError(error)) {
          await emitRuntimeObservability(input, {
            eventType: "runtime.llm.request.failed",
            status: "failed",
            summary: "LLM request hit context overflow",
            sessionId: input.sessionId,
            durationMs: new Date().getTime() - llmRequestStartedAt.getTime(),
            details: {
              ...createRouteDebugDetails(provider, route),
              lane: "primary",
              step: llmStep,
              error: summarizeError(error),
              overflowCompactionAttempts,
            },
            rawType: "runtime.llm.request",
            rawPayload: {
              phase: "failed",
              reason: "context_overflow",
              sessionId: input.sessionId,
              step: llmStep,
              error: summarizeError(error),
            },
          });
          if (overflowCompactionAttempts >= MAX_OVERFLOW_COMPACTION_ATTEMPTS) {
            throw createPersistentOverflowError(error, overflowCompactionAttempts);
          }
          overflowCompactionAttempts += 1;
          await kernel.triggerCompaction(input.sessionId, "overflow");
          continue;
        }
        await emitRuntimeObservability(input, {
          eventType: "runtime.llm.request.failed",
          status: "failed",
          summary: "LLM request failed",
          sessionId: input.sessionId,
          durationMs: new Date().getTime() - llmRequestStartedAt.getTime(),
          details: {
            ...createRouteDebugDetails(provider, route),
            lane: "primary",
            step: llmStep,
            error: summarizeError(error),
          },
          rawType: "runtime.llm.request",
          rawPayload: {
            phase: "failed",
            sessionId: input.sessionId,
            step: llmStep,
            error: summarizeError(error),
          },
        });
        throw error;
      }
      const response = requestResult.response;
      route = requestResult.route;
      overflowCompactionAttempts = 0;

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
      await emitRuntimeObservability(input, {
        eventType: "runtime.llm.response.succeeded",
        status: "succeeded",
        summary: `LLM response parsed: ${route.provider}/${route.llmModel}`,
        sessionId: input.sessionId,
        durationMs: new Date().getTime() - llmRequestStartedAt.getTime(),
        details: {
          ...createRouteDebugDetails(provider, route),
          lane: "primary",
          step: llmStep,
          retryCount: requestResult.retryCount,
          packetCount: streamResult.packetCount,
          textLength: textContent.length,
          toolCallCount: toolCalls.length,
          rawBodyLength: streamResult.rawBody.length,
        },
        rawType: "runtime.llm.response",
        rawPayload: {
          phase: "succeeded",
          sessionId: input.sessionId,
          step: llmStep,
          retryCount: requestResult.retryCount,
          packetCount: streamResult.packetCount,
          textLength: textContent.length,
          toolCallCount: toolCalls.length,
          rawBodyPreview: streamResult.rawBody,
        },
      });
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
        const followUpCount = await appendQueuedPrompts(kernel, input.sessionId, "followUp");
        if (followUpCount > 0) {
          continue;
        }
        terminalStatus = "done";
        break;
      }

      // Execute each tool call
      let continueAfterResolvedIntervention = false;
      for (const tc of toolCalls) {
        const toolCallId = tc.id;
        const toolName = tc.function.name;
        const capabilityId = toolNameToCapabilityId(toolName);
        const descriptor = registry.get(capabilityId);

        let args: unknown;
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }

        await emitRuntimeObservability(input, {
          eventType: "runtime.tool.call.started",
          status: "started",
          summary: `Tool call started: ${toolName}`,
          sessionId: input.sessionId,
          action: toolName,
          capabilityId,
          traceId: toolCallId,
          details: {
            toolCallId,
            toolName,
            capabilityId,
            stepIndex: toolStepCount,
            args,
          },
          rawType: "runtime.tool.call",
          rawPayload: {
            phase: "started",
            sessionId: input.sessionId,
            toolCallId,
            toolName,
            capabilityId,
            args,
          },
        });

        input.onToolCall?.(toolName, args);

        const preStepIntervention = interventionPolicy.beforeStep?.({
          sessionId: input.sessionId,
          toolCallId,
          toolName,
          capabilityId,
          args,
          descriptor,
        });
        if (preStepIntervention) {
          const handled = await handlePolicyIntervention({
            kernel,
            sessionId: input.sessionId,
            request: preStepIntervention,
            context: {
              sessionId: input.sessionId,
              toolCallId,
              toolName,
              capabilityId,
              args,
              descriptor,
            },
            handler: input.onIntervention,
          });
          if (!handled.resolved) {
            terminalStatus = "stopped";
            break;
          }
        }

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
        await emitRuntimeObservability(input, {
          eventType: result.ok ? "runtime.tool.call.succeeded" : "runtime.tool.call.failed",
          status: result.ok ? "succeeded" : "failed",
          summary: `Tool call ${result.ok ? "succeeded" : "failed"}: ${toolName}`,
          sessionId: input.sessionId,
          action: toolName,
          capabilityId,
          traceId: toolCallId,
          durationMs,
          details: {
            toolCallId,
            toolName,
            capabilityId,
            stepIndex: toolStepCount,
            ok: result.ok,
            durationMs,
            result,
            ...(telemetryEntry.errorCode ? { errorCode: telemetryEntry.errorCode } : {}),
          },
          rawType: "runtime.tool.call",
          rawPayload: {
            phase: result.ok ? "succeeded" : "failed",
            sessionId: input.sessionId,
            toolCallId,
            toolName,
            capabilityId,
            durationMs,
            result,
            ...(telemetryEntry.errorCode ? { errorCode: telemetryEntry.errorCode } : {}),
          },
        });

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
        const postStepIntervention = interventionPolicy.afterStep?.({
          sessionId: input.sessionId,
          toolCallId,
          toolName,
          capabilityId,
          args,
          descriptor,
          result,
          status,
        });
        if (postStepIntervention) {
          const handled = await handlePolicyIntervention({
            kernel,
            sessionId: input.sessionId,
            request: postStepIntervention,
            context: {
              sessionId: input.sessionId,
              toolCallId,
              toolName,
              capabilityId,
              args,
              descriptor,
              result,
              status,
            },
            handler: input.onIntervention,
          });
          if (!handled.resolved) {
            terminalStatus = "stopped";
            break;
          }
          continueAfterResolvedIntervention = true;
          break;
        }
        if (status) {
          if (shouldContinueAfterToolFailure({ capabilityId, result, status })) {
            continue;
          }
          terminalStatus = status;
          break;
        }
      }

      if (continueAfterResolvedIntervention) {
        continue;
      }

      // Check compaction
      if (!terminalStatus) {
        const shouldCompact = await kernel.shouldCompact(input.sessionId, contextWindow);
        if (shouldCompact) {
          await kernel.triggerCompaction(input.sessionId, "threshold");
        }
      }
    }
  } catch (error) {
    loopError = error;
    throw error;
  } finally {
    try {
      if (kernel.getRunState(input.sessionId).phase === "running") {
        kernel.stop(input.sessionId);
      }
    } catch {
      // Already stopped or not running
    }
    await emitRuntimeObservability(input, {
      eventType: "runtime.chat.run.finished",
      status: terminalStatusToObservabilityStatus(terminalStatus, loopError),
      summary: loopError ? "Chat run failed" : `Chat run finished: ${terminalStatus ?? "done"}`,
      sessionId: input.sessionId,
      durationMs: new Date().getTime() - runStartedAt.getTime(),
      details: {
        terminalStatus: terminalStatus ?? (loopError ? "failed" : "done"),
        stepCount: kernel.getStepCount(input.sessionId),
        llmStepCount,
        toolStepCount,
        telemetryCount: telemetryEntries.length,
        ...(loopError ? { error: summarizeError(loopError) } : {}),
      },
      rawType: "runtime.chat.run",
      rawPayload: {
        phase: loopError ? "failed" : "finished",
        sessionId: input.sessionId,
        terminalStatus: terminalStatus ?? (loopError ? "failed" : "done"),
        stepCount: kernel.getStepCount(input.sessionId),
        llmStepCount,
        toolStepCount,
        ...(loopError ? { error: summarizeError(loopError) } : {}),
      },
    });
  }

  return {
    terminalStatus: terminalStatus ?? "done",
    stepCount: kernel.getStepCount(input.sessionId),
    telemetry: telemetryEntries,
  };
}
