import { type PropType, computed, defineComponent, h } from "vue";
import {
  type RichTextRenderResult,
  type ToolTraceRenderResult,
  renderMessageRichText,
  renderToolTrace,
} from "./renderers";
import type { ChatItem, ChatMessageContentBlock, ChatMessageItem, ChatToolItem } from "./state";

type RenderedMessageItem = ChatMessageItem & {
  rendered: RichTextRenderResult;
};

type RenderedToolItem = ChatToolItem & {
  rendered: ToolTraceRenderResult;
};

type RenderedChatItem = RenderedMessageItem | RenderedToolItem;

type RenderedAssistantTextBlock = {
  key: string;
  type: "text";
  text: string;
  rendered: RichTextRenderResult;
};

type RenderedAssistantToolCallBlock = {
  key: string;
  type: "toolCall";
  id: string;
  name: string;
  arguments: string;
  resultContent: string;
  rendered: ToolTraceRenderResult | null;
};

type RenderedAssistantBlock = RenderedAssistantTextBlock | RenderedAssistantToolCallBlock;

export interface ChatMessageCopyPayload {
  id: string;
  text: string;
  role: ChatMessageItem["role"];
}

export interface ChatMessageForkPayload {
  id: string;
}

export interface ChatMessageRetryPayload {
  id: string;
}

export interface ChatMessageEditPayload {
  id: string;
  text: string;
}

export interface ChatCodeCopyPayload {
  code: string;
  language: string;
  messageId: string;
}

function findMessageIndex(items: ChatItem[], id: string): number {
  return items.findIndex((item) => item.kind === "message" && item.id === id);
}

function findAssistantTurnBounds(items: ChatItem[], assistantIndex: number) {
  if (assistantIndex < 0 || assistantIndex >= items.length) {
    return null;
  }
  const item = items[assistantIndex];
  if (item?.kind !== "message" || item.role !== "assistant") {
    return null;
  }

  let start = assistantIndex - 1;
  while (start >= 0) {
    const candidate = items[start];
    if (candidate?.kind === "message" && candidate.role === "user") {
      break;
    }
    start -= 1;
  }

  let end = assistantIndex + 1;
  while (end < items.length) {
    const candidate = items[end];
    if (candidate?.kind === "message" && candidate.role === "user") {
      break;
    }
    end += 1;
  }

  return {
    start: start + 1,
    end: end - 1,
  };
}

export function isCopyableAssistantMessage(items: ChatItem[], id: string): boolean {
  const index = findMessageIndex(items, id);
  const bounds = findAssistantTurnBounds(items, index);
  if (!bounds) {
    return false;
  }
  for (let cursor = bounds.end; cursor >= bounds.start; cursor -= 1) {
    const candidate = items[cursor];
    if (candidate?.kind !== "message" || candidate.role !== "assistant") {
      continue;
    }
    if (candidate.state === "streaming") {
      continue;
    }
    if (!assistantMessageText(candidate).trim()) {
      continue;
    }
    return candidate.id === id;
  }
  return false;
}

export function isForkableAssistantMessage(items: ChatItem[], id: string): boolean {
  const index = findMessageIndex(items, id);
  if (!isCopyableAssistantMessage(items, id)) {
    return false;
  }
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = items[cursor];
    if (candidate?.kind === "message" && candidate.role === "user" && candidate.text.trim()) {
      return true;
    }
  }
  return false;
}

export function isRetryableAssistantMessage(items: ChatItem[], id: string): boolean {
  if (!isForkableAssistantMessage(items, id)) {
    return false;
  }
  for (let cursor = items.length - 1; cursor >= 0; cursor -= 1) {
    const candidate = items[cursor];
    if (candidate?.kind !== "message" || candidate.role !== "assistant") {
      continue;
    }
    if (candidate.state === "streaming") {
      continue;
    }
    if (!assistantMessageText(candidate).trim()) {
      continue;
    }
    return candidate.id === id;
  }
  return false;
}

export function isEditableUserMessage(items: ChatItem[], id: string): boolean {
  const index = findMessageIndex(items, id);
  const item = items[index];
  return item?.kind === "message" && item.role === "user" && item.text.trim().length > 0;
}

export function collectAssistantTurnText(items: ChatItem[], id: string): string {
  const index = findMessageIndex(items, id);
  const bounds = findAssistantTurnBounds(items, index);
  if (!bounds) {
    return "";
  }
  return items
    .slice(bounds.start, bounds.end + 1)
    .filter((item): item is ChatMessageItem => item.kind === "message" && item.role === "assistant")
    .map((item) => assistantMessageText(item).trim())
    .filter(Boolean)
    .join("\n\n");
}

function assistantMessageText(item: ChatMessageItem): string {
  if (Array.isArray(item.contentBlocks) && item.contentBlocks.length > 0) {
    return item.contentBlocks
      .filter((block): block is Extract<ChatMessageContentBlock, { type: "text" }> => {
        return block.type === "text";
      })
      .map((block) => block.text)
      .join("");
  }
  return item.text;
}

function normalizeMarkdownSegment(text: string): string {
  const value = String(text || "");
  if (!value.trim()) {
    return "";
  }
  return `${value.replace(/\s+$/u, "")}\n\n`;
}

function renderableAssistantBlocks(item: ChatMessageItem): RenderedAssistantBlock[] | null {
  if (!Array.isArray(item.contentBlocks) || item.contentBlocks.length === 0) {
    return null;
  }

  const blocks: RenderedAssistantBlock[] = [];
  let textIndex = 0;

  for (const block of item.contentBlocks) {
    if (block.type === "text") {
      const text = normalizeMarkdownSegment(block.text);
      if (!text) {
        continue;
      }
      const previous = blocks[blocks.length - 1];
      if (previous?.type === "text") {
        previous.text = `${previous.text}${text}`;
        previous.rendered = renderMessageRichText(previous.text);
      } else {
        blocks.push({
          key: `text-${textIndex}`,
          type: "text",
          text,
          rendered: renderMessageRichText(text),
        });
        textIndex += 1;
      }
      continue;
    }

    const resultContent = item.toolResults?.[block.id] ?? "";
    blocks.push({
      key: `tool-${block.id}`,
      type: "toolCall",
      id: block.id,
      name: block.name,
      arguments: block.arguments,
      resultContent,
      rendered: resultContent ? renderToolTrace(block.name, resultContent) : null,
    });
  }

  return blocks.length > 0 ? blocks : null;
}

function renderRichTextContent(
  messageId: string,
  text: string,
  rendered: RichTextRenderResult,
  options?: {
    onCopyCode?: (payload: ChatCodeCopyPayload) => void;
  },
) {
  if (rendered.mode === "rich") {
    return h("div", {
      class: "sidepanel-rich-text text-[14px] leading-6",
      innerHTML: rendered.html,
      onClick: (event: { target: unknown; preventDefault?: () => void }) => {
        const target = event.target as {
          closest?: (selector: string) => { getAttribute?: (name: string) => string | null } | null;
        };
        const button = target.closest?.("button[data-code-copy]");
        const indexValue = button?.getAttribute?.("data-code-copy");
        if (!indexValue) {
          return;
        }
        const index = Number.parseInt(indexValue, 10);
        const codeBlock = rendered.codeBlocks[index];
        if (!codeBlock) {
          return;
        }
        event.preventDefault?.();
        options?.onCopyCode?.({
          code: codeBlock.code,
          language: codeBlock.language,
          messageId,
        });
      },
    });
  }
  return h("p", { class: "whitespace-pre-wrap text-[14px] leading-6" }, text);
}

function renderInlineToolCallBlock(block: RenderedAssistantToolCallBlock) {
  const previewLine = block.rendered?.preview.filter(Boolean).join(" · ") ?? "";
  const hasResult = block.resultContent.trim().length > 0;

  return h(
    "div",
    {
      class: "rounded-lg border border-slate-200/70 bg-slate-50/80 px-3 py-2 shadow-sm",
      role: "group",
      "aria-label": `工具调用：${block.name}`,
      "data-testid": "assistant-tool-call-inline",
    },
    [
      h("div", { class: "flex min-w-0 items-center gap-2" }, [
        h(
          "div",
          {
            class:
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-[10px] font-bold text-emerald-600",
            "aria-hidden": "true",
          },
          hasResult ? "✓" : "{}",
        ),
        h(
          "p",
          { class: "truncate text-[12px] font-semibold leading-snug text-slate-800" },
          block.name,
        ),
        h(
          "span",
          { class: "ml-auto shrink-0 text-[11px] text-slate-500" },
          hasResult ? "已完成" : "等待工具结果",
        ),
      ]),
      previewLine
        ? h("p", { class: "mt-1 truncate text-[11px] leading-snug text-slate-500" }, previewLine)
        : null,
      block.rendered
        ? h("div", {
            class:
              "sidepanel-tool-trace mt-2 max-h-[160px] overflow-auto rounded-md bg-white/70 p-2 font-mono text-[10px] leading-snug text-slate-700",
            innerHTML: block.rendered.html,
          })
        : null,
    ],
  );
}

function renderMessageContent(
  item: RenderedMessageItem,
  options?: {
    onCopyCode?: (payload: ChatCodeCopyPayload) => void;
  },
) {
  if (item.role === "assistant") {
    const blocks = renderableAssistantBlocks(item);
    if (blocks) {
      return h(
        "div",
        { class: "sidepanel-assistant-content-blocks flex flex-col gap-3" },
        blocks.map((block) =>
          block.type === "text"
            ? h("div", { key: block.key, class: "max-w-none text-slate-950" }, [
                renderRichTextContent(item.id, block.text, block.rendered, options),
              ])
            : h("div", { key: block.key }, [renderInlineToolCallBlock(block)]),
        ),
      );
    }
    return renderRichTextContent(item.id, item.text, item.rendered, options);
  }
  return h("p", { class: "whitespace-pre-wrap text-[14px] leading-6" }, item.text);
}

function renderMessageArticle(
  item: RenderedMessageItem,
  options: {
    copyable: boolean;
    retryable: boolean;
    forkable: boolean;
    copied: boolean;
    retrying: boolean;
    forking: boolean;
    editing: boolean;
    editDraft: string;
    editSubmitting: boolean;
    onCopy: (payload: ChatMessageCopyPayload) => void;
    onRetry: (payload: ChatMessageRetryPayload) => void;
    onFork: (payload: ChatMessageForkPayload) => void;
    onEdit: (payload: ChatMessageEditPayload) => void;
    onEditChange: (payload: ChatMessageEditPayload) => void;
    onEditCancel: (payload: ChatMessageEditPayload) => void;
    onEditSubmit: (payload: ChatMessageEditPayload) => void;
    onCopyCode: (payload: ChatCodeCopyPayload) => void;
  },
) {
  if (item.role === "user") {
    const draft = options.editing ? options.editDraft : item.text;
    return h(
      "article",
      {
        class: "group flex flex-col items-end gap-1.5 py-2 pl-10",
        "aria-label": "用户发送的内容",
      },
      [
        options.editing
          ? h(
              "div",
              {
                class: "w-full rounded-2xl border border-blue-200 bg-white px-3 py-3 shadow-sm",
                "data-testid": "user-inline-editor",
              },
              [
                h("textarea", {
                  class:
                    "min-h-[54px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] leading-relaxed text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  "data-testid": "user-inline-editor-input",
                  "aria-label": "编辑用户消息",
                  value: draft,
                  disabled: options.editSubmitting,
                  onInput: (event: { target?: { value?: string } }) =>
                    options.onEditChange({
                      id: item.id,
                      text: String(event.target?.value ?? ""),
                    }),
                }),
                h("div", { class: "mt-2 flex items-center justify-end gap-1.5" }, [
                  h(
                    "button",
                    {
                      type: "button",
                      class:
                        "rounded-md px-2 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      "aria-label": "取消编辑",
                      title: "取消编辑",
                      disabled: options.editSubmitting,
                      onClick: () =>
                        options.onEditCancel({
                          id: item.id,
                          text: draft,
                        }),
                    },
                    "取消",
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      class:
                        "rounded-md px-2 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      "aria-label": "提交编辑并重跑",
                      title: "提交编辑并重跑",
                      disabled: options.editSubmitting || !draft.trim(),
                      onClick: () =>
                        options.onEditSubmit({
                          id: item.id,
                          text: draft,
                        }),
                    },
                    options.editSubmitting ? "提交中" : "提交",
                  ),
                ]),
              ],
            )
          : h(
              "div",
              {
                class:
                  "max-w-[86%] rounded-[20px] border border-slate-200 bg-slate-100 px-4 py-2.5 text-slate-950 shadow-sm",
              },
              [renderMessageContent(item)],
            ),
        !options.editing && isEditableUserMessage([item], item.id)
          ? h(
              "button",
              {
                type: "button",
                class:
                  "rounded-md px-2 py-1 text-[12px] font-medium text-slate-500 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-950 group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                "aria-label": "编辑并重跑",
                title: "编辑并重跑",
                disabled: options.editSubmitting || options.forking || options.retrying,
                onClick: () =>
                  options.onEdit({
                    id: item.id,
                    text: item.text,
                  }),
              },
              "编辑",
            )
          : null,
      ],
    );
  }

  return h(
    "article",
    {
      class: "group flex flex-col gap-2 py-2 pr-2 text-slate-950",
      "aria-label": item.state === "streaming" ? "助手正在生成回复" : "助手回复的内容",
      "data-testid": item.state === "streaming" ? "assistant-streaming-message" : undefined,
    },
    [
      h(
        "div",
        {
          class:
            item.state === "streaming" ? "max-w-none text-slate-950" : "max-w-none text-slate-950",
        },
        [
          renderMessageContent(item, {
            onCopyCode: options.onCopyCode,
          }),
        ],
      ),
      item.state === "streaming"
        ? h(
            "span",
            {
              class: "inline-flex w-fit items-center text-[12px] font-mono text-slate-500",
              role: "status",
              "aria-live": "polite",
              "data-testid": "assistant-streaming-spinner",
            },
            item.text.trim()
              ? h("span", { class: "streaming-ellipsis", "aria-label": "正在生成" }, "...")
              : h("span", { "aria-label": "等待模型响应" }, "等待模型响应"),
          )
        : null,
      options.copyable || options.retryable || options.forkable
        ? h(
            "div",
            {
              class:
                "flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
              role: "toolbar",
              "aria-label": "消息操作",
            },
            [
              h(
                "button",
                {
                  type: "button",
                  class:
                    "rounded-md px-2 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  "aria-label": options.copied ? "已复制" : "复制内容",
                  title: options.copied ? "已复制" : "复制内容",
                  onClick: () =>
                    options.onCopy({
                      id: item.id,
                      role: item.role,
                      text: item.text,
                    }),
                },
                options.copied ? "已复制" : "复制",
              ),
              options.retryable
                ? h(
                    "button",
                    {
                      type: "button",
                      class:
                        "rounded-md px-2 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      "aria-label": "重新回答",
                      title: "重新回答",
                      disabled: options.retrying || options.forking,
                      onClick: () =>
                        options.onRetry({
                          id: item.id,
                        }),
                    },
                    options.retrying ? "重试中" : "重答",
                  )
                : null,
              options.forkable
                ? h(
                    "button",
                    {
                      type: "button",
                      class:
                        "rounded-md px-2 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      "aria-label": "在新对话中分叉",
                      title: "在新对话中分叉",
                      disabled: options.retrying || options.forking,
                      onClick: () =>
                        options.onFork({
                          id: item.id,
                        }),
                    },
                    options.forking ? "分叉中" : "分叉",
                  )
                : null,
            ],
          )
        : null,
    ],
  );
}

function renderRenderedMessageArticle(
  item: RenderedMessageItem,
  items: ChatItem[],
  copiedMessageId: string,
  retryingMessageId: string,
  forkingMessageId: string,
  editingMessageId: string,
  editDraft: string,
  editSubmitting: boolean,
  onCopy: (payload: ChatMessageCopyPayload) => void,
  onRetry: (payload: ChatMessageRetryPayload) => void,
  onFork: (payload: ChatMessageForkPayload) => void,
  onEdit: (payload: ChatMessageEditPayload) => void,
  onEditChange: (payload: ChatMessageEditPayload) => void,
  onEditCancel: (payload: ChatMessageEditPayload) => void,
  onEditSubmit: (payload: ChatMessageEditPayload) => void,
  onCopyCode: (payload: ChatCodeCopyPayload) => void,
) {
  return renderMessageArticle(item, {
    copyable: item.role === "assistant" && isCopyableAssistantMessage(items, item.id),
    retryable: item.role === "assistant" && isRetryableAssistantMessage(items, item.id),
    forkable: item.role === "assistant" && isForkableAssistantMessage(items, item.id),
    copied: copiedMessageId === item.id,
    retrying: retryingMessageId === item.id,
    forking: forkingMessageId === item.id,
    editing: editingMessageId === item.id,
    editDraft: editingMessageId === item.id ? editDraft : item.text,
    editSubmitting: editingMessageId === item.id && editSubmitting,
    onCopy: (payload) =>
      onCopy({
        ...payload,
        text: collectAssistantTurnText(items, item.id) || payload.text,
      }),
    onRetry,
    onFork,
    onEdit,
    onEditChange,
    onEditCancel,
    onEditSubmit,
    onCopyCode,
  });
}

function renderToolArticle(item: RenderedToolItem, onToggle: (id: string) => void) {
  const previewLine = item.rendered.preview.filter(Boolean).join(" · ");

  return h(
    "article",
    {
      class: "flex flex-col py-1 pr-2 transition-all duration-300 group/tool",
      role: "group",
      "aria-label": "工具执行结果",
      "data-testid": "tool-message",
    },
    [
      h(
        "div",
        {
          class:
            "overflow-hidden rounded-xl border border-slate-200/70 bg-white/80 shadow-sm transition-all duration-300",
        },
        [
          h("div", { class: "flex items-center gap-2 px-2.5 py-2" }, [
            h(
              "div",
              {
                class:
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500 shadow-inner",
                "aria-hidden": "true",
              },
              item.rendered.structured ? "{}" : ">",
            ),
            h("div", { class: "min-w-0 flex-1" }, [
              h("div", { class: "flex items-center justify-between gap-2" }, [
                h(
                  "span",
                  { class: "truncate text-[11px] font-bold text-slate-700" },
                  item.summary || item.toolName || "工具调用",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class:
                      "shrink-0 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                    "aria-label": item.expanded ? "收起运行详情" : "展开运行详情",
                    title: item.expanded ? "收起运行详情" : "展开运行详情",
                    "aria-expanded": item.expanded,
                    onClick: () => onToggle(item.id),
                  },
                  item.expanded ? "收起" : "展开",
                ),
              ]),
              previewLine
                ? h(
                    "p",
                    { class: "mt-0.5 truncate text-[10px] leading-tight text-slate-500" },
                    previewLine,
                  )
                : null,
            ]),
          ]),
          item.expanded
            ? h(
                "div",
                {
                  class: "animate-in border-t border-slate-200/70 bg-slate-50/70 p-2",
                  "data-structured": String(item.rendered.structured),
                },
                [
                  h("div", {
                    class:
                      "sidepanel-tool-trace max-h-[320px] overflow-auto rounded-lg border border-slate-200/70 bg-white/70 p-2.5 font-mono text-[10px] leading-snug text-slate-700",
                    innerHTML: item.rendered.html,
                  }),
                ],
              )
            : null,
        ],
      ),
    ],
  );
}

export const ChatTranscriptPane = defineComponent({
  name: "ChatTranscriptPane",
  props: {
    items: {
      type: Array as PropType<ChatItem[]>,
      required: true,
    },
    loading: {
      type: Boolean,
      default: false,
    },
    copiedMessageId: {
      type: String,
      default: "",
    },
    retryingMessageId: {
      type: String,
      default: "",
    },
    forkingMessageId: {
      type: String,
      default: "",
    },
    editingMessageId: {
      type: String,
      default: "",
    },
    editDraft: {
      type: String,
      default: "",
    },
    editSubmitting: {
      type: Boolean,
      default: false,
    },
  },
  emits: {
    toggleTool: (id: string) => typeof id === "string" && id.length > 0,
    copyMessage: (payload: ChatMessageCopyPayload) =>
      Boolean(payload?.id) && payload.role === "assistant" && payload.text.trim().length > 0,
    retryMessage: (payload: ChatMessageRetryPayload) => Boolean(payload?.id),
    forkMessage: (payload: ChatMessageForkPayload) => Boolean(payload?.id),
    editMessage: (payload: ChatMessageEditPayload) => Boolean(payload?.id),
    editChange: (payload: ChatMessageEditPayload) => Boolean(payload?.id),
    editCancel: (payload: ChatMessageEditPayload) => Boolean(payload?.id),
    editSubmit: (payload: ChatMessageEditPayload) =>
      Boolean(payload?.id) && payload.text.trim().length > 0,
    copyCode: (payload: ChatCodeCopyPayload) =>
      Boolean(payload?.messageId) && payload.code.length > 0,
  },
  setup(props, { emit }) {
    const renderedItems = computed<RenderedChatItem[]>(() =>
      props.items.map((item) =>
        item.kind === "message"
          ? {
              ...item,
              rendered:
                item.role === "assistant"
                  ? renderMessageRichText(item.text)
                  : { codeBlocks: [], mode: "plain", html: "" },
            }
          : {
              ...item,
              rendered: renderToolTrace(item.summary, item.detail),
            },
      ),
    );

    return () => {
      if (props.loading) {
        return h(
          "div",
          {
            class:
              "rounded-md border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500",
          },
          "Loading runtime chat…",
        );
      }

      if (renderedItems.value.length === 0) {
        return h(
          "div",
          {
            class:
              "rounded-md border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500",
          },
          "Send a message to start.",
        );
      }

      return h(
        "div",
        { class: "space-y-3" },
        renderedItems.value.map((item) =>
          item.kind === "message"
            ? renderRenderedMessageArticle(
                item,
                props.items,
                props.copiedMessageId,
                props.retryingMessageId,
                props.forkingMessageId,
                props.editingMessageId,
                props.editDraft,
                props.editSubmitting,
                (payload) => emit("copyMessage", payload),
                (payload) => emit("retryMessage", payload),
                (payload) => emit("forkMessage", payload),
                (payload) => emit("editMessage", payload),
                (payload) => emit("editChange", payload),
                (payload) => emit("editCancel", payload),
                (payload) => emit("editSubmit", payload),
                (payload) => emit("copyCode", payload),
              )
            : renderToolArticle(item, (id) => emit("toggleTool", id)),
        ),
      );
    };
  },
});
