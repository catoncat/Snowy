import { type PropType, defineComponent, h } from "vue";
import { type SidepanelIconName, renderSidepanelIcon } from "./icons";
import { renderToolTrace } from "./renderers";
import type { RunActivityItem, RunStatusView } from "./state";

function statusToneClass(severity: RunStatusView["severity"]): string {
  if (severity === "error") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (severity === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-blue-100 bg-blue-50 text-blue-700";
}

function activityToneClass(item: RunActivityItem): string {
  if (item.severity === "error") {
    return "border-rose-200 bg-rose-50/70";
  }
  if (item.severity === "warning") {
    return "border-amber-200 bg-amber-50/70";
  }
  if (item.status === "running") {
    return "border-blue-200 bg-blue-50/70";
  }
  return "border-slate-200 bg-white/85";
}

function activityIconName(item: RunActivityItem): SidepanelIconName {
  if (item.kind === "tool") {
    return item.status === "running" ? "loader-2" : "wrench";
  }
  if (item.kind === "intervention") {
    return "activity";
  }
  if (item.kind === "compaction") {
    return "clock";
  }
  if (item.kind === "error") {
    return "bug";
  }
  return "activity";
}

function activityStatusLabel(item: RunActivityItem): string {
  switch (item.status) {
    case "running":
      return "运行中";
    case "failed":
      return "失败";
    case "blocked":
      return "受阻";
    case "intervention":
      return "需介入";
    case "queued":
      return "排队中";
    default:
      return "完成";
  }
}

export const RunStatusStrip = defineComponent({
  name: "RunStatusStrip",
  props: {
    current: {
      type: Object as PropType<RunStatusView>,
      required: true,
    },
    activityCount: {
      type: Number,
      default: 0,
    },
  },
  setup(props) {
    return () =>
      h(
        "section",
        {
          class: [
            "mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 shadow-sm",
            statusToneClass(props.current.severity),
          ].join(" "),
          role: "status",
          "aria-live": "polite",
          "data-testid": "run-status-strip",
        },
        [
          h(
            "span",
            {
              class: "grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/75",
              "aria-hidden": "true",
            },
            [
              renderSidepanelIcon(
                props.current.status === "running" ? "loader-2" : "activity",
                props.current.status === "running" ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5",
              ),
            ],
          ),
          h("div", { class: "min-w-0 flex-1" }, [
            h("div", { class: "truncate text-[12px] font-bold" }, props.current.label),
            props.current.summary
              ? h("div", { class: "mt-0.5 truncate text-[11px] opacity-80" }, props.current.summary)
              : null,
          ]),
          h(
            "span",
            {
              class:
                "shrink-0 rounded-full bg-white/75 px-2 py-0.5 text-[10px] font-semibold tabular-nums",
            },
            `${props.activityCount}`,
          ),
        ],
      );
  },
});

export const RunActivityTimeline = defineComponent({
  name: "RunActivityTimeline",
  props: {
    items: {
      type: Array as PropType<RunActivityItem[]>,
      required: true,
    },
  },
  emits: {
    toggle: (id: string) => typeof id === "string" && id.length > 0,
  },
  setup(props, { emit }) {
    return () => {
      if (props.items.length === 0) {
        return null;
      }

      return h(
        "section",
        {
          class: "mb-4 space-y-2",
          role: "region",
          "aria-label": "运行活动",
          "data-testid": "run-activity-timeline",
        },
        props.items.map((item) => {
          const trace = renderToolTrace(item.summary, item.detail);
          const hasDetail = item.detail.trim().length > 0;
          return h(
            "article",
            {
              key: item.id,
              class: [
                "rounded-lg border px-3 py-2 text-slate-950 shadow-sm",
                activityToneClass(item),
              ].join(" "),
              "data-testid": "run-activity-item",
            },
            [
              h("div", { class: "flex min-w-0 items-start gap-2" }, [
                h(
                  "span",
                  {
                    class:
                      "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/80 text-slate-600",
                    "aria-hidden": "true",
                  },
                  [
                    renderSidepanelIcon(
                      activityIconName(item),
                      item.status === "running" ? "h-3 w-3 animate-spin" : "h-3 w-3",
                    ),
                  ],
                ),
                h("div", { class: "min-w-0 flex-1" }, [
                  h("div", { class: "flex min-w-0 items-center gap-2" }, [
                    h("span", { class: "truncate text-[12px] font-bold" }, item.title),
                    h(
                      "span",
                      {
                        class:
                          "shrink-0 rounded-full bg-white/75 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600",
                      },
                      activityStatusLabel(item),
                    ),
                    item.family
                      ? h(
                          "span",
                          {
                            class:
                              "hidden shrink-0 rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline-flex",
                          },
                          item.family,
                        )
                      : null,
                  ]),
                  item.summary
                    ? h(
                        "p",
                        { class: "mt-1 line-clamp-2 text-[11px] leading-snug text-slate-600" },
                        item.summary,
                      )
                    : null,
                ]),
                hasDetail
                  ? h(
                      "button",
                      {
                        type: "button",
                        class:
                          "shrink-0 rounded-md p-1 text-slate-500 hover:bg-white/75 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                        "aria-label": item.expanded ? "收起运行活动详情" : "展开运行活动详情",
                        title: item.expanded ? "收起运行活动详情" : "展开运行活动详情",
                        "aria-expanded": item.expanded,
                        onClick: () => emit("toggle", item.id),
                      },
                      [
                        renderSidepanelIcon(
                          item.expanded ? "chevron-up" : "chevron-down",
                          "h-3 w-3",
                        ),
                      ],
                    )
                  : null,
              ]),
              item.expanded && hasDetail
                ? h("div", {
                    class:
                      "sidepanel-tool-trace mt-2 max-h-[260px] overflow-auto rounded-md border border-white/70 bg-white/75 p-2 font-mono text-[10px] leading-snug text-slate-700",
                    innerHTML: trace.html,
                    "data-testid": "run-activity-detail",
                    "data-structured": String(trace.structured),
                  })
                : null,
            ],
          );
        }),
      );
    };
  },
});
