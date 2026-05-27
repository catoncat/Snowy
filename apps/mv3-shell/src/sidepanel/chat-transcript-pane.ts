import { type PropType, computed, defineComponent, h } from "vue";
import {
  type RichTextRenderResult,
  type ToolTraceRenderResult,
  renderMessageRichText,
  renderToolTrace,
} from "./renderers";
import type { ChatItem, ChatMessageItem, ChatToolItem } from "./state";

type RenderedMessageItem = ChatMessageItem & {
  rendered: RichTextRenderResult;
};

type RenderedToolItem = ChatToolItem & {
  rendered: ToolTraceRenderResult;
};

type RenderedChatItem = RenderedMessageItem | RenderedToolItem;

export interface ChatMessageCopyPayload {
  id: string;
  text: string;
  role: ChatMessageItem["role"];
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
    if (!candidate.text.trim()) {
      continue;
    }
    return candidate.id === id;
  }
  return false;
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
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function renderMessageContent(item: RenderedMessageItem) {
  if (item.role === "assistant" && item.rendered.mode === "rich") {
    return h("div", {
      class: "sidepanel-rich-text text-[14px] leading-6",
      innerHTML: item.rendered.html,
    });
  }
  return h("p", { class: "whitespace-pre-wrap text-[14px] leading-6" }, item.text);
}

function renderMessageArticle(
  item: RenderedMessageItem,
  options: {
    copyable: boolean;
    copied: boolean;
    onCopy: (payload: ChatMessageCopyPayload) => void;
  },
) {
  if (item.role === "user") {
    return h(
      "article",
      {
        class: "flex justify-end py-2 pl-10",
        "aria-label": "用户发送的内容",
      },
      [
        h(
          "div",
          {
            class:
              "max-w-[86%] rounded-[20px] border border-slate-200 bg-slate-100 px-4 py-2.5 text-slate-950 shadow-sm",
          },
          [renderMessageContent(item)],
        ),
      ],
    );
  }

  return h(
    "article",
    {
      class: "group flex flex-col gap-2 py-2 pr-2 text-slate-950",
      "aria-label": item.state === "streaming" ? "助手正在生成回复" : "助手回复的内容",
    },
    [
      h(
        "div",
        {
          class:
            item.state === "streaming" ? "max-w-none text-slate-950" : "max-w-none text-slate-950",
        },
        [renderMessageContent(item)],
      ),
      item.state === "streaming"
        ? h(
            "span",
            {
              class: "inline-flex w-fit items-center text-[12px] font-mono text-slate-400",
              role: "status",
            },
            item.text.trim() ? "..." : "等待模型响应",
          )
        : null,
      options.copyable
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
  onCopy: (payload: ChatMessageCopyPayload) => void,
) {
  return renderMessageArticle(item, {
    copyable: item.role === "assistant" && isCopyableAssistantMessage(items, item.id),
    copied: copiedMessageId === item.id,
    onCopy: (payload) =>
      onCopy({
        ...payload,
        text: collectAssistantTurnText(items, item.id) || payload.text,
      }),
  });
}

function renderToolArticle(item: RenderedToolItem, onToggle: (id: string) => void) {
  return h("article", { class: "overflow-hidden rounded-md border border-amber-200 bg-amber-50" }, [
    h(
      "button",
      {
        class: "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left",
        onClick: () => onToggle(item.id),
      },
      [
        h("div", { class: "min-w-0 flex-1" }, [
          h("div", { class: "flex flex-wrap items-center gap-2" }, [
            h("p", { class: "text-[11px] font-semibold text-amber-800" }, item.toolName),
            ...item.rendered.preview.map((preview) =>
              h(
                "span",
                {
                  class:
                    "rounded bg-white/70 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200",
                },
                preview,
              ),
            ),
          ]),
          h("p", { class: "mt-1 text-[13px] text-amber-950" }, item.summary),
        ]),
        h(
          "span",
          { class: "text-[12px] font-medium text-amber-700" },
          item.expanded ? "Hide" : "Show",
        ),
      ],
    ),
    item.expanded
      ? h(
          "div",
          {
            class: "border-t border-amber-200 px-3 py-3",
            "data-structured": String(item.rendered.structured),
          },
          [
            h("div", {
              class: "sidepanel-tool-trace text-xs leading-5 text-amber-950",
              innerHTML: item.rendered.html,
            }),
          ],
        )
      : null,
  ]);
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
  },
  emits: {
    toggleTool: (id: string) => typeof id === "string" && id.length > 0,
    copyMessage: (payload: ChatMessageCopyPayload) =>
      Boolean(payload?.id) && payload.role === "assistant" && payload.text.trim().length > 0,
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
                  : { mode: "plain", html: "" },
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
            ? renderRenderedMessageArticle(item, props.items, props.copiedMessageId, (payload) =>
                emit("copyMessage", payload),
              )
            : renderToolArticle(item, (id) => emit("toggleTool", id)),
        ),
      );
    };
  },
});
