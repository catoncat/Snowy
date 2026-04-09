export type ChatRunStatus = "idle" | "running" | "stopped";

type RichTextMode = "plain" | "rich";

export interface RichTextRenderResult {
  mode: RichTextMode;
  html: string;
}

export interface ToolTraceRenderResult {
  structured: boolean;
  preview: string[];
  html: string;
}

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

const CODE_FENCE_PATTERN = /```([\w-]+)?\n([\s\S]*?)```/g;
const INLINE_MARKDOWN_PATTERN = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
const SAFE_LINK_PATTERN = /^(https?:\/\/|mailto:)/i;
const TRACE_SECTION_KEYS = [
  ["Input", ["input", "args", "parameters", "request"]],
  ["Output", ["output", "result", "response", "data"]],
  ["Error", ["error"]],
] as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderInlineMarkdown(text: string): RichTextRenderResult {
  let html = "";
  let cursor = 0;
  let rich = false;

  for (const match of text.matchAll(INLINE_MARKDOWN_PATTERN)) {
    const index = match.index ?? 0;
    html += escapeHtml(text.slice(cursor, index));
    if (match[1]) {
      html += `<code>${escapeHtml(match[1])}</code>`;
      rich = true;
    } else if (match[2] && match[3] && SAFE_LINK_PATTERN.test(match[3])) {
      html += `<a href="${escapeHtml(match[3])}" target="_blank" rel="noreferrer">${escapeHtml(match[2])}</a>`;
      rich = true;
    } else {
      html += escapeHtml(match[0]);
    }
    cursor = index + match[0].length;
  }

  html += escapeHtml(text.slice(cursor));
  return { mode: rich ? "rich" : "plain", html };
}

function renderTextBlocks(text: string): RichTextRenderResult {
  const chunks = text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  let rich = chunks.length > 1;
  const html = chunks
    .map((chunk) => {
      const lines = chunk.split("\n");
      const unordered = lines.every((line) => /^[-*]\s+/.test(line));
      const ordered = lines.every((line) => /^\d+\.\s+/.test(line));
      if (unordered || ordered) {
        rich = true;
        const tag = unordered ? "ul" : "ol";
        const items = lines
          .map((line) => line.replace(unordered ? /^[-*]\s+/ : /^\d+\.\s+/, ""))
          .map((line) => `<li>${renderInlineMarkdown(line).html}</li>`)
          .join("");
        return `<${tag}>${items}</${tag}>`;
      }
      const inline = renderInlineMarkdown(chunk);
      rich ||= inline.mode === "rich" || chunk.includes("\n");
      return `<p>${inline.html.replaceAll("\n", "<br />")}</p>`;
    })
    .join("");

  return { mode: rich ? "rich" : "plain", html };
}

function toJsonBlock(label: string, value: unknown): string {
  return `<section><h4>${escapeHtml(label)}</h4><pre><code>${escapeHtml(JSON.stringify(value, null, 2))}</code></pre></section>`;
}

function parseStructuredTrace(detail: string): ToolTraceRenderResult | null {
  try {
    const parsed = JSON.parse(detail) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = Array.isArray(parsed) ? { items: parsed } : (parsed as Record<string, unknown>);
    const preview: string[] = [];
    if (typeof record.status === "string") {
      preview.push(`status ${record.status}`);
    }
    if (typeof record.durationMs === "number") {
      preview.push(`${record.durationMs} ms`);
    }
    if (typeof record.count === "number") {
      preview.push(`${record.count} items`);
    }
    if (Array.isArray(record.items)) {
      preview.push(`${record.items.length} items`);
    }

    const usedKeys = new Set<string>();
    const sections: string[] = [];
    for (const [label, keys] of TRACE_SECTION_KEYS) {
      const key = keys.find((candidate) => candidate in record);
      if (!key) {
        continue;
      }
      usedKeys.add(key);
      sections.push(toJsonBlock(label, record[key]));
    }

    const remaining = Object.fromEntries(
      Object.entries(record).filter(
        ([key]) =>
          !usedKeys.has(key) && key !== "status" && key !== "durationMs" && key !== "count",
      ),
    );
    if (Object.keys(remaining).length > 0) {
      sections.push(toJsonBlock("Meta", remaining));
    }

    return {
      structured: true,
      preview,
      html: sections.length > 0 ? sections.join("") : toJsonBlock("Trace", record),
    };
  } catch {
    return null;
  }
}

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

export function renderMessageRichText(text: string): RichTextRenderResult {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return { mode: "plain", html: "<p></p>" };
  }

  let cursor = 0;
  let rich = false;
  const blocks: string[] = [];

  for (const match of normalized.matchAll(CODE_FENCE_PATTERN)) {
    const index = match.index ?? 0;
    const before = normalized.slice(cursor, index).trim();
    if (before) {
      const rendered = renderTextBlocks(before);
      rich ||= rendered.mode === "rich";
      blocks.push(rendered.html);
    }
    const language = match[1]?.trim();
    const code = match[2] ?? "";
    blocks.push(
      `<pre><code${language ? ` data-language="${escapeHtml(language)}"` : ""}>${escapeHtml(code)}</code></pre>`,
    );
    rich = true;
    cursor = index + match[0].length;
  }

  const tail = normalized.slice(cursor).trim();
  if (tail) {
    const rendered = renderTextBlocks(tail);
    rich ||= rendered.mode === "rich";
    blocks.push(rendered.html);
  }

  if (!rich) {
    return {
      mode: "plain",
      html: `<p>${escapeHtml(normalized).replaceAll("\n", "<br />")}</p>`,
    };
  }

  return { mode: "rich", html: blocks.join("") };
}

export function renderToolTrace(summary: string, detail: string): ToolTraceRenderResult {
  const structured = parseStructuredTrace(detail);
  if (structured) {
    return structured;
  }
  return {
    structured: false,
    preview: summary ? [summary] : [],
    html: `<pre><code>${escapeHtml(detail || summary || "No trace details.")}</code></pre>`,
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
      if (existingIndex >= 0) {
        const existing = items[existingIndex] as ChatMessageItem;
        items[existingIndex] = { ...existing, text, state: "complete" };
      } else {
        items.push({
          id: event.messageId,
          kind: "message",
          role: "assistant",
          text,
          state: "complete",
        });
      }
      return { ...state, sessionId: nextSessionId, items };
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
