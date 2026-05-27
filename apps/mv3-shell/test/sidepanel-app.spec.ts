import { existsSync, readFileSync } from "node:fs";
import { renderToString } from "@vue/server-renderer";
import { describe, expect, it } from "vitest";
import { type Component, createRenderer, createSSRApp } from "vue";
import {
  type ChatMessageCopyPayload,
  ChatTranscriptPane,
  collectAssistantTurnText,
  isCopyableAssistantMessage,
} from "../src/sidepanel/chat-transcript-pane";
import {
  conversationMarkdownFileName,
  generateConversationMarkdown,
  hasConversationExportContent,
} from "../src/sidepanel/conversation-export";
import {
  type ChatSessionSummary,
  SessionHistoryPane,
  filterAndSortSessions,
  formatSessionDate,
} from "../src/sidepanel/session-history-pane";
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

function mountComponentInMemory(component: Component, props: Record<string, unknown>): MemoryNode {
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
  renderer.createApp(component, props).mount(container);
  return container;
}

function mountInMemory(props: Record<string, unknown>): MemoryNode {
  return mountComponentInMemory(ChatTranscriptPane, props);
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

function findAll(node: MemoryNode, predicate: (node: MemoryNode) => boolean): MemoryNode[] {
  const matches: MemoryNode[] = [];
  if (predicate(node)) {
    matches.push(node);
  }
  for (const child of node.children) {
    matches.push(...findAll(child, predicate));
  }
  return matches;
}

function textContent(node: MemoryNode | null): string {
  if (!node) {
    return "";
  }
  return `${node.text}${node.children.map((child) => textContent(child)).join("")}`;
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

  it("inherits old-product session history shell and list row chrome", () => {
    const sessions: ChatSessionSummary[] = [
      {
        id: "s-old",
        title: "昨天的调研",
        updatedAt: "2026-05-26T08:20:00.000Z",
        messageCount: 2,
        preview: "旧记录",
      },
      {
        id: "s-active",
        title: "当前页面总结",
        updatedAt: "2026-05-27T10:30:00.000Z",
        messageCount: 5,
        preview: "页面核心内容",
        sourceLabel: "wechat",
        forkedFrom: { sessionId: "source-session-abcdef12" },
      },
    ];

    const tree = mountComponentInMemory(SessionHistoryPane, {
      sessions,
      activeId: "s-active",
      loading: false,
      error: "",
      search: "",
      renamingId: "",
      renameDraft: "",
      pendingDeleteId: "",
      canCreate: true,
    });

    const dialog = findFirst(tree, (node) => node.props.role === "dialog");
    expect(dialog?.props["aria-label"]).toBe("对话历史");
    expect(String(dialog?.props.class ?? "")).toContain("bg-white");

    const searchInput = findFirst(
      tree,
      (node) => node.type === "input" && node.props.id === "session-search-input",
    );
    expect(searchInput?.props.placeholder).toBe("搜索会话记录...");
    expect(String(searchInput?.props.class ?? "")).toContain("rounded-2xl");

    const activeRow = findFirst(
      tree,
      (node) => node.type === "button" && node.props["aria-label"] === "选择会话: 当前页面总结",
    );
    expect(activeRow?.props["aria-current"]).toBe("true");
    expect(String(activeRow?.props.class ?? "")).toContain("rounded-2xl");
    expect(String(activeRow?.props.class ?? "")).toContain("gap-3.5");

    expect(textContent(activeRow)).toContain("微信");
    expect(textContent(activeRow)).toContain("来源 abcdef12");
    expect(textContent(activeRow)).toContain("5 messages");

    const actions = findFirst(tree, (node) =>
      String(node.props.class ?? "").includes("group-hover:opacity-100"),
    );
    expect(String(actions?.props.class ?? "")).toContain("translate-x-1");

    const deleteButton = findFirst(
      tree,
      (node) => node.type === "button" && node.props["aria-label"] === "删除会话: 当前页面总结",
    );
    expect(String(deleteButton?.props.class ?? "")).toContain("border-slate-200");
  });

  it("keeps old-product session search sorting and keyboard selection behavior", () => {
    const sessions: ChatSessionSummary[] = [
      { id: "s-1", title: "Alpha", updatedAt: "2026-05-26T08:20:00.000Z" },
      { id: "s-2", title: "Beta", updatedAt: "2026-05-27T08:20:00.000Z" },
    ];
    expect(filterAndSortSessions(sessions, "").map((session) => session.id)).toEqual([
      "s-2",
      "s-1",
    ]);
    expect(filterAndSortSessions(sessions, "alp").map((session) => session.id)).toEqual(["s-1"]);
    expect(formatSessionDate("not-a-date")).toBe("");

    const selected: string[] = [];
    const tree = mountComponentInMemory(SessionHistoryPane, {
      sessions,
      activeId: "",
      loading: false,
      error: "",
      search: "",
      renamingId: "",
      renameDraft: "",
      pendingDeleteId: "",
      canCreate: true,
      onSelect: (id: string) => selected.push(id),
    });

    const dialog = findFirst(tree, (node) => node.props.role === "dialog");
    const preventDefaultCalls: string[] = [];
    const keydown = dialog?.props.onKeydown as
      | ((event: { key: string; preventDefault: () => void }) => void)
      | undefined;
    expect(keydown).toBeTypeOf("function");

    keydown?.({ key: "ArrowDown", preventDefault: () => preventDefaultCalls.push("down") });
    keydown?.({ key: "Enter", preventDefault: () => preventDefaultCalls.push("enter") });

    expect(preventDefaultCalls).toEqual(["down", "enter"]);
    expect(selected).toEqual(["s-2"]);
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

  it("inherits old-product streaming draft status instead of debug loading copy", () => {
    const waitingTree = mountInMemory({
      loading: false,
      items: [
        {
          id: "assistant-waiting",
          kind: "message",
          role: "assistant",
          text: "",
          state: "streaming",
        },
      ],
    });

    const waitingArticle = findFirst(
      waitingTree,
      (node) => node.props["data-testid"] === "assistant-streaming-message",
    );
    expect(waitingArticle?.props["aria-label"]).toBe("助手正在生成回复");

    const waitingStatus = findFirst(waitingTree, (node) => node.props.role === "status");
    expect(waitingStatus?.props["data-testid"]).toBe("assistant-streaming-spinner");
    expect(textContent(waitingStatus)).toContain("等待模型响应");

    const streamingTree = mountInMemory({
      loading: false,
      items: [
        {
          id: "assistant-streaming",
          kind: "message",
          role: "assistant",
          text: "正在整理页面内容",
          state: "streaming",
        },
      ],
    });
    const ellipsis = findFirst(streamingTree, (node) =>
      String(node.props.class ?? "").includes("streaming-ellipsis"),
    );
    expect(ellipsis?.props["aria-label"]).toBe("正在生成");
    expect(
      isCopyableAssistantMessage(
        [
          {
            id: "assistant-streaming",
            kind: "message",
            role: "assistant",
            text: "正在整理页面内容",
            state: "streaming",
          },
        ],
        "assistant-streaming",
      ),
    ).toBe(false);
    expect(findAll(streamingTree, (node) => node.props.role === "toolbar")).toHaveLength(0);
  });

  it("inherits old-product tool result card chrome and expandable runtime details", () => {
    const emitted: string[] = [];
    const tree = mountInMemory({
      loading: false,
      items: [
        {
          id: "tool-1",
          kind: "tool",
          toolName: "page.query",
          summary: "Collected DOM snapshot",
          detail: '{"status":"ok","durationMs":12,"output":{"count":2}}',
          expanded: false,
        },
      ],
      onToggleTool: (id: string) => emitted.push(id),
    });

    const toolArticle = findFirst(tree, (node) => node.props["data-testid"] === "tool-message");
    expect(toolArticle?.props["aria-label"]).toBe("工具执行结果");
    expect(String(toolArticle?.props.class ?? "")).toContain("group/tool");

    const shell = toolArticle?.children[0];
    expect(String(shell?.props.class ?? "")).toContain("rounded-xl");
    expect(String(shell?.props.class ?? "")).not.toContain("amber");

    const toggle = findFirst(
      tree,
      (node) => node.type === "button" && node.props["aria-label"] === "展开运行详情",
    );
    expect(toggle?.props["aria-expanded"]).toBe(false);
    expect(toggle?.props.onClick).toBeTypeOf("function");

    (toggle?.props.onClick as () => void)();
    expect(emitted).toEqual(["tool-1"]);

    const expandedTree = mountInMemory({
      loading: false,
      items: [
        {
          id: "tool-1",
          kind: "tool",
          toolName: "page.query",
          summary: "Collected DOM snapshot",
          detail: '{"status":"ok","durationMs":12,"output":{"count":2}}',
          expanded: true,
        },
      ],
    });
    const expandedToggle = findFirst(
      expandedTree,
      (node) => node.type === "button" && node.props["aria-label"] === "收起运行详情",
    );
    expect(expandedToggle?.props["aria-expanded"]).toBe(true);
    expect(
      findFirst(expandedTree, (node) =>
        String(node.props.class ?? "").includes("sidepanel-tool-trace"),
      ),
    ).not.toBeNull();
    expect(
      findFirst(expandedTree, (node) => node.props["data-structured"] === "true"),
    ).not.toBeNull();
  });

  it("inherits old-product message layout and copies assistant turn tails only", () => {
    const emitted: ChatMessageCopyPayload[] = [];
    const items: ChatItem[] = [
      {
        id: "user-1",
        kind: "message",
        role: "user",
        text: "请总结当前页面",
        state: "complete",
      },
      {
        id: "assistant-1",
        kind: "message",
        role: "assistant",
        text: "先读取页面。",
        state: "complete",
      },
      {
        id: "tool-1",
        kind: "tool",
        toolName: "page.query",
        summary: "读取页面快照",
        detail: "{}",
        expanded: false,
      },
      {
        id: "assistant-2",
        kind: "message",
        role: "assistant",
        text: "页面要点已经整理。",
        state: "complete",
      },
    ];

    const tree = mountInMemory({
      loading: false,
      items,
      copiedMessageId: "assistant-2",
      onCopyMessage: (payload: ChatMessageCopyPayload) => emitted.push(payload),
    });

    expect(isCopyableAssistantMessage(items, "assistant-1")).toBe(false);
    expect(isCopyableAssistantMessage(items, "assistant-2")).toBe(true);
    expect(collectAssistantTurnText(items, "assistant-2")).toBe(
      "先读取页面。\n\n页面要点已经整理。",
    );

    const userArticle = findFirst(tree, (node) => node.props["aria-label"] === "用户发送的内容");
    expect(String(userArticle?.props.class ?? "")).toContain("justify-end");
    expect(String(userArticle?.children[0]?.props.class ?? "")).toContain("rounded-[20px]");

    const assistantArticle = findFirst(
      tree,
      (node) => node.props["aria-label"] === "助手回复的内容",
    );
    expect(String(assistantArticle?.props.class ?? "")).toContain("group flex flex-col");

    const actionBars = findAll(tree, (node) => node.props.role === "toolbar");
    expect(actionBars).toHaveLength(1);
    expect(actionBars[0]?.props["aria-label"]).toBe("消息操作");

    const copyButton = findFirst(
      tree,
      (node) => node.type === "button" && node.props["aria-label"] === "已复制",
    );
    expect(copyButton?.props.onClick).toBeTypeOf("function");

    (copyButton?.props.onClick as () => void)();

    expect(emitted).toEqual([
      {
        id: "assistant-2",
        role: "assistant",
        text: "先读取页面。\n\n页面要点已经整理。",
      },
    ]);
  });

  it("wires ChatTranscriptPane into App.vue instead of inline transcript markup", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain("ChatTranscriptPane");
    expect(source).toContain(':items="chatState.items"');
    expect(source).toContain('@toggle-tool="toggleTool"');
    expect(source).toContain(':copied-message-id="copiedMessageId"');
    expect(source).toContain('@copy-message="handleCopyMessage"');
    expect(source).toContain("__BRAIN_E2E_CLIPBOARD_WRITE");
  });

  it("uses product sidepanel views instead of a debug-first split", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain('const activePane = ref<SidepanelPane>("chat")');
    expect(source).toContain("会话历史");
    expect(source).toContain("模型设置");
    expect(source).toContain("技能管理");
    expect(source).toContain("系统设置");
    expect(source).not.toContain("Control Plane");
    expect(source).not.toContain("Chat Shell");
    expect(source).not.toContain("Shared control plane + chat shell");
    expect(source).not.toContain('aria-label="Sidepanel views"');
    expect(source).not.toContain("暂无其它会话");
  });

  it("inherits the old-product chat header and menu shape", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain('role="banner"');
    expect(source).toContain('role="toolbar" aria-label="会话操作"');
    expect(source).toContain('aria-label="开始新对话"');
    expect(source).toContain('aria-label="查看会话历史列表"');
    expect(source).toContain('aria-label="打开系统设置"');
    expect(source).toContain("@click=\"selectPane('runtime')\"");
    expect(source).toContain("模型路由");
    expect(source).toContain("Skills 管理");
    expect(source).toContain('class="flex w-full items-center gap-2');
    expect(source).not.toContain("activeTabTitle");
    expect(source).not.toContain('aria-label="停止运行"');
    expect(source).not.toContain("当前标签页未连接");
  });

  it("uses real chat session routes for old-product history UX", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain('"runtime.chat.sessions"');
    expect(source).toContain('"runtime.chat.session.create"');
    expect(source).toContain('"runtime.chat.session.select"');
    expect(source).toContain('"runtime.chat.session.delete"');
    expect(source).toContain('"runtime.chat.session.update_title"');
    expect(source).toContain("chatSessions");
    expect(source).toContain("sessionSearch");
    expect(source).toContain("renamingSessionId");
    expect(source).toContain("sessionRenameDraft");
    expect(source).toContain("saveSessionRename");
  });

  it("wires old-product SessionHistoryPane into App.vue instead of inline session markup", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain("SessionHistoryPane");
    expect(source).toContain(':sessions="chatSessions"');
    expect(source).toContain(":active-id=\"chatState.sessionId ?? ''\"");
    expect(source).toContain('@select="selectChatSession"');
    expect(source).toContain('@delete="deleteChatSession"');
    expect(source).toContain('@rename-start="startSessionRename"');
    expect(source).toContain('@rename-save="saveSessionRename"');
    expect(source).not.toContain('v-for="session in filteredChatSessions"');
  });

  it("keeps old-product composer behaviors wired to real runtime input", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain("selectedTabs");
    expect(source).toContain("availableTabs");
    expect(source).toContain("showMentionList");
    expect(source).toContain("selectedSkills");
    expect(source).toContain("showSkillList");
    expect(source).toContain("skillFilter");
    expect(source).toContain("SkillCommandMode");
    expect(source).toContain("composerQueueItems");
    expect(source).toContain("extractSlashContext");
    expect(source).toContain("mode: sendMode");
    expect(source).toContain("context: {");
    expect(source).toContain("tabs: tabContext");
    expect(source).toContain("skills: skillContext");
    expect(source).toContain("skillIds: skillContext.map");
    expect(source).toContain("Enter steer · Alt+Enter follow-up");
    expect(source).toContain("运行中已排队");
    expect(source).toContain("insertComposerToken('/skill')");
    expect(source).toContain('"/skills"');
    expect(source).toContain("stopRun");
    expect(source).toContain(':disabled="loading || sending"');
  });

  it("inherits the old-product ChatInput shell instead of a debug composer strip", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");
    const styles = readFileSync("apps/mv3-shell/src/sidepanel/styles.css", "utf8");

    expect(source).toContain("composerContextExpanded");
    expect(source).toContain("snowy_input_hint_dismissed");
    expect(source).toContain(':aria-expanded="composerContextExpanded"');
    expect(source).toContain('aria-label="排队消息"');
    expect(source).toContain("Queue {{ composerQueueItems.length }} 条");
    expect(source).toContain("whitespace-pre-wrap break-words");
    expect(source).toContain("composer-shell");
    expect(source).toContain("composer-actions-cluster");
    expect(source).toContain("composer-action-btn");
    expect(source).toContain("composer-send-btn-ready");
    expect(source).toContain("composer-stop-btn");
    expect(source).toContain("shortcut-kbd");
    expect(source).toContain("关闭提示");
    expect(source).not.toContain("前台</span>");
    expect(source).not.toContain('aria-label="添加附件或引用标签页"');

    expect(styles).toContain(".composer-shell");
    expect(styles).toContain(".composer-actions-cluster");
    expect(styles).toContain(".composer-send-btn-ready");
    expect(styles).toContain(".composer-stop-btn");
    expect(styles).toContain(".shortcut-kbd");
    expect(styles).not.toContain("transition: all");
  });

  it("inherits old-product empty-state suggestion categories", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(existsSync("apps/mv3-shell/public/icon-48.png")).toBe(true);
    expect(source).toContain("interface SuggestionItem");
    expect(source).toContain("suggestionCategories");
    expect(source).toContain('<img src="/icon-48.png" alt="白雪"');
    expect(source).toContain('v-for="category in suggestionCategories"');
    expect(source).toContain('v-for="item in category.items"');
    expect(source).toContain("网页操作");
    expect(source).toContain("信息提取");
    expect(source).toContain("标签页管理");
    expect(source).toContain("更多玩法");
    expect(source).toContain("点击页面上的登录按钮");
    expect(source).toContain("提取表格数据");
    expect(source).toContain("关掉重复标签页");
    expect(source).toContain("输入 @ 可以引用标签页内容");
    expect(source).toContain("输入 / 可以搜索和使用技能");
    expect(source).toContain('@click="useSuggestion(item)"');
    expect(source).toContain(':disabled="loading || sending || !item.text"');
    expect(source).not.toContain("grid h-9 w-9 place-items-center rounded-xl bg-slate-950");
    expect(source).not.toContain("useSuggestion('帮我填这个表')");
  });

  it("surfaces pending interventions through shared management actions", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain("人工接管");
    expect(source).toContain("待处理请求");
    expect(source).toContain("恢复运行");
    expect(source).toContain("拒绝");
    expect(source).toContain('runManagementAction("intervention.resolve"');
    expect(source).toContain('runManagementAction("intervention.cancel"');
    expect(source).toContain("listPendingInterventions");
  });

  it("keeps skill management shaped like the old product while using real actions", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain("技能管理");
    expect(source).toContain("已安装技能");
    expect(source).toContain("新建技能");
    expect(source).toContain("导入已有技能");
    expect(source).toContain("查看高级信息");
    expect(source).toContain("保存并安装");
    expect(source).toContain("skillEditorOpen");
    expect(source).toContain("skillEditorMode");
    expect(source).toContain("openSkillCreateEditor");
    expect(source).toContain("openSkillImportEditor");
    expect(source).toContain("editSkillPackageDraft");
    expect(source).toContain("useSkillInComposer");
    expect(source).toContain("skills.enable");
    expect(source).toContain("skills.disable");
    expect(source).toContain("skills.uninstall");
    expect(source).toContain("skills.rollback");
    expect(source).toContain("createSkillPackageSetupPlan");
  });

  it("keeps system settings shaped like the old product while using real runtime surfaces", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain("系统设置");
    expect(source).toContain("运行策略");
    expect(source).toContain("人工接管");
    expect(source).toContain("桥接连接");
    expect(source).toContain("运行诊断");
    expect(source).toContain("捕获诊断");
    expect(source).toContain("清除错误");
    expect(source).toContain("恢复运行");
    expect(source).toContain("设为默认");
    expect(source).toContain("runtimeStatusLabel");
    expect(source).toContain("hostStatusLabel");
    expect(source).toContain('runManagementAction("runtime.capture_diagnostics"');
    expect(source).toContain('runManagementAction("runtime.clear_error"');
    expect(source).toContain("submitHostAction('hosts.connect'");
    expect(source).toContain("submitHostAction('hosts.disconnect'");
    expect(source).toContain("submitHostAction('hosts.set_default'");
    expect(source).not.toContain("微信通道");
    expect(source).not.toContain("导出备份");
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
    expect(source).toContain("showProviderApiKey");
    expect(source).toContain("'password'");
    expect(source).toContain("主对话");
    expect(source).toContain("标题与摘要");
    expect(source).toContain("失败兜底");
    expect(source).toContain("自定义服务");
    expect(source).toContain("连接并获取模型");
    expect(source).toContain("保存服务");
    expect(source).toContain("保存并生效");
    expect(source).toContain("providerEditorOpen");
    expect(source).toContain("providerAvailableModels");
    expect(source).toContain("discoverProviderModels");
    expect(source).toContain("api");
    expect(source).toContain("apiKey");
    expect(source).toContain("baseUrl");
    expect(source).toContain('runManagementAction("config.update"');
  });

  it("keeps old-product conversation export actions in the more menu", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain("复制 Markdown");
    expect(source).toContain("下载 MD 文件");
    expect(source).toContain("在标签页打开");
    expect(source).toContain("handleCopyMarkdown");
    expect(source).toContain("handleExportMarkdown('download')");
    expect(source).toContain("handleExportMarkdown('open')");
    expect(source).toContain("generateConversationMarkdown");
    expect(source).toContain("conversationMarkdownFileName");
    expect(source).toContain("hasConversationExportContent");
    expect(source).toContain("navigator.clipboard.writeText");
    expect(source).toContain("tabsApi.create");
  });

  it("does not expose unsupported message retry or fork actions until runtime routes exist", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/chat-transcript-pane.ts", "utf8");

    expect(source).toContain("copyMessage");
    expect(source).not.toContain("retryMessage");
    expect(source).not.toContain("forkMessage");
    expect(source).not.toContain("重新回答");
    expect(source).not.toContain("在新对话中分叉");
  });

  it("exports conversation markdown like the old product without tool traces", () => {
    const items: ChatItem[] = [
      {
        id: "user-1",
        kind: "message",
        role: "user",
        text: "Open the current page",
        state: "complete",
      },
      {
        id: "tool-1",
        kind: "tool",
        toolName: "tabs.query",
        summary: "Loaded tabs",
        detail: '{"tabId":1}',
        expanded: true,
      },
      {
        id: "assistant-1",
        kind: "message",
        role: "assistant",
        text: "Done.",
        state: "complete",
      },
    ];

    const markdown = generateConversationMarkdown({
      title: "Browser Task",
      sessionId: "session-1",
      items,
    });

    expect(markdown).toBe(
      "# Browser Task\n\n**User**: Open the current page\n\n**Assistant**: Done.\n",
    );
    expect(markdown).not.toContain("session-1");
    expect(markdown).not.toContain("tabs.query");
    expect(hasConversationExportContent(items)).toBe(true);
    expect(
      hasConversationExportContent([
        {
          id: "tool-only",
          kind: "tool",
          toolName: "tabs.query",
          summary: "Loaded tabs",
          detail: "{}",
          expanded: false,
        },
      ]),
    ).toBe(false);
  });

  it("uses safe markdown filenames for exported conversations", () => {
    expect(conversationMarkdownFileName(' Demo: "bad/path" ')).toBe("Demo_bad_path.md");
    expect(conversationMarkdownFileName("   ")).toBe("conversation.md");
  });
});
