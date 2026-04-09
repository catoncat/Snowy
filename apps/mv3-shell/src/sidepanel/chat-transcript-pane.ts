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

function renderMessageArticle(item: RenderedMessageItem) {
  return h(
    "article",
    {
      class:
        item.role === "user"
          ? "rounded-2xl px-4 py-3 shadow-sm ml-8 bg-slate-900 text-white"
          : "rounded-2xl px-4 py-3 shadow-sm mr-8 bg-white text-slate-900 ring-1 ring-slate-200",
    },
    [
      h(
        "div",
        {
          class:
            "mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide opacity-70",
        },
        [h("span", item.role), h("span", item.state)],
      ),
      item.role === "assistant" && item.rendered.mode === "rich"
        ? h("div", {
            class: "sidepanel-rich-text text-sm leading-6",
            innerHTML: item.rendered.html,
          })
        : h("p", { class: "whitespace-pre-wrap text-sm leading-6" }, item.text),
    ],
  );
}

function renderToolArticle(item: RenderedToolItem, onToggle: (id: string) => void) {
  return h(
    "article",
    { class: "mr-8 overflow-hidden rounded-2xl bg-amber-50 ring-1 ring-amber-200" },
    [
      h(
        "button",
        {
          class: "flex w-full items-center justify-between gap-3 px-4 py-3 text-left",
          onClick: () => onToggle(item.id),
        },
        [
          h("div", { class: "min-w-0 flex-1" }, [
            h("div", { class: "flex flex-wrap items-center gap-2" }, [
              h(
                "p",
                { class: "text-xs font-semibold uppercase tracking-wide text-amber-800" },
                item.toolName,
              ),
              ...item.rendered.preview.map((preview) =>
                h(
                  "span",
                  {
                    class:
                      "rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200",
                  },
                  preview,
                ),
              ),
            ]),
            h("p", { class: "mt-1 text-sm text-amber-950" }, item.summary),
          ]),
          h(
            "span",
            { class: "text-xs font-medium text-amber-700" },
            item.expanded ? "Hide" : "Show",
          ),
        ],
      ),
      item.expanded
        ? h(
            "div",
            {
              class: "border-t border-amber-200 px-4 py-3",
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
  },
  emits: {
    toggleTool: (id: string) => typeof id === "string" && id.length > 0,
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
              "rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500",
          },
          "Loading runtime chat…",
        );
      }

      if (renderedItems.value.length === 0) {
        return h(
          "div",
          {
            class:
              "rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500",
          },
          "Send a message to start the minimal runtime demo.",
        );
      }

      return renderedItems.value.map((item) =>
        item.kind === "message"
          ? renderMessageArticle(item)
          : renderToolArticle(item, (id) => emit("toggleTool", id)),
      );
    };
  },
});
