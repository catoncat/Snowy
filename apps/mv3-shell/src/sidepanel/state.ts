export type ChatRunStatus = "idle" | "running" | "stopped";

export type RunActivityPhase =
  | "idle"
  | "thinking"
  | "model_streaming"
  | "tool_planned"
  | "tool_running"
  | "processing_result"
  | "compacting"
  | "waiting_for_user"
  | "finalizing"
  | "completed"
  | "failed"
  | "stopped";

export type RunActivityStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "blocked"
  | "intervention";

export type RunActivitySeverity = "info" | "warning" | "error";
export type RunActivityVisibility = "default" | "always";
export type RunActivityKind =
  | "phase"
  | "model"
  | "tool"
  | "compaction"
  | "intervention"
  | "error"
  | "diagnostic";

export interface RunStatusView {
  status: ChatRunStatus;
  phase: RunActivityPhase;
  label: string;
  summary: string;
  severity: RunActivitySeverity;
  currentActivityId?: string;
}

export interface RunActivityItem {
  id: string;
  kind: RunActivityKind;
  title: string;
  summary: string;
  detail: string;
  expanded: boolean;
  status: RunActivityStatus;
  severity: RunActivitySeverity;
  visibility: RunActivityVisibility;
  family?: string;
  toolCallId?: string;
  toolName?: string;
}

export interface RunActivityProjection {
  current: RunStatusView;
  items: RunActivityItem[];
}

export type ChatMessageContentBlock =
  | { type: "text"; text: string }
  | { type: "toolCall"; id: string; name: string; arguments: string };

export interface ChatMessageItem {
  id: string;
  kind: "message";
  role: "user" | "assistant" | "system";
  text: string;
  state: "complete" | "streaming" | "stopped" | "error";
  systemKind?: "compactionSummary" | "system";
  expanded?: boolean;
  contentBlocks?: ChatMessageContentBlock[];
  toolResults?: Record<string, string>;
}

export interface ChatToolItem {
  id: string;
  kind: "tool";
  toolName: string;
  summary: string;
  detail: string;
  expanded: boolean;
  status?: "running" | "done" | "failed";
}

export type ChatItem = ChatMessageItem | ChatToolItem;

export interface ChatState {
  sessionId: string | null;
  status: ChatRunStatus;
  items: ChatItem[];
  error: string | null;
  runActivity: RunActivityProjection;
}

export interface ChatBootstrapPayload {
  sessionId: string | null;
  runState?: {
    status?: ChatRunStatus | string;
    phase?: RunActivityPhase | string;
    summary?: string;
    currentActivityId?: string;
  } | null;
  messages?: ChatItem[];
  runActivity?: { items?: RunActivityItem[] } | null;
}

export interface ChatEventBase {
  sessionId?: string | null;
}

export type ChatEvent =
  | ({
      type: "run.state";
      status?: ChatRunStatus | string;
      phase?: RunActivityPhase | string;
      summary?: string;
      currentActivityId?: string;
    } & ChatEventBase)
  | ({
      type: "assistant.delta";
      messageId: string;
      chunk?: string;
      phase?: RunActivityPhase | string;
    } & ChatEventBase)
  | ({
      type: "assistant.done";
      messageId: string;
      text?: string;
      contentBlocks?: ChatMessageContentBlock[];
      toolResults?: Record<string, string>;
      phase?: RunActivityPhase | string;
    } & ChatEventBase)
  | ({
      type: "tool.call";
      messageId: string;
      toolCallId?: string;
      toolName: string;
      summary?: string;
      detail?: string;
      phase?: RunActivityPhase | string;
    } & ChatEventBase)
  | ({
      type: "tool.result";
      messageId: string;
      toolCallId?: string;
      toolName: string;
      summary: string;
      detail: string;
      phase?: RunActivityPhase | string;
      status?: RunActivityStatus | string;
    } & ChatEventBase)
  | ({
      type: "run.compaction";
      messageId?: string;
      summary?: string;
      detail?: string;
    } & ChatEventBase)
  | ({
      type: "intervention.requested";
      messageId?: string;
      title?: string;
      summary?: string;
      detail?: string;
    } & ChatEventBase)
  | ({ type: "run.error"; message?: string } & ChatEventBase);

function normalizeStatus(status: string | null | undefined): ChatRunStatus {
  return status === "running" || status === "stopped" ? status : "idle";
}

const RUN_ACTIVITY_PHASES = new Set<RunActivityPhase>([
  "idle",
  "thinking",
  "model_streaming",
  "tool_planned",
  "tool_running",
  "processing_result",
  "compacting",
  "waiting_for_user",
  "finalizing",
  "completed",
  "failed",
  "stopped",
]);

const RUN_ACTIVITY_STATUSES = new Set<RunActivityStatus>([
  "queued",
  "running",
  "done",
  "failed",
  "blocked",
  "intervention",
]);

function normalizeRunActivityPhase(
  phase: string | null | undefined,
  status: ChatRunStatus,
): RunActivityPhase {
  if (RUN_ACTIVITY_PHASES.has(phase as RunActivityPhase)) {
    return phase as RunActivityPhase;
  }
  if (status === "running") {
    return "thinking";
  }
  if (status === "stopped") {
    return "stopped";
  }
  return "idle";
}

function normalizeRunActivityStatus(
  status: string | null | undefined,
  fallback: RunActivityStatus,
): RunActivityStatus {
  return RUN_ACTIVITY_STATUSES.has(status as RunActivityStatus)
    ? (status as RunActivityStatus)
    : fallback;
}

function runPhaseLabel(phase: RunActivityPhase, status: ChatRunStatus): string {
  switch (phase) {
    case "thinking":
      return "正在思考";
    case "model_streaming":
      return "模型生成中";
    case "tool_planned":
      return "准备运行工具";
    case "tool_running":
      return "正在运行工具";
    case "processing_result":
      return "正在处理工具结果";
    case "compacting":
      return "正在压缩上下文";
    case "waiting_for_user":
      return "等待人工介入";
    case "finalizing":
      return "正在整理回复";
    case "completed":
      return "运行完成";
    case "failed":
      return "运行失败";
    case "stopped":
      return "已停止";
    default:
      return status === "running" ? "运行中" : "空闲";
  }
}

function runPhaseSeverity(phase: RunActivityPhase): RunActivitySeverity {
  if (phase === "failed") {
    return "error";
  }
  if (phase === "waiting_for_user" || phase === "stopped") {
    return "warning";
  }
  return "info";
}

function createRunStatusView({
  status,
  phase,
  summary,
  currentActivityId,
}: {
  status: ChatRunStatus;
  phase?: string | null;
  summary?: string;
  currentActivityId?: string;
}): RunStatusView {
  const normalizedPhase = normalizeRunActivityPhase(phase, status);
  return {
    status,
    phase: normalizedPhase,
    label: runPhaseLabel(normalizedPhase, status),
    summary: String(summary ?? "").trim(),
    severity: runPhaseSeverity(normalizedPhase),
    ...(currentActivityId ? { currentActivityId } : {}),
  };
}

function createInitialRunActivity(): RunActivityProjection {
  return {
    current: createRunStatusView({ status: "idle", phase: "idle" }),
    items: [],
  };
}

function cloneRunActivityItem(item: RunActivityItem): RunActivityItem {
  return { ...item };
}

function capabilityFamilyForToolName(toolName: string): string {
  const normalized = toolName.toLowerCase();
  if (/^(tabs?|browser|page|dom|viewport|screenshot|click|fill|query)[_.-]/u.test(normalized)) {
    return "browser/page";
  }
  if (/^(site|runtime\.site)[_.-]/u.test(normalized)) {
    return "site runtime";
  }
  if (/^(memfs|vfs|file|browser_vfs)[_.-]/u.test(normalized)) {
    return "vfs/file";
  }
  if (/^(host|exec|execution)[_.-]/u.test(normalized)) {
    return "host/execution";
  }
  if (/^(skills?|skill)[_.-]/u.test(normalized)) {
    return "skill";
  }
  if (/^(config|runtime|diagnostics?)[_.-]/u.test(normalized)) {
    return "config/runtime";
  }
  if (/^(model|llm|provider)[_.-]/u.test(normalized)) {
    return "model/provider";
  }
  return "capability";
}

function toolActivityId(toolCallId: string): string {
  return `activity:tool:${toolCallId}`;
}

function isFailedToolTrace(summary: string, detail: string): boolean {
  if (containsToolErrorText(`${summary}\n${detail}`)) {
    return true;
  }
  if (!detail.trim()) {
    return false;
  }
  try {
    const parsed = JSON.parse(detail);
    const row = toRecord(parsed);
    return row.ok === false || typeof row.error === "string";
  } catch {
    return false;
  }
}

function createToolActivityItem({
  id,
  toolName,
  summary,
  detail,
  expanded = false,
  status,
}: {
  id: string;
  toolName: string;
  summary: string;
  detail: string;
  expanded?: boolean;
  status: RunActivityStatus;
}): RunActivityItem {
  const failed = status === "failed" || isFailedToolTrace(summary, detail);
  const resolvedStatus: RunActivityStatus = failed ? "failed" : status;
  return {
    id: toolActivityId(id),
    kind: "tool",
    title: toolName,
    summary,
    detail,
    expanded: failed ? true : expanded,
    status: resolvedStatus,
    severity: failed ? "error" : "info",
    visibility: resolvedStatus === "done" ? "default" : "always",
    family: capabilityFamilyForToolName(toolName),
    toolCallId: id,
    toolName,
  };
}

function projectToolItemToActivity(item: ChatToolItem): RunActivityItem {
  const status =
    item.status === "running" ? "running" : item.status === "failed" ? "failed" : "done";
  return createToolActivityItem({
    id: item.id,
    toolName: item.toolName,
    summary: item.summary,
    detail: item.detail,
    expanded: item.expanded,
    status,
  });
}

function upsertRunActivityItem(items: RunActivityItem[], item: RunActivityItem): RunActivityItem[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) {
    return [...items, item];
  }
  const next = [...items];
  next[index] = {
    ...item,
    expanded: item.expanded || next[index]?.expanded === true,
  };
  return next;
}

function updateStreamingItems(items: ChatItem[], nextState: ChatMessageItem["state"]): ChatItem[] {
  return items.map((item) =>
    item.kind === "message" && item.role === "assistant" && item.state === "streaming"
      ? { ...item, state: nextState }
      : item,
  );
}

function cloneContentBlocks(
  blocks: ChatMessageContentBlock[] | undefined,
): ChatMessageContentBlock[] | undefined {
  return Array.isArray(blocks) ? blocks.map((block) => ({ ...block })) : undefined;
}

function cloneToolResults(
  toolResults: Record<string, string> | undefined,
): Record<string, string> | undefined {
  return toolResults ? { ...toolResults } : undefined;
}

function cloneChatItem(item: ChatItem): ChatItem {
  if (item.kind === "message") {
    return {
      ...item,
      ...(item.contentBlocks ? { contentBlocks: cloneContentBlocks(item.contentBlocks) } : {}),
      ...(item.toolResults ? { toolResults: cloneToolResults(item.toolResults) } : {}),
    };
  }
  return { ...item };
}

function messageReferencesToolCall(item: ChatItem, toolCallId: string): item is ChatMessageItem {
  return (
    item.kind === "message" &&
    item.role === "assistant" &&
    Array.isArray(item.contentBlocks) &&
    item.contentBlocks.some((block) => block.type === "toolCall" && block.id === toolCallId)
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function containsToolErrorText(value: string): boolean {
  return /error|failed|失败|异常/i.test(value);
}

export function shouldAlwaysShowToolItem(item: ChatItem): boolean {
  if (item.kind !== "tool") {
    return false;
  }
  if (item.status === "running") {
    return true;
  }
  const detail = item.detail.trim();
  const searchableText = `${item.summary}\n${detail}`;
  if (!detail) {
    return containsToolErrorText(searchableText);
  }
  try {
    const parsed = JSON.parse(detail);
    const row = toRecord(parsed);
    if (typeof row.error === "string" && row.error.trim()) {
      return true;
    }
    if (row.ok === false) {
      return true;
    }
    const response = toRecord(row.response);
    if (response.ok === false) {
      return true;
    }
    const bridgeResult = toRecord(response.response);
    if (bridgeResult.ok === false) {
      return true;
    }
    return containsToolErrorText(searchableText);
  } catch {
    return containsToolErrorText(searchableText);
  }
}

export function filterChatItemsForToolHistory(
  items: readonly ChatItem[],
  showToolHistory: boolean,
): ChatItem[] {
  return items.filter((item) => {
    if (item.kind !== "tool") {
      return true;
    }
    return showToolHistory || shouldAlwaysShowToolItem(item);
  });
}

export function shouldAlwaysShowRunActivityItem(item: RunActivityItem): boolean {
  return (
    item.visibility === "always" ||
    item.status === "running" ||
    item.status === "failed" ||
    item.status === "blocked" ||
    item.status === "intervention" ||
    item.severity === "error" ||
    item.severity === "warning"
  );
}

export function filterRunActivityItems(
  items: readonly RunActivityItem[],
  showActivityHistory: boolean,
): RunActivityItem[] {
  return items.filter((item) => showActivityHistory || shouldAlwaysShowRunActivityItem(item));
}

export function createInitialChatState(): ChatState {
  return {
    sessionId: null,
    status: "idle",
    items: [],
    error: null,
    runActivity: createInitialRunActivity(),
  };
}

export function applyBootstrapState(state: ChatState, payload: ChatBootstrapPayload): ChatState {
  const status = normalizeStatus(payload.runState?.status);
  const messages = Array.isArray(payload.messages)
    ? payload.messages.map((item) => cloneChatItem(item))
    : [];
  const transcriptItems = messages.filter((item) => item.kind !== "tool");
  const projectedActivity = messages
    .filter((item): item is ChatToolItem => item.kind === "tool")
    .map((item) => projectToolItemToActivity(item));
  const explicitActivity = Array.isArray(payload.runActivity?.items)
    ? payload.runActivity.items.map((item) => cloneRunActivityItem(item))
    : [];

  return {
    ...state,
    sessionId: payload.sessionId ?? null,
    status,
    items: transcriptItems,
    error: null,
    runActivity: {
      current: createRunStatusView({
        status,
        phase: payload.runState?.phase,
        summary: payload.runState?.summary,
        currentActivityId: payload.runState?.currentActivityId,
      }),
      items: [...explicitActivity, ...projectedActivity],
    },
  };
}

export function applyChatEvent(state: ChatState, event: ChatEvent): ChatState {
  const nextSessionId = event.sessionId ?? state.sessionId;

  switch (event.type) {
    case "run.state": {
      const status = normalizeStatus(event.status);
      return {
        ...state,
        sessionId: nextSessionId,
        status,
        items: status === "stopped" ? updateStreamingItems(state.items, "stopped") : state.items,
        runActivity: {
          ...state.runActivity,
          current: createRunStatusView({
            status,
            phase: event.phase,
            summary: event.summary,
            currentActivityId: event.currentActivityId,
          }),
        },
      };
    }
    case "assistant.delta": {
      const chunk = String(event.chunk ?? "");
      const existingIndex = state.items.findIndex(
        (item) => item.kind === "message" && item.id === event.messageId,
      );
      if (existingIndex >= 0) {
        const items = [...state.items];
        const existing = items[existingIndex] as ChatMessageItem;
        items[existingIndex] = {
          ...existing,
          text: `${existing.text}${chunk}`,
          state: "streaming",
        };
        return {
          ...state,
          sessionId: nextSessionId,
          items,
          runActivity: {
            ...state.runActivity,
            current: createRunStatusView({
              status: state.status === "idle" ? "running" : state.status,
              phase: event.phase ?? "model_streaming",
              summary: "模型正在生成回复",
            }),
          },
        };
      }
      return {
        ...state,
        sessionId: nextSessionId,
        runActivity: {
          ...state.runActivity,
          current: createRunStatusView({
            status: state.status === "idle" ? "running" : state.status,
            phase: event.phase ?? "model_streaming",
            summary: "模型正在生成回复",
          }),
        },
        items: [
          ...state.items,
          {
            id: event.messageId,
            kind: "message",
            role: "assistant",
            text: chunk,
            state: "streaming",
          },
        ],
      };
    }
    case "assistant.done": {
      const text = String(event.text ?? "");
      const items = [...state.items];
      const existingIndex = items.findIndex(
        (item) => item.kind === "message" && item.id === event.messageId,
      );
      const contentBlocks = cloneContentBlocks(event.contentBlocks);
      const toolResults = cloneToolResults(event.toolResults);
      if (existingIndex >= 0) {
        const existing = items[existingIndex] as ChatMessageItem;
        items[existingIndex] = {
          ...existing,
          text,
          state: "complete",
          ...(contentBlocks ? { contentBlocks } : {}),
          ...(toolResults ? { toolResults } : {}),
        };
      } else {
        items.push({
          id: event.messageId,
          kind: "message",
          role: "assistant",
          text,
          state: "complete",
          ...(contentBlocks ? { contentBlocks } : {}),
          ...(toolResults ? { toolResults } : {}),
        });
      }
      const absorbedToolIds = new Set(
        (contentBlocks ?? [])
          .filter((block): block is Extract<ChatMessageContentBlock, { type: "toolCall" }> => {
            return (
              block.type === "toolCall" &&
              Boolean(toolResults) &&
              Object.prototype.hasOwnProperty.call(toolResults, block.id)
            );
          })
          .map((block) => block.id),
      );
      return {
        ...state,
        sessionId: nextSessionId,
        runActivity: {
          ...state.runActivity,
          current: createRunStatusView({
            status: state.status,
            phase: event.phase ?? "finalizing",
            summary: "正在整理最终回复",
          }),
        },
        items:
          absorbedToolIds.size > 0
            ? items.filter((item) => !(item.kind === "tool" && absorbedToolIds.has(item.id)))
            : items,
      };
    }
    case "tool.call": {
      const toolName = String(event.toolName ?? "").trim() || "工具调用";
      const toolCallId =
        typeof event.toolCallId === "string" && event.toolCallId.trim()
          ? event.toolCallId.trim()
          : event.messageId;
      const activityItem = createToolActivityItem({
        id: toolCallId,
        toolName,
        summary: String(event.summary ?? "").trim() || `执行中 · ${toolName}`,
        detail: String(event.detail ?? ""),
        status: "running",
      });
      return {
        ...state,
        sessionId: nextSessionId,
        status: state.status === "idle" ? "running" : state.status,
        runActivity: {
          current: createRunStatusView({
            status: "running",
            phase: event.phase ?? "tool_running",
            summary: toolName,
            currentActivityId: activityItem.id,
          }),
          items: upsertRunActivityItem(state.runActivity.items, activityItem),
        },
      };
    }
    case "tool.result": {
      const items = [...state.items];
      const toolCallId =
        typeof event.toolCallId === "string" && event.toolCallId.trim()
          ? event.toolCallId.trim()
          : event.messageId;
      const activityStatus = normalizeRunActivityStatus(
        event.status,
        isFailedToolTrace(event.summary, event.detail) ? "failed" : "done",
      );
      const activityItem = createToolActivityItem({
        id: toolCallId,
        toolName: event.toolName,
        summary: event.summary,
        detail: event.detail,
        status: activityStatus,
      });
      const assistantIndex = items.findIndex((item) => messageReferencesToolCall(item, toolCallId));
      if (assistantIndex >= 0) {
        const assistant = items[assistantIndex] as ChatMessageItem;
        items[assistantIndex] = {
          ...assistant,
          toolResults: {
            ...(assistant.toolResults ?? {}),
            [toolCallId]: event.detail,
          },
        };
        return {
          ...state,
          sessionId: nextSessionId,
          runActivity: {
            current: createRunStatusView({
              status: state.status,
              phase: event.phase ?? "processing_result",
              summary: event.summary,
              currentActivityId: activityItem.id,
            }),
            items: upsertRunActivityItem(state.runActivity.items, activityItem),
          },
          items: items.filter(
            (item) =>
              !(item.kind === "tool" && (item.id === event.messageId || item.id === toolCallId)),
          ),
        };
      }
      return {
        ...state,
        sessionId: nextSessionId,
        runActivity: {
          current: createRunStatusView({
            status: state.status,
            phase: event.phase ?? "processing_result",
            summary: event.summary,
            currentActivityId: activityItem.id,
          }),
          items: upsertRunActivityItem(state.runActivity.items, activityItem),
        },
      };
    }
    case "run.compaction": {
      const id = `activity:compaction:${event.messageId || state.runActivity.items.length + 1}`;
      const item: RunActivityItem = {
        id,
        kind: "compaction",
        title: "上下文压缩",
        summary: String(event.summary ?? "正在压缩上下文"),
        detail: String(event.detail ?? ""),
        expanded: false,
        status: "running",
        severity: "info",
        visibility: "always",
      };
      return {
        ...state,
        sessionId: nextSessionId,
        runActivity: {
          current: createRunStatusView({
            status: state.status === "idle" ? "running" : state.status,
            phase: "compacting",
            summary: item.summary,
            currentActivityId: id,
          }),
          items: upsertRunActivityItem(state.runActivity.items, item),
        },
      };
    }
    case "intervention.requested": {
      const id = `activity:intervention:${event.messageId || state.runActivity.items.length + 1}`;
      const item: RunActivityItem = {
        id,
        kind: "intervention",
        title: String(event.title ?? "需要人工介入"),
        summary: String(event.summary ?? "等待用户处理"),
        detail: String(event.detail ?? ""),
        expanded: true,
        status: "intervention",
        severity: "warning",
        visibility: "always",
      };
      return {
        ...state,
        sessionId: nextSessionId,
        runActivity: {
          current: createRunStatusView({
            status: state.status === "idle" ? "running" : state.status,
            phase: "waiting_for_user",
            summary: item.summary,
            currentActivityId: id,
          }),
          items: upsertRunActivityItem(state.runActivity.items, item),
        },
      };
    }
    case "run.error":
      return {
        ...state,
        sessionId: nextSessionId,
        error: String(event.message ?? "Runtime error"),
        items: updateStreamingItems(state.items, "error"),
        runActivity: {
          current: createRunStatusView({
            status: state.status,
            phase: "failed",
            summary: String(event.message ?? "Runtime error"),
          }),
          items: upsertRunActivityItem(state.runActivity.items, {
            id: `activity:error:${state.runActivity.items.length + 1}`,
            kind: "error",
            title: "运行错误",
            summary: String(event.message ?? "Runtime error"),
            detail: String(event.message ?? "Runtime error"),
            expanded: true,
            status: "failed",
            severity: "error",
            visibility: "always",
          }),
        },
      };
    default:
      return state;
  }
}

export function toggleToolExpanded(state: ChatState, id: string): ChatState {
  return {
    ...state,
    items: state.items.map((item) =>
      item.kind === "tool" && item.id === id ? { ...item, expanded: !item.expanded } : item,
    ),
  };
}

export function toggleRunActivityExpanded(state: ChatState, id: string): ChatState {
  return {
    ...state,
    runActivity: {
      ...state.runActivity,
      items: state.runActivity.items.map((item) =>
        item.id === id ? { ...item, expanded: !item.expanded } : item,
      ),
    },
  };
}

export function toggleSystemMessageExpanded(state: ChatState, id: string): ChatState {
  return {
    ...state,
    items: state.items.map((item) =>
      item.kind === "message" && item.role === "system" && item.id === id
        ? { ...item, expanded: !item.expanded }
        : item,
    ),
  };
}
