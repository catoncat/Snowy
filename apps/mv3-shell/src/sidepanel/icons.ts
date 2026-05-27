import { type PropType, defineComponent, h } from "vue";

export type SidepanelIconName =
  | "activity"
  | "arrow-left"
  | "bug"
  | "check"
  | "clock"
  | "copy"
  | "cpu"
  | "download"
  | "external-link"
  | "git-branch"
  | "history"
  | "chevron-down"
  | "chevron-up"
  | "globe"
  | "message-square"
  | "more-vertical"
  | "pencil"
  | "plus"
  | "refresh-ccw"
  | "search"
  | "settings"
  | "send"
  | "square"
  | "wand-2"
  | "trash-2"
  | "wrench"
  | "x";

type IconPathFactory = () => ReturnType<typeof h>[];

const iconPaths: Record<SidepanelIconName, IconPathFactory> = {
  activity: () => [h("path", { d: "M22 12h-4l-3 9L9 3l-3 9H2" })],
  "arrow-left": () => [h("path", { d: "m12 19-7-7 7-7" }), h("path", { d: "M19 12H5" })],
  bug: () => [
    h("path", { d: "m8 2 1.88 1.88" }),
    h("path", { d: "M14.12 3.88 16 2" }),
    h("path", { d: "M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" }),
    h("path", { d: "M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" }),
    h("path", { d: "M12 20v-9" }),
    h("path", { d: "M6.53 9C4.6 8.8 3 7.1 3 5" }),
    h("path", { d: "M6 13H2" }),
    h("path", { d: "M3 21c0-2.1 1.7-3.9 3.8-4" }),
    h("path", { d: "M17.47 9C19.4 8.8 21 7.1 21 5" }),
    h("path", { d: "M18 13h4" }),
    h("path", { d: "M21 21c0-2.1-1.7-3.9-3.8-4" }),
  ],
  check: () => [h("path", { d: "M20 6 9 17l-5-5" })],
  clock: () => [h("circle", { cx: "12", cy: "12", r: "10" }), h("path", { d: "M12 6v6l4 2" })],
  copy: () => [
    h("rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }),
    h("path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }),
  ],
  cpu: () => [
    h("rect", { width: "16", height: "16", x: "4", y: "4", rx: "2" }),
    h("rect", { width: "6", height: "6", x: "9", y: "9", rx: "1" }),
    h("path", { d: "M15 2v2" }),
    h("path", { d: "M15 20v2" }),
    h("path", { d: "M9 2v2" }),
    h("path", { d: "M9 20v2" }),
    h("path", { d: "M2 15h2" }),
    h("path", { d: "M2 9h2" }),
    h("path", { d: "M20 15h2" }),
    h("path", { d: "M20 9h2" }),
  ],
  download: () => [
    h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
    h("polyline", { points: "7 10 12 15 17 10" }),
    h("line", { x1: "12", x2: "12", y1: "15", y2: "3" }),
  ],
  "external-link": () => [
    h("path", { d: "M15 3h6v6" }),
    h("path", { d: "M10 14 21 3" }),
    h("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }),
  ],
  "git-branch": () => [
    h("line", { x1: "6", x2: "6", y1: "3", y2: "15" }),
    h("circle", { cx: "18", cy: "6", r: "3" }),
    h("circle", { cx: "6", cy: "18", r: "3" }),
    h("path", { d: "M18 9a9 9 0 0 1-9 9" }),
  ],
  history: () => [
    h("path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }),
    h("path", { d: "M3 3v5h5" }),
    h("path", { d: "M12 7v5l4 2" }),
  ],
  "chevron-down": () => [h("path", { d: "m6 9 6 6 6-6" })],
  "chevron-up": () => [h("path", { d: "m18 15-6-6-6 6" })],
  globe: () => [
    h("circle", { cx: "12", cy: "12", r: "10" }),
    h("path", { d: "M2 12h20" }),
    h("path", {
      d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
    }),
  ],
  "message-square": () => [
    h("path", {
      d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    }),
  ],
  "more-vertical": () => [
    h("circle", { cx: "12", cy: "12", r: "1" }),
    h("circle", { cx: "12", cy: "5", r: "1" }),
    h("circle", { cx: "12", cy: "19", r: "1" }),
  ],
  pencil: () => [
    h("path", {
      d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
    }),
    h("path", { d: "m15 5 4 4" }),
  ],
  plus: () => [h("path", { d: "M5 12h14" }), h("path", { d: "M12 5v14" })],
  "refresh-ccw": () => [
    h("path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }),
    h("path", { d: "M21 3v5h-5" }),
    h("path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }),
    h("path", { d: "M3 21v-5h5" }),
  ],
  search: () => [h("circle", { cx: "11", cy: "11", r: "8" }), h("path", { d: "m21 21-4.3-4.3" })],
  settings: () => [
    h("path", {
      d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
    }),
    h("circle", { cx: "12", cy: "12", r: "3" }),
  ],
  send: () => [h("path", { d: "m22 2-7 20-4-9-9-4Z" }), h("path", { d: "M22 2 11 13" })],
  square: () => [
    h("rect", {
      x: "5",
      y: "5",
      width: "14",
      height: "14",
      rx: "2",
      fill: "currentColor",
      stroke: "none",
    }),
  ],
  "wand-2": () => [
    h("path", { d: "m20 2-2 2" }),
    h("path", { d: "m7 15-5.3 5.3a1 1 0 0 0 0 1.4l.6.6a1 1 0 0 0 1.4 0L9 17" }),
    h("path", { d: "m9 17 6-6" }),
    h("path", { d: "m11 3 3 3" }),
    h("path", { d: "M3 11l6 6" }),
  ],
  "trash-2": () => [
    h("path", { d: "M3 6h18" }),
    h("path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }),
    h("path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }),
    h("line", { x1: "10", x2: "10", y1: "11", y2: "17" }),
    h("line", { x1: "14", x2: "14", y1: "11", y2: "17" }),
  ],
  wrench: () => [
    h("path", {
      d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.9 7.9l-6.2 6.2a2.1 2.1 0 0 1-3-3l6.2-6.2a6 6 0 0 1 7.9-7.9z",
    }),
  ],
  x: () => [h("path", { d: "M18 6 6 18" }), h("path", { d: "m6 6 12 12" })],
};

export function renderSidepanelIcon(name: SidepanelIconName, className = "h-4 w-4") {
  return h(
    "svg",
    {
      class: className,
      "data-icon": name,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
    iconPaths[name](),
  );
}

export const SidepanelIcon = defineComponent({
  name: "SidepanelIcon",
  props: {
    name: {
      type: String as PropType<SidepanelIconName>,
      required: true,
    },
    className: {
      type: String,
      default: "h-4 w-4",
    },
  },
  setup(props) {
    return () => renderSidepanelIcon(props.name, props.className);
  },
});
