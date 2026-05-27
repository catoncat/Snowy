export type ChatRunStatus = "idle" | "running" | "stopped";

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
}

export type ChatItem = ChatMessageItem | ChatToolItem;

export interface ChatState {
  sessionId: string | null;
  status: ChatRunStatus;
  items: ChatItem[];
  error: string | null;
}

export interface ChatBootstrapPayload {
  sessionId: string | null;
  runState?: { status?: ChatRunStatus | string } | null;
  messages?: ChatItem[];
}

export interface ChatEventBase {
  sessionId?: string | null;
}

export type ChatEvent =
  | ({ type: "run.state"; status?: ChatRunStatus | string } & ChatEventBase)
  | ({ type: "assistant.delta"; messageId: string; chunk?: string } & ChatEventBase)
  | ({
      type: "assistant.done";
      messageId: string;
      text?: string;
      contentBlocks?: ChatMessageContentBlock[];
      toolResults?: Record<string, string>;
    } & ChatEventBase)
  | ({
      type: "tool.result";
      messageId: string;
      toolCallId?: string;
      toolName: string;
      summary: string;
      detail: string;
    } & ChatEventBase)
  | ({ type: "run.error"; message?: string } & ChatEventBase);

function normalizeStatus(status: string | null | undefined): ChatRunStatus {
  return status === "running" || status === "stopped" ? status : "idle";
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

export function createInitialChatState(): ChatState {
  return {
    sessionId: null,
    status: "idle",
    items: [],
    error: null,
  };
}

export function applyBootstrapState(state: ChatState, payload: ChatBootstrapPayload): ChatState {
  return {
    ...state,
    sessionId: payload.sessionId ?? null,
    status: normalizeStatus(payload.runState?.status),
    items: Array.isArray(payload.messages)
      ? payload.messages.map((item) => cloneChatItem(item))
      : [],
    error: null,
  };
}

export function applyChatEvent(state: ChatState, event: ChatEvent): ChatState {
  const nextSessionId = event.sessionId ?? state.sessionId;

  switch (event.type) {
    case "run.state":
      return {
        ...state,
        sessionId: nextSessionId,
        status: normalizeStatus(event.status),
        items:
          normalizeStatus(event.status) === "stopped"
            ? updateStreamingItems(state.items, "stopped")
            : state.items,
      };
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
        return { ...state, sessionId: nextSessionId, items };
      }
      return {
        ...state,
        sessionId: nextSessionId,
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
      return { ...state, sessionId: nextSessionId, items };
    }
    case "tool.result": {
      const items = [...state.items];
      const toolCallId =
        typeof event.toolCallId === "string" && event.toolCallId.trim()
          ? event.toolCallId.trim()
          : event.messageId;
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
        return { ...state, sessionId: nextSessionId, items };
      }
      const toolItem: ChatToolItem = {
        id: event.messageId,
        kind: "tool",
        toolName: event.toolName,
        summary: event.summary,
        detail: event.detail,
        expanded: false,
      };
      const existingIndex = items.findIndex(
        (item) => item.kind === "tool" && item.id === event.messageId,
      );
      if (existingIndex >= 0) {
        items[existingIndex] = toolItem;
      } else {
        items.push(toolItem);
      }
      return { ...state, sessionId: nextSessionId, items };
    }
    case "run.error":
      return {
        ...state,
        sessionId: nextSessionId,
        error: String(event.message ?? "Runtime error"),
        items: updateStreamingItems(state.items, "error"),
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
