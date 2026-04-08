export type ChatRunStatus = "idle" | "running" | "stopped";

export interface ChatMessageItem {
  id: string;
  kind: "message";
  role: "user" | "assistant";
  text: string;
  state: "complete" | "streaming" | "stopped" | "error";
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
  | ({ type: "assistant.done"; messageId: string; text?: string } & ChatEventBase)
  | ({
      type: "tool.result";
      messageId: string;
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
    items: Array.isArray(payload.messages) ? payload.messages.map((item) => ({ ...item })) : [],
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
        return {
          ...state,
          sessionId: nextSessionId,
          items,
        };
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
      if (existingIndex >= 0) {
        const existing = items[existingIndex] as ChatMessageItem;
        items[existingIndex] = {
          ...existing,
          text,
          state: "complete",
        };
      } else {
        items.push({
          id: event.messageId,
          kind: "message",
          role: "assistant",
          text,
          state: "complete",
        });
      }
      return {
        ...state,
        sessionId: nextSessionId,
        items,
      };
    }
    case "tool.result": {
      const items = [...state.items];
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
      return {
        ...state,
        sessionId: nextSessionId,
        items,
      };
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
