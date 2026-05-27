import { type PropType, computed, defineComponent, h, ref } from "vue";

type FocusableRow = {
  focus?: () => void;
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
};

export interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount?: number;
  preview?: string;
  active?: boolean;
  sourceLabel?: string;
  forkedFrom?: {
    sessionId?: string;
    leafId?: string;
    sourceEntryId?: string;
    reason?: string;
  } | null;
}

export function displaySessionTitle(session: ChatSessionSummary): string {
  return session.title?.trim() || "新对话";
}

export function formatForkSource(session: ChatSessionSummary): string {
  const sourceId = String(session.forkedFrom?.sessionId || "").trim();
  if (!sourceId) {
    return "";
  }
  const tail = sourceId.length > 8 ? sourceId.slice(-8) : sourceId;
  return `来源 ${tail}`;
}

export function formatSessionDate(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function filterAndSortSessions(
  sessions: ChatSessionSummary[],
  query: string,
): ChatSessionSummary[] {
  const normalizedQuery = query.trim().toLowerCase();
  const sorted = [...sessions].sort(
    (left, right) =>
      new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime(),
  );
  if (!normalizedQuery) {
    return sorted;
  }
  return sorted.filter((session) =>
    [session.title, session.preview, session.id].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(normalizedQuery),
    ),
  );
}

export const SessionHistoryPane = defineComponent({
  name: "SessionHistoryPane",
  props: {
    sessions: {
      type: Array as PropType<ChatSessionSummary[]>,
      required: true,
    },
    activeId: {
      type: String,
      default: "",
    },
    loading: {
      type: Boolean,
      default: false,
    },
    error: {
      type: String,
      default: "",
    },
    search: {
      type: String,
      default: "",
    },
    renamingId: {
      type: String,
      default: "",
    },
    renameDraft: {
      type: String,
      default: "",
    },
    pendingDeleteId: {
      type: String,
      default: "",
    },
    canCreate: {
      type: Boolean,
      default: true,
    },
  },
  emits: {
    close: () => true,
    create: () => true,
    select: (id: string) => id.length > 0,
    delete: (id: string) => id.length > 0,
    renameStart: (_session: ChatSessionSummary) => true,
    renameSave: (id: string) => id.length > 0,
    renameCancel: () => true,
    searchChange: (_value: string) => true,
    renameDraftChange: (_value: string) => true,
  },
  setup(props, { emit }) {
    const focusedIndex = ref(-1);
    const itemRefs = ref<FocusableRow[]>([]);
    const filteredSessions = computed(() => filterAndSortSessions(props.sessions, props.search));

    function selectFocused() {
      const session = filteredSessions.value[focusedIndex.value];
      if (session) {
        emit("select", session.id);
      }
    }

    function focusCurrentRow() {
      const target = itemRefs.value[focusedIndex.value];
      if (typeof target?.focus === "function") {
        target.focus();
      }
      if (typeof target?.scrollIntoView === "function") {
        target.scrollIntoView({ block: "nearest" });
      }
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        emit("close");
        return;
      }
      if (props.renamingId) {
        return;
      }
      const total = filteredSessions.value.length;
      if (total === 0) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusedIndex.value = (focusedIndex.value + 1) % total;
        focusCurrentRow();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        focusedIndex.value = (focusedIndex.value - 1 + total) % total;
        focusCurrentRow();
        return;
      }
      if (event.key === "Enter" && focusedIndex.value >= 0) {
        event.preventDefault();
        selectFocused();
      }
    }

    function renderSearch() {
      return h("div", { class: "px-4 py-3" }, [
        h("div", { class: "relative group" }, [
          h("label", { for: "session-search-input", class: "sr-only" }, "搜索会话记录"),
          h(
            "span",
            {
              class: "pointer-events-none absolute left-3.5 top-2.5 text-[14px] text-slate-400",
              "aria-hidden": "true",
            },
            "⌕",
          ),
          h("input", {
            id: "session-search-input",
            value: props.search,
            type: "text",
            placeholder: "搜索会话记录...",
            "aria-label": "搜索会话记录",
            class:
              "w-full rounded-2xl border border-slate-200 bg-slate-100 py-2 pl-10 pr-3 text-[14px] text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-1 focus:ring-blue-100",
            onInput: (event: Event) =>
              emit("searchChange", String((event.target as HTMLInputElement | null)?.value || "")),
            onKeydown: handleKeydown,
          }),
        ]),
      ]);
    }

    function renderSessionMeta(session: ChatSessionSummary) {
      const date = formatSessionDate(session.updatedAt);
      const forkSource = formatForkSource(session);
      return h("div", { class: "mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" }, [
        date
          ? h("span", { class: "flex items-center gap-1 text-[11px] text-slate-400" }, [
              h("span", { "aria-hidden": "true" }, "◷"),
              h("span", { "aria-label": `更新于 ${date}` }, date),
            ])
          : null,
        h(
          "span",
          { class: "text-[11px] text-slate-400 tabular-nums" },
          `${session.messageCount ?? 0} messages`,
        ),
        forkSource
          ? h("span", { class: "flex items-center gap-1 text-[11px] text-slate-400" }, [
              h("span", { "aria-hidden": "true" }, "⌁"),
              h("span", { "aria-label": `分叉自 ${forkSource}` }, forkSource),
            ])
          : null,
      ]);
    }

    function renderRenameRow(session: ChatSessionSummary) {
      return h("div", { class: "flex min-w-0 flex-1 items-start gap-3.5 pr-20" }, [
        h(
          "span",
          {
            class:
              "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[13px] text-slate-500",
            "aria-hidden": "true",
          },
          "▣",
        ),
        h("span", { class: "min-w-0 flex-1" }, [
          h("input", {
            value: props.renameDraft,
            type: "text",
            class:
              "w-full min-w-0 rounded-md border border-blue-300 bg-white px-2 py-1 text-[14px] font-semibold text-slate-950 outline-none focus:ring-2 focus:ring-blue-100",
            "aria-label": "编辑会话标题",
            onInput: (event: Event) =>
              emit(
                "renameDraftChange",
                String((event.target as HTMLInputElement | null)?.value || ""),
              ),
            onClick: (event: Event) => event.stopPropagation(),
            onKeydown: (event: KeyboardEvent) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                emit("renameSave", session.id);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                emit("renameCancel");
              }
            },
          }),
          renderSessionMeta(session),
        ]),
      ]);
    }

    function renderSessionButton(session: ChatSessionSummary, index: number) {
      const active = session.id === props.activeId;
      const forkSource = formatForkSource(session);
      return h(
        "button",
        {
          ref: (element: unknown) => {
            if (element && typeof element === "object") {
              itemRefs.value[index] = element as FocusableRow;
            }
          },
          type: "button",
          class: [
            "flex w-full items-start gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            active
              ? "border-slate-300 bg-slate-50 shadow-sm"
              : "border-transparent hover:bg-slate-50",
          ],
          "aria-current": active ? "true" : "false",
          "aria-label": `选择会话: ${displaySessionTitle(session)}`,
          onClick: () => emit("select", session.id),
        },
        [
          h(
            "span",
            {
              class: [
                "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px]",
                active ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500",
              ],
              "aria-hidden": "true",
            },
            "▣",
          ),
          h("span", { class: "min-w-0 flex-1 pr-10" }, [
            h("span", { class: "flex min-w-0 items-center text-[14px] leading-snug" }, [
              h(
                "span",
                {
                  class: [
                    "truncate",
                    active ? "font-bold text-slate-950" : "font-medium text-slate-800",
                  ],
                },
                displaySessionTitle(session),
              ),
              session.sourceLabel === "wechat"
                ? h(
                    "span",
                    {
                      class:
                        "ml-2 inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700",
                    },
                    "微信",
                  )
                : null,
            ]),
            session.preview
              ? h(
                  "span",
                  { class: "mt-1 block truncate text-[12px] leading-4 text-slate-500" },
                  session.preview,
                )
              : h(
                  "span",
                  { class: "mt-1 block truncate text-[12px] leading-4 text-slate-500" },
                  "暂无消息",
                ),
            renderSessionMeta({ ...session, forkedFrom: forkSource ? session.forkedFrom : null }),
          ]),
        ],
      );
    }

    function renderSessionActions(session: ChatSessionSummary) {
      const deleting = props.pendingDeleteId === session.id;
      return h(
        "div",
        {
          class:
            "absolute right-3 top-1/2 flex -translate-y-1/2 translate-x-1 gap-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 focus-within:translate-x-0 focus-within:opacity-100",
        },
        [
          h(
            "button",
            {
              type: "button",
              class:
                "grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-[13px] text-slate-500 shadow-sm transition-colors hover:bg-white hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
              "aria-label": `重命名会话: ${displaySessionTitle(session)}`,
              onClick: (event: Event) => {
                event.stopPropagation();
                emit("renameStart", session);
              },
            },
            "✎",
          ),
          h(
            "button",
            {
              type: "button",
              class: [
                "grid h-8 w-8 place-items-center rounded-lg border text-[14px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                deleting
                  ? "border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-white hover:text-rose-600",
              ],
              "aria-label": deleting
                ? `确认删除会话: ${displaySessionTitle(session)}`
                : `删除会话: ${displaySessionTitle(session)}`,
              onClick: (event: Event) => {
                event.stopPropagation();
                emit("delete", session.id);
              },
            },
            "×",
          ),
        ],
      );
    }

    function renderRenameActions(session: ChatSessionSummary) {
      return h("div", { class: "absolute right-3 top-1/2 flex -translate-y-1/2 gap-1" }, [
        h(
          "button",
          {
            type: "button",
            class:
              "grid h-8 w-8 place-items-center rounded-lg border border-blue-200 bg-blue-50 text-[13px] font-bold text-blue-700",
            "aria-label": `保存会话标题: ${displaySessionTitle(session)}`,
            onClick: (event: Event) => {
              event.stopPropagation();
              emit("renameSave", session.id);
            },
          },
          "✓",
        ),
        h(
          "button",
          {
            type: "button",
            class:
              "grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-[13px] text-slate-500 hover:text-slate-900",
            "aria-label": "取消重命名",
            onClick: (event: Event) => {
              event.stopPropagation();
              emit("renameCancel");
            },
          },
          "×",
        ),
      ]);
    }

    function renderSessions() {
      if (props.loading && props.sessions.length === 0) {
        return h("div", { class: "px-4 py-6 text-[13px] text-slate-500" }, "正在加载会话...");
      }
      if (filteredSessions.value.length === 0) {
        return h(
          "div",
          { class: "px-4 py-6 text-[13px] text-slate-500" },
          props.search ? "没有匹配的会话。" : "暂无会话记录。",
        );
      }
      return h(
        "ul",
        { role: "list", class: "space-y-1.5", onKeydown: handleKeydown },
        filteredSessions.value.map((session, index) =>
          h("li", { key: session.id, class: "group relative" }, [
            props.renamingId === session.id
              ? renderRenameRow(session)
              : renderSessionButton(session, index),
            props.renamingId === session.id
              ? renderRenameActions(session)
              : renderSessionActions(session),
          ]),
        ),
      );
    }

    return () =>
      h(
        "section",
        {
          class: "absolute inset-0 z-50 flex flex-col bg-white",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "对话历史",
          onKeydown: handleKeydown,
        },
        [
          h("header", { class: "flex h-14 shrink-0 items-center border-b border-slate-200 px-3" }, [
            h(
              "button",
              {
                type: "button",
                class:
                  "grid h-9 w-9 place-items-center rounded-full text-[20px] text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                "aria-label": "关闭会话列表",
                onClick: () => emit("close"),
              },
              "‹",
            ),
            h("h2", { class: "ml-2 text-[16px] font-bold tracking-normal" }, "对话历史"),
            h(
              "button",
              {
                type: "button",
                class:
                  "ml-auto grid h-9 w-9 place-items-center rounded-full text-[20px] text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                "aria-label": "新建会话",
                disabled: !props.canCreate,
                onClick: () => emit("create"),
              },
              "+",
            ),
          ]),
          renderSearch(),
          props.error
            ? h(
                "div",
                {
                  class:
                    "mx-4 mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700",
                },
                props.error,
              )
            : null,
          h(
            "nav",
            {
              class: "min-h-0 flex-1 overflow-y-auto px-3 py-2 sidepanel-scrollbar",
              "aria-label": "会话列表",
            },
            [renderSessions()],
          ),
        ],
      );
  },
});
