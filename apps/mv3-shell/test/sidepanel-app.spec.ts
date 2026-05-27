import { readFileSync } from "node:fs";
import { renderToString } from "@vue/server-renderer";
import { describe, expect, it } from "vitest";
import { createRenderer, createSSRApp } from "vue";
import { ChatTranscriptPane } from "../src/sidepanel/chat-transcript-pane";
import type { ChatItem } from "../src/sidepanel/state";

interface MemoryNode {
  type: string;
  props: Record<string, unknown>;
  children: MemoryNode[];
  text: string;
  parent: MemoryNode | null;
}

function createMemoryNode(type: string, text = ""): MemoryNode {
  return { type, props: {}, children: [], text, parent: null };
}

function insertNode(child: MemoryNode, parent: MemoryNode, anchor: MemoryNode | null) {
  child.parent = parent;
  if (!anchor) {
    parent.children.push(child);
    return;
  }
  const index = parent.children.indexOf(anchor);
  if (index < 0) {
    parent.children.push(child);
  } else {
    parent.children.splice(index, 0, child);
  }
}

function mountInMemory(props: Record<string, unknown>): MemoryNode {
  const renderer = createRenderer<MemoryNode, MemoryNode>({
    patchProp(node, key, _prev, next) {
      node.props[key] = next;
    },
    insert: insertNode,
    remove(child) {
      if (!child.parent) {
        return;
      }
      const siblings = child.parent.children;
      const index = siblings.indexOf(child);
      if (index >= 0) {
        siblings.splice(index, 1);
      }
      child.parent = null;
    },
    createElement(type) {
      return createMemoryNode(type);
    },
    createText(text) {
      return createMemoryNode("#text", text);
    },
    createComment(text) {
      return createMemoryNode("#comment", text);
    },
    setText(node, text) {
      node.text = text;
    },
    setElementText(node, text) {
      node.children = [createMemoryNode("#text", text)];
    },
    parentNode(node) {
      return node.parent;
    },
    nextSibling(node) {
      if (!node.parent) {
        return null;
      }
      const siblings = node.parent.children;
      const index = siblings.indexOf(node);
      return siblings[index + 1] ?? null;
    },
    querySelector() {
      return null;
    },
    setScopeId() {},
    cloneNode(node) {
      return createMemoryNode(node.type, node.text);
    },
    insertStaticContent(content, parent, anchor) {
      const node = createMemoryNode("#static", content);
      insertNode(node, parent, anchor ?? null);
      return [node, node];
    },
  });

  const container = createMemoryNode("root");
  renderer.createApp(ChatTranscriptPane, props).mount(container);
  return container;
}

function findFirst(node: MemoryNode, predicate: (node: MemoryNode) => boolean): MemoryNode | null {
  if (predicate(node)) {
    return node;
  }
  for (const child of node.children) {
    const found = findFirst(child, predicate);
    if (found) {
      return found;
    }
  }
  return null;
}

describe("sidepanel chat transcript component", () => {
  it("renders assistant markdown and keeps plain fallback in transcript html", async () => {
    const items: ChatItem[] = [
      {
        id: "assistant-rich",
        kind: "message",
        role: "assistant",
        text: [
          "Agent summary",
          "",
          "- first step",
          "- second step",
          "",
          "Use `ctx.call()` and read [docs](https://example.com/docs).",
        ].join("\n"),
        state: "complete",
      },
      {
        id: "assistant-plain",
        kind: "message",
        role: "assistant",
        text: "Just a plain runtime update.",
        state: "complete",
      },
    ];

    const html = await renderToString(createSSRApp(ChatTranscriptPane, { items, loading: false }));

    expect(html).toContain("<ul>");
    expect(html).toContain("<code>ctx.call()</code>");
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain("Just a plain runtime update.");
    expect((html.match(/sidepanel-rich-text/g) ?? []).length).toBe(1);
  });

  it("emits toggleTool when the tool card button is clicked", () => {
    const emitted: string[] = [];
    const tree = mountInMemory({
      loading: false,
      items: [
        {
          id: "tool-1",
          kind: "tool",
          toolName: "page.query",
          summary: "Collected DOM snapshot",
          detail: '{"status":"ok"}',
          expanded: false,
        },
      ],
      onToggleTool: (id: string) => emitted.push(id),
    });

    const button = findFirst(tree, (node) => node.type === "button");
    expect(button).not.toBeNull();
    expect(button?.props.onClick).toBeTypeOf("function");

    (button?.props.onClick as () => void)();

    expect(emitted).toEqual(["tool-1"]);
  });

  it("wires ChatTranscriptPane into App.vue instead of inline transcript markup", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain("ChatTranscriptPane");
    expect(source).toContain(':items="chatState.items"');
    expect(source).toContain('@toggle-tool="toggleTool"');
  });

  it("uses product sidepanel views instead of a debug-first split", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain('const activePane = ref<SidepanelPane>("chat")');
    expect(source).toContain("会话历史");
    expect(source).toContain("模型设置");
    expect(source).toContain("Skills 管理");
    expect(source).toContain("调试面板");
    expect(source).not.toContain("Control Plane");
    expect(source).not.toContain("Chat Shell");
    expect(source).not.toContain("Shared control plane + chat shell");
    expect(source).not.toContain('aria-label="Sidepanel views"');
    expect(source).not.toContain("暂无其它会话");
  });

  it("uses real chat session routes for old-product history UX", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain('"runtime.chat.sessions"');
    expect(source).toContain('"runtime.chat.session.create"');
    expect(source).toContain('"runtime.chat.session.select"');
    expect(source).toContain('"runtime.chat.session.delete"');
    expect(source).toContain("chatSessions");
    expect(source).toContain("sessionSearch");
  });

  it("surfaces pending interventions through shared management actions", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain("Pending interventions");
    expect(source).toContain("Approve");
    expect(source).toContain("Reject");
    expect(source).toContain('runManagementAction("intervention.resolve"');
    expect(source).toContain('runManagementAction("intervention.cancel"');
    expect(source).toContain("listPendingInterventions");
  });

  it("exposes complete provider configuration fields without echoing stored API keys", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain("configProviderDraft");
    expect(source).toContain("configApiDraft");
    expect(source).toContain("configModelDraft");
    expect(source).toContain("configBaseUrlDraft");
    expect(source).toContain("configApiKeyDraft");
    expect(source).toContain("OpenAI-compatible");
    expect(source).toContain("Responses API");
    expect(source).toContain('type="password"');
    expect(source).toContain("主力");
    expect(source).toContain("辅助");
    expect(source).toContain("兜底");
    expect(source).toContain("api");
    expect(source).toContain("apiKey");
    expect(source).toContain("baseUrl");
    expect(source).toContain("保存模型设置");
  });
});
