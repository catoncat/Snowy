<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  applyBootstrapState,
  applyChatEvent,
  createInitialChatState,
  toggleToolExpanded,
  type ChatEvent,
  type ChatItem,
  type ChatState,
} from "./state";
import { ChatTranscriptPane } from "./chat-transcript-pane";
import {
  applyManagementResourceDocument,
  buildManagementBootstrapRequests,
  createInitialManagementState,
  createManagementActionMessage,
  createSkillPackageSetupPlan,
  listSkillCatalogItems,
  listPendingInterventions,
  type SkillCatalogItem,
  type ManagementState,
} from "./management";

const RUNNER_BACKGROUND_TARGET = "bbl-next.runner.background";

type RuntimeEnvelope = {
  ok?: boolean;
  data?: unknown;
  error?: { message?: string } | string;
};

type SidepanelPane = "chat" | "sessions" | "provider" | "skills" | "runtime";
type ChatSendMode = "normal" | "steer" | "followUp";
type SkillCommandMode = "select" | "manage";
interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount?: number;
  preview?: string;
  active?: boolean;
}
interface BrowserTabSummary {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
}
interface ComposerQueueItem {
  id: string;
  behavior: "steer" | "followUp";
  text: string;
}
type HostActionKind = "hosts.connect" | "hosts.disconnect" | "hosts.set_default";
type SkillActionKind =
  | "skills.install"
  | "skills.enable"
  | "skills.disable"
  | "skills.uninstall"
  | "skills.rollback";

const chromeApi = (
  globalThis as {
    chrome?: {
      runtime?: {
        sendMessage?: (message: unknown) => Promise<RuntimeEnvelope>;
        onMessage?: {
          addListener: (listener: (message: unknown) => void) => void;
          removeListener: (listener: (message: unknown) => void) => void;
        };
      };
      tabs?: {
        query?: (queryInfo: Record<string, unknown>) => Promise<
          Array<{
            id?: number;
            title?: string;
            url?: string;
            favIconUrl?: string;
          }>
        >;
      };
    };
  }
).chrome;
const runtimeApi = chromeApi?.runtime;
const tabsApi = chromeApi?.tabs;

const activePane = ref<SidepanelPane>("chat");
const chatState = ref<ChatState>(createInitialChatState());
const draft = ref("");
const loading = ref(true);
const sending = ref(false);
const listRef = ref<HTMLElement | null>(null);
const composerRef = ref<HTMLTextAreaElement | null>(null);
const moreMenuOpen = ref(false);
const selectedTabs = ref<BrowserTabSummary[]>([]);
const availableTabs = ref<BrowserTabSummary[]>([]);
const mentionFilter = ref("");
const showMentionList = ref(false);
const focusedMentionIndex = ref(0);
const selectedSkills = ref<SkillCatalogItem[]>([]);
const skillFilter = ref("");
const showSkillList = ref(false);
const focusedSkillIndex = ref(0);
const skillCommandMode = ref<SkillCommandMode>("select");
const skillActionPendingIds = ref<Set<string>>(new Set());
const composerQueueItems = ref<ComposerQueueItem[]>([]);
const chatSessions = ref<ChatSessionSummary[]>([]);
const sessionsLoading = ref(false);
const sessionsError = ref<string | null>(null);
const sessionSearch = ref("");
const pendingDeleteSessionId = ref("");
const renamingSessionId = ref("");
const sessionRenameDraft = ref("");
let pendingDeleteTimer: ReturnType<typeof setTimeout> | null = null;

const managementState = ref<ManagementState>(createInitialManagementState());
const managementLoading = ref(true);
const managementBusy = ref(false);
const managementError = ref<string | null>(null);
const managementNotice = ref<string | null>(null);
const diagnosticsPayload = ref<string | null>(null);
const configProviderDraft = ref("openai");
const configApiDraft = ref("responses");
const configModelDraft = ref("");
const configBaseUrlDraft = ref("");
const configApiKeyDraft = ref("");
const skillIdDraft = ref("");
const skillManifestDraft = ref(
  JSON.stringify(
    {
      version: 1,
      permissions: [],
      description: "Sidepanel authored skill",
      kind: "prompt",
      entry: "handler.js",
    },
    null,
    2,
  ),
);
const skillHandlerDraft = ref("exports.default = async ({ input }) => ({ action: input.action, args: input.args });");
const skillMarkdownDraft = ref("# Sidepanel Authored Skill\n");

const isRunning = computed(() => chatState.value.status === "running");
const isStopped = computed(() => chatState.value.status === "stopped");
const hasComposerPayload = computed(
  () => draft.value.trim().length > 0 || selectedTabs.value.length > 0 || selectedSkills.value.length > 0,
);
const canSend = computed(() => !loading.value && !sending.value && hasComposerPayload.value);
const statusTone = computed(() =>
  isRunning.value
    ? "bg-blue-50 text-blue-700 border-blue-200"
    : isStopped.value
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200",
);
const runtimeSummary = computed(() => managementState.value.runtime?.data ?? null);
const configSummary = computed(() => managementState.value.config?.data ?? null);
const skillsSummary = computed(() => managementState.value.skills?.data ?? null);
const hostsSummary = computed(() => managementState.value.hosts?.data ?? null);
const skillItems = computed(() => listSkillCatalogItems(skillsSummary.value));
const hostItems = computed(() => hostsSummary.value?.items ?? []);
const pendingInterventions = computed(() => listPendingInterventions(runtimeSummary.value));
const activeTabId = computed(() => runtimeSummary.value?.activeTab?.tabId ?? null);
const hasChatMessages = computed(() => chatState.value.items.length > 0);
const messageCount = computed(
  () => chatState.value.items.filter((item) => item.kind === "message").length,
);
const toolCount = computed(() => chatState.value.items.filter((item) => item.kind === "tool").length);
const activeSession = computed(
  () => chatSessions.value.find((session) => session.id === chatState.value.sessionId) ?? null,
);
const activeSessionTitle = computed(() =>
  activeSession.value?.title?.trim() ||
  (messageCount.value > 0 && chatState.value.sessionId
    ? `Session ${shortId(chatState.value.sessionId)}`
    : "新对话"),
);
const activeTabTitle = computed(() => runtimeSummary.value?.activeTab?.title ?? "当前标签页未连接");
const lastMessagePreview = computed(() => {
  if (activeSession.value?.preview?.trim()) {
    return activeSession.value.preview.trim();
  }
  const lastMessage = [...chatState.value.items]
    .reverse()
    .find((item) => item.kind === "message");
  return lastMessage?.kind === "message" && lastMessage.text.trim()
    ? lastMessage.text.trim()
    : "暂无消息";
});
const filteredChatSessions = computed(() => {
  const query = sessionSearch.value.trim().toLowerCase();
  const sessions = [...chatSessions.value].sort((left, right) =>
    String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")),
  );
  if (!query) {
    return sessions;
  }
  return sessions.filter((session) =>
    [session.title, session.preview, session.id].some((value) =>
      String(value ?? "").toLowerCase().includes(query),
    ),
  );
});
const filteredTabs = computed(() => {
  const query = mentionFilter.value.trim().toLowerCase();
  const selectedIds = new Set(selectedTabs.value.map((tab) => tab.id));
  return availableTabs.value
    .filter((tab) => !selectedIds.has(tab.id))
    .filter((tab) => {
      if (!query) {
        return true;
      }
      return [tab.title, tab.url].some((value) => value.toLowerCase().includes(query));
    });
});
const filteredSkills = computed(() => {
  const query = skillFilter.value.trim().toLowerCase();
  const selectedIds = new Set(selectedSkills.value.map((skill) => skill.skillId));
  const options = skillItems.value
    .filter((skill) =>
      skillCommandMode.value === "manage" ? true : skill.enabled && !selectedIds.has(skill.skillId),
    )
    .sort((left, right) => {
      if (left.enabled !== right.enabled) {
        return left.enabled ? -1 : 1;
      }
      return left.skillId.localeCompare(right.skillId);
    });
  if (!query) {
    return options;
  }
  return options.filter((skill) =>
    [skill.skillId, skill.description ?? "", skill.kind ?? "", ...skill.tags].some((value) =>
      value.toLowerCase().includes(query),
    ),
  );
});
const isSkillsManageMode = computed(() => skillCommandMode.value === "manage");
const providerModelLabel = computed(
  () => configModelDraft.value || readStringField(configSummary.value?.values.model, "model") || "未配置",
);
const providerApiLabel = computed(
  () => configApiDraft.value || readStringField(configSummary.value?.values.model, "api") || "responses",
);
const providerBaseUrlLabel = computed(
  () => configBaseUrlDraft.value || readStringField(configSummary.value?.values.model, "baseUrl") || "未配置",
);
const configValuesJson = computed(() => formatJson(configSummary.value?.values ?? {}));

function readStringField(record: unknown, field: string): string {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return "";
  }
  const value = (record as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function formatSkillActions(skill: SkillCatalogItem): string {
  return skill.actions.length > 0
    ? skill.actions.map((action) => action.title ?? action.name).join(", ")
    : "none";
}

function formatSkillVersionSurface(skill: SkillCatalogItem): string {
  const surface = skill.versionSurface;
  if (!surface) {
    return "none";
  }
  const active = surface.activeVersion?.versionId ?? "none";
  const rollback = surface.rollbackTarget?.versionId ?? "none";
  return `active ${active} · rollback ${rollback} · snapshots ${surface.policy.snapshotRootUri}`;
}

function shortId(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  if (!text) {
    return "none";
  }
  return text.length > 10 ? text.slice(-10) : text;
}

function selectPane(pane: SidepanelPane) {
  activePane.value = pane;
  moreMenuOpen.value = false;
  if (pane === "sessions") {
    void refreshChatSessions();
  }
  if (pane === "provider" || pane === "skills" || pane === "runtime") {
    void bootstrapManagement();
  }
}

function closePanelOverlay() {
  activePane.value = "chat";
  moreMenuOpen.value = false;
  cancelSessionRename();
}

function formatSessionDate(value: string | undefined): string {
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

async function focusComposer() {
  activePane.value = "chat";
  await nextTick();
  composerRef.value?.focus();
}

function useSuggestion(text: string) {
  draft.value = text;
  void focusComposer();
}

async function refreshTabs() {
  if (typeof tabsApi?.query !== "function") {
    availableTabs.value = [];
    return;
  }
  const tabs = await tabsApi.query({});
  availableTabs.value = tabs
    .filter((tab) => typeof tab.id === "number" && (tab.title || tab.url))
    .map((tab) => ({
      id: tab.id as number,
      title: String(tab.title || tab.url || `Tab ${tab.id}`),
      url: String(tab.url || ""),
      ...(typeof tab.favIconUrl === "string" ? { favIconUrl: tab.favIconUrl } : {}),
    }));
}

async function openMentionList() {
  mentionFilter.value = "";
  focusedMentionIndex.value = 0;
  showMentionList.value = true;
  await refreshTabs();
}

function insertComposerToken(token: string) {
  const needsSpace = draft.value.length > 0 && !draft.value.endsWith(" ");
  draft.value = `${draft.value}${needsSpace ? " " : ""}${token}`;
  if (token === "@") {
    void openMentionList();
  }
  void focusComposer();
}

function removeSelectedTab(tabId: number) {
  selectedTabs.value = selectedTabs.value.filter((tab) => tab.id !== tabId);
}

function clearSelectedContext() {
  selectedTabs.value = [];
  selectedSkills.value = [];
}

function selectMentionedTab(tab = filteredTabs.value[focusedMentionIndex.value]) {
  if (!tab) {
    showMentionList.value = false;
    return;
  }
  selectedTabs.value = [...selectedTabs.value, tab];
  draft.value = draft.value.replace(/@([^\s]*)$/, "").trimStart();
  mentionFilter.value = "";
  focusedMentionIndex.value = 0;
  showMentionList.value = false;
  void focusComposer();
}

interface SlashContext {
  start: number;
  end: number;
  query: string;
  mode: SkillCommandMode;
}

function extractSlashContext(value: string): SlashContext | null {
  const selectionStart = composerRef.value?.selectionStart;
  const cursor =
    typeof selectionStart === "number" && selectionStart > 0 && selectionStart <= value.length
      ? selectionStart
      : value.length;
  const head = value.slice(0, cursor);
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(head);
  if (!match) {
    return null;
  }
  const whole = match[0] ?? "";
  const leadingWhitespaceOffset = whole.startsWith(" ") ? 1 : 0;
  const rawQuery = String(match[1] ?? "");
  const lower = rawQuery.toLowerCase();
  let mode: SkillCommandMode = "select";
  let query = rawQuery;
  if (lower === "skill") {
    query = "";
  } else if (lower.startsWith("skill:")) {
    query = rawQuery.slice("skill:".length);
  } else if (lower === "skills") {
    mode = "manage";
    query = "";
  } else if (lower.startsWith("skills:")) {
    mode = "manage";
    query = rawQuery.slice("skills:".length);
  }
  return {
    start: head.length - whole.length + leadingWhitespaceOffset,
    end: cursor,
    query,
    mode,
  };
}

function replaceSlashContextAndFocus(context: SlashContext) {
  const before = draft.value.slice(0, context.start);
  const after = draft.value.slice(context.end);
  draft.value = before.endsWith(" ") && after.startsWith(" ") ? `${before}${after.slice(1)}` : `${before}${after}`;
  void nextTick(() => {
    const cursor = before.length;
    composerRef.value?.focus();
    composerRef.value?.setSelectionRange(cursor, cursor);
  });
}

function skillDescription(skill: SkillCatalogItem): string {
  if (skill.description?.trim()) {
    return skill.description.trim();
  }
  if (skill.actions.length > 0) {
    return formatSkillActions(skill);
  }
  return skill.kind ?? skill.status;
}

function isSkillActionPending(skillId: string): boolean {
  return skillActionPendingIds.value.has(skillId);
}

function setSkillActionPending(skillId: string, pending: boolean) {
  const next = new Set(skillActionPendingIds.value);
  if (pending) {
    next.add(skillId);
  } else {
    next.delete(skillId);
  }
  skillActionPendingIds.value = next;
}

function removeSelectedSkill(skillId: string) {
  selectedSkills.value = selectedSkills.value.filter((skill) => skill.skillId !== skillId);
}

function addSelectedSkill(skill: SkillCatalogItem) {
  if (selectedSkills.value.some((item) => item.skillId === skill.skillId)) {
    return;
  }
  selectedSkills.value = [...selectedSkills.value, skill];
}

async function ensureSkillCatalogLoaded() {
  if (skillsSummary.value || managementLoading.value) {
    return;
  }
  await bootstrapManagement();
}

async function setComposerSkillEnabled(skill: SkillCatalogItem, enabled: boolean): Promise<SkillCatalogItem | null> {
  if (isSkillActionPending(skill.skillId)) {
    return null;
  }
  setSkillActionPending(skill.skillId, true);
  try {
    await callRuntime(enabled ? "skills.enable" : "skills.disable", { skillId: skill.skillId });
    await bootstrapManagement();
    const updated = skillItems.value.find((item) => item.skillId === skill.skillId) ?? null;
    if (updated && !updated.enabled) {
      removeSelectedSkill(updated.skillId);
    }
    managementError.value = null;
    return updated;
  } catch (error) {
    managementError.value = error instanceof Error ? error.message : String(error);
    return null;
  } finally {
    setSkillActionPending(skill.skillId, false);
  }
}

function confirmSkillSelection(skill = filteredSkills.value[focusedSkillIndex.value]) {
  if (!skill) {
    showSkillList.value = false;
    return;
  }
  const context = extractSlashContext(draft.value);
  addSelectedSkill(skill);
  if (context) {
    replaceSlashContextAndFocus(context);
  }
  showSkillList.value = false;
  skillFilter.value = "";
  focusedSkillIndex.value = 0;
  skillCommandMode.value = "select";
}

async function useSkillFromManage(skill = filteredSkills.value[focusedSkillIndex.value]) {
  if (!skill) {
    showSkillList.value = false;
    return;
  }
  const resolved = skill.enabled ? skill : await setComposerSkillEnabled(skill, true);
  if (!resolved?.enabled) {
    return;
  }
  confirmSkillSelection(resolved);
}

async function toggleFocusedSkillEnabled(skill = filteredSkills.value[focusedSkillIndex.value]) {
  if (!skill) {
    return;
  }
  await setComposerSkillEnabled(skill, !skill.enabled);
}

function handleSkillRowClick(skill: SkillCatalogItem) {
  if (isSkillsManageMode.value) {
    void useSkillFromManage(skill);
    return;
  }
  confirmSkillSelection(skill);
}

watch(draft, (value) => {
  const slashContext = extractSlashContext(value);
  if (slashContext) {
    const modeChanged = skillCommandMode.value !== slashContext.mode;
    skillCommandMode.value = slashContext.mode;
    if (skillFilter.value !== slashContext.query) {
      focusedSkillIndex.value = 0;
    }
    skillFilter.value = slashContext.query;
    showSkillList.value = true;
    showMentionList.value = false;
    mentionFilter.value = "";
    if (modeChanged) {
      focusedSkillIndex.value = 0;
    }
    void ensureSkillCatalogLoaded();
    return;
  }
  showSkillList.value = false;
  skillFilter.value = "";
  skillCommandMode.value = "select";

  const mentionMatch = /@([^\s]*)$/.exec(value);
  if (!mentionMatch) {
    showMentionList.value = false;
    mentionFilter.value = "";
    return;
  }
  mentionFilter.value = mentionMatch[1] ?? "";
  focusedMentionIndex.value = 0;
  if (!showMentionList.value) {
    showMentionList.value = true;
    void refreshTabs();
  }
});

function syncConfigDraftsFromSummary() {
  configProviderDraft.value = readStringField(configSummary.value?.values.model, "provider") || "openai";
  configApiDraft.value = readStringField(configSummary.value?.values.model, "api") || "responses";
  configModelDraft.value = readStringField(configSummary.value?.values.model, "model");
  configBaseUrlDraft.value = readStringField(configSummary.value?.values.model, "baseUrl");
  configApiKeyDraft.value = "";
}

async function scrollToBottom() {
  await nextTick();
  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight;
  }
}

watch(
  () => chatState.value.items.length,
  () => {
    void scrollToBottom();
  },
);

async function callRuntime<T>(kind: string, payload: Record<string, unknown> = {}) {
  if (typeof runtimeApi?.sendMessage !== "function") {
    throw new Error("chrome.runtime.sendMessage is unavailable");
  }
  const response = await runtimeApi.sendMessage({
    target: RUNNER_BACKGROUND_TARGET,
    kind,
    ...payload,
  });
  if (!response?.ok) {
    const errorMessage =
      typeof response?.error === "string"
        ? response.error
        : response?.error?.message ?? `${kind} failed`;
    throw new Error(errorMessage);
  }
  return response.data as T;
}

function applyChatBootstrap(payload: {
  sessionId: string | null;
  runState: { status?: string };
  messages: ChatItem[];
}) {
  chatState.value = applyBootstrapState(chatState.value, payload);
  void refreshChatSessions();
  void scrollToBottom();
}

async function refreshChatSessions() {
  sessionsLoading.value = true;
  try {
    const payload = await callRuntime<{
      activeSessionId: string | null;
      items: ChatSessionSummary[];
    }>("runtime.chat.sessions");
    chatSessions.value = Array.isArray(payload.items) ? payload.items : [];
    sessionsError.value = null;
  } catch (error) {
    sessionsError.value = error instanceof Error ? error.message : String(error);
  } finally {
    sessionsLoading.value = false;
  }
}

async function bootstrapChat() {
  loading.value = true;
  try {
    const payload = await callRuntime<{
      sessionId: string | null;
      runState: { status?: string };
      messages: ChatItem[];
    }>("runtime.chat.bootstrap");
    applyChatBootstrap(payload);
  } catch (error) {
    chatState.value = {
      ...chatState.value,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    loading.value = false;
  }
}

async function createChatSession() {
  loading.value = true;
  try {
    const payload = await callRuntime<{
      sessionId: string | null;
      runState: { status?: string };
      messages: ChatItem[];
    }>("runtime.chat.session.create");
    applyChatBootstrap(payload);
    closePanelOverlay();
  } catch (error) {
    sessionsError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

async function selectChatSession(sessionId: string) {
  loading.value = true;
  try {
    const payload = await callRuntime<{
      sessionId: string | null;
      runState: { status?: string };
      messages: ChatItem[];
    }>("runtime.chat.session.select", { sessionId });
    applyChatBootstrap(payload);
    closePanelOverlay();
  } catch (error) {
    sessionsError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

async function deleteChatSession(sessionId: string) {
  if (pendingDeleteSessionId.value !== sessionId) {
    if (pendingDeleteTimer) {
      clearTimeout(pendingDeleteTimer);
    }
    pendingDeleteSessionId.value = sessionId;
    pendingDeleteTimer = setTimeout(() => {
      pendingDeleteSessionId.value = "";
    }, 3000);
    return;
  }
  pendingDeleteSessionId.value = "";
  loading.value = true;
  try {
    const payload = await callRuntime<{
      deletedSessionId: string;
      sessionId: string | null;
      runState: { status?: string };
      messages: ChatItem[];
    }>("runtime.chat.session.delete", { sessionId });
    applyChatBootstrap(payload);
  } catch (error) {
    sessionsError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

function startSessionRename(session: ChatSessionSummary) {
  pendingDeleteSessionId.value = "";
  renamingSessionId.value = session.id;
  sessionRenameDraft.value = session.title || "新对话";
}

function cancelSessionRename() {
  renamingSessionId.value = "";
  sessionRenameDraft.value = "";
}

async function saveSessionRename(sessionId: string) {
  const title = sessionRenameDraft.value.trim();
  if (!title) {
    sessionsError.value = "会话标题不能为空。";
    return;
  }
  try {
    const payload = await callRuntime<{ item: ChatSessionSummary }>(
      "runtime.chat.session.update_title",
      {
        sessionId,
        title,
      },
    );
    const updated = payload.item;
    chatSessions.value = chatSessions.value.map((session) =>
      session.id === updated.id ? { ...session, ...updated } : session,
    );
    sessionsError.value = null;
    cancelSessionRename();
  } catch (error) {
    sessionsError.value = error instanceof Error ? error.message : String(error);
  }
}

async function bootstrapManagement() {
  managementLoading.value = true;
  try {
    let nextState = createInitialManagementState();
    for (const request of buildManagementBootstrapRequests()) {
      const resource = await callRuntime(request.kind, {
        resourceId: request.resourceId,
        world: request.world,
      });
      nextState = applyManagementResourceDocument(nextState, resource as never);
    }
    managementState.value = nextState;
    syncConfigDraftsFromSummary();
    managementError.value = null;
  } catch (error) {
    managementError.value = error instanceof Error ? error.message : String(error);
  } finally {
    managementLoading.value = false;
  }
}

function onRuntimeMessage(message: unknown) {
  const payload = message as { type?: string; event?: ChatEvent } | null;
  if (!payload || payload.type !== "bbl-next.runtime.chat.event" || !payload.event) {
    return;
  }
  chatState.value = applyChatEvent(chatState.value, payload.event);
  if (payload.event.type === "run.state" && payload.event.status !== "running") {
    composerQueueItems.value = [];
  }
  if (
    payload.event.type === "assistant.done" ||
    payload.event.type === "run.state" ||
    payload.event.type === "run.error"
  ) {
    void refreshChatSessions();
  }
}

async function sendPrompt(mode: ChatSendMode = isRunning.value ? "steer" : "normal") {
  const text = draft.value.trim();
  if (!canSend.value) {
    return;
  }

  const optimisticId = `local-user-${crypto.randomUUID()}`;
  const sendMode = isRunning.value && mode === "normal" ? "steer" : mode;
  const selectedTabContext = [...selectedTabs.value];
  const selectedSkillContext = [...selectedSkills.value];
  const tabContext = selectedTabContext.map((tab) => ({
    id: tab.id,
    title: tab.title,
    url: tab.url,
  }));
  const skillContext = selectedSkillContext.map((skill) => ({
    id: skill.skillId,
    description: skillDescription(skill),
    enabled: skill.enabled,
  }));
  const displayText =
    text ||
    [
      skillContext.length > 0 ? `使用 skills：${skillContext.map((skill) => skill.id).join(", ")}` : "",
      tabContext.length > 0 ? `引用标签页：${tabContext.map((tab) => tab.title).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  if (sendMode === "normal") {
    chatState.value = {
      ...chatState.value,
      error: null,
      items: [
        ...chatState.value.items,
        {
          id: optimisticId,
          kind: "message",
          role: "user",
          text: displayText,
          state: "complete",
        },
      ],
    };
  }
  draft.value = "";
  selectedTabs.value = [];
  selectedSkills.value = [];
  showMentionList.value = false;
  showSkillList.value = false;
  sending.value = true;

  try {
    const payload = await callRuntime<{
      sessionId: string | null;
      runState: { status?: string };
      queued?: boolean;
      behavior?: "steer" | "followUp";
      queuedPrompt?: { id?: string; text?: string };
    }>("runtime.chat.send", {
      text,
      mode: sendMode,
      context: {
        tabs: tabContext,
        skills: skillContext,
        skillIds: skillContext.map((skill) => skill.id),
      },
    });
    if (payload.queued) {
      composerQueueItems.value = [
        ...composerQueueItems.value,
        {
          id: payload.queuedPrompt?.id || `queued-${crypto.randomUUID()}`,
          behavior: payload.behavior === "followUp" ? "followUp" : "steer",
          text: displayText,
        },
      ];
    } else {
      chatState.value = {
        ...chatState.value,
        sessionId: payload.sessionId,
        status:
          payload.runState.status === "running" || payload.runState.status === "stopped"
            ? payload.runState.status
            : "idle",
      };
    }
    void refreshChatSessions();
  } catch (error) {
    chatState.value = {
      ...chatState.value,
      items:
        sendMode === "normal"
          ? chatState.value.items.filter((item) => item.id !== optimisticId)
          : chatState.value.items,
      error: error instanceof Error ? error.message : String(error),
    };
    draft.value = text;
    selectedTabs.value = selectedTabContext;
    selectedSkills.value = selectedSkillContext;
  } finally {
    sending.value = false;
  }
}

async function stopRun() {
  try {
    const payload = await callRuntime<{ runState: { status?: string } }>("runtime.chat.stop", {
      sessionId: chatState.value.sessionId,
    });
    chatState.value = {
      ...chatState.value,
      status:
        payload.runState.status === "running" || payload.runState.status === "stopped"
          ? payload.runState.status
          : "idle",
    };
  } catch (error) {
    chatState.value = {
      ...chatState.value,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function refreshManagement(notice?: string) {
  await bootstrapManagement();
  if (notice) {
    managementNotice.value = notice;
  }
}

async function runManagementAction(kind: string, payload: Record<string, unknown> = {}) {
  managementBusy.value = true;
  managementError.value = null;
  managementNotice.value = null;
  try {
    const message = createManagementActionMessage(kind, payload) as Record<string, unknown>;
    const result = await callRuntime(kind, Object.fromEntries(
      Object.entries(message).filter(([key]) => key !== "kind"),
    ));

    if (kind === "runtime.capture_diagnostics") {
      diagnosticsPayload.value = formatJson(result);
      managementNotice.value = "Diagnostics captured.";
      return;
    }

    await refreshManagement(`${kind} complete.`);
  } catch (error) {
    managementError.value = error instanceof Error ? error.message : String(error);
  } finally {
    managementBusy.value = false;
  }
}

function captureDiagnostics() {
  void runManagementAction("runtime.capture_diagnostics", {
    world: "main",
    ...(typeof activeTabId.value === "number" ? { tabId: activeTabId.value } : {}),
  });
}

function clearRuntimeError() {
  void runManagementAction("runtime.clear_error");
}

function saveConfig() {
  const provider = configProviderDraft.value.trim();
  const api = configApiDraft.value.trim();
  const model = configModelDraft.value.trim();
  const baseUrl = configBaseUrlDraft.value.trim();
  const apiKey = configApiKeyDraft.value.trim();
  const modelPatch: Record<string, unknown> = {
    ...(provider ? { provider } : {}),
    ...(api ? { api } : {}),
    ...(model ? { model } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiKey ? { apiKey } : {}),
  };
  if (Object.keys(modelPatch).length === 0) {
    managementError.value = "Enter at least one provider setting before saving.";
    return;
  }
  void runManagementAction("config.update", {
    patch: {
      model: modelPatch,
    },
  });
}

function submitSkillAction(kind: SkillActionKind, selectedSkillId = skillIdDraft.value) {
  const skillId = selectedSkillId.trim();
  if (!skillId) {
    managementError.value = "Enter a skill id first.";
    return;
  }
  void runManagementAction(kind, { skillId });
}

function submitSkillPackageInstall() {
  const skillId = skillIdDraft.value.trim();
  if (!skillId) {
    managementError.value = "Enter a skill id first.";
    return;
  }
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(skillManifestDraft.value || "{}") as Record<string, unknown>;
  } catch (error) {
    managementError.value = error instanceof Error ? error.message : String(error);
    return;
  }
  try {
    const setupPlan = createSkillPackageSetupPlan(skillId, {
      manifest,
      handlerSource: skillHandlerDraft.value,
      skillMarkdown: skillMarkdownDraft.value,
      notes: ["sidepanel-studio"],
    });
    void runManagementAction("skills.install", {
      skillId,
      setupPlan,
      metadata: {
        source: "sidepanel.studio",
      },
    });
  } catch (error) {
    managementError.value = error instanceof Error ? error.message : String(error);
  }
}

function submitSkillRollback(skill: SkillCatalogItem) {
  const versionUri = skill.versionSurface?.rollbackTarget?.uri;
  if (!versionUri) {
    return;
  }
  void runManagementAction("skills.rollback", {
    skillId: skill.skillId,
    versionUri,
  });
}

function selectSkill(skillId: string) {
  skillIdDraft.value = skillId;
}

function submitHostAction(kind: HostActionKind, hostId: string) {
  void runManagementAction(kind, { hostId });
}

function approveIntervention(interventionId: string) {
  void runManagementAction("intervention.resolve", {
    interventionId,
    resolution: {
      resolution: "resume",
      source: "sidepanel",
    },
  });
}

function rejectIntervention(interventionId: string) {
  void runManagementAction("intervention.cancel", {
    interventionId,
    reason: "Rejected from sidepanel",
  });
}

function toggleTool(id: string) {
  chatState.value = toggleToolExpanded(chatState.value, id);
}

function onComposerKeydown(event: KeyboardEvent) {
  if (showSkillList.value) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredSkills.value.length > 0) {
        focusedSkillIndex.value = (focusedSkillIndex.value + 1) % filteredSkills.value.length;
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredSkills.value.length > 0) {
        focusedSkillIndex.value =
          (focusedSkillIndex.value - 1 + filteredSkills.value.length) % filteredSkills.value.length;
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (isSkillsManageMode.value) {
        if (event.altKey) {
          void toggleFocusedSkillEnabled();
        } else {
          void useSkillFromManage();
        }
      } else {
        confirmSkillSelection();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      showSkillList.value = false;
      skillCommandMode.value = "select";
      return;
    }
  }

  if (showMentionList.value) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredTabs.value.length > 0) {
        focusedMentionIndex.value = (focusedMentionIndex.value + 1) % filteredTabs.value.length;
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredTabs.value.length > 0) {
        focusedMentionIndex.value =
          (focusedMentionIndex.value - 1 + filteredTabs.value.length) % filteredTabs.value.length;
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      selectMentionedTab();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      showMentionList.value = false;
      return;
    }
  }

  if (event.key !== "Enter" || event.shiftKey) {
    return;
  }
  event.preventDefault();
  void sendPrompt(event.altKey ? "followUp" : isRunning.value ? "steer" : "normal");
}

onMounted(() => {
  runtimeApi?.onMessage?.addListener(onRuntimeMessage);
  void Promise.all([bootstrapChat(), bootstrapManagement()]);
});

onUnmounted(() => {
  runtimeApi?.onMessage?.removeListener(onRuntimeMessage);
  if (pendingDeleteTimer) {
    clearTimeout(pendingDeleteTimer);
  }
});
</script>

<template>
  <div class="relative flex h-screen min-h-0 flex-col overflow-hidden bg-white text-slate-950">
    <main class="relative flex min-h-0 flex-1 flex-col bg-white">
      <header class="z-30 flex h-12 shrink-0 items-center border-b border-slate-200 bg-white px-3">
        <div class="min-w-0 flex-1">
          <p class="truncate text-[15px] font-bold leading-5 tracking-normal">{{ activeSessionTitle }}</p>
          <p class="truncate text-[11px] leading-4 text-slate-500">{{ activeTabTitle }}</p>
        </div>

        <div class="flex shrink-0 items-center gap-0.5" role="toolbar" aria-label="会话操作">
          <button
            type="button"
            class="grid h-9 w-9 place-items-center rounded-full text-[20px] leading-none text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="新建对话"
            aria-label="开始新对话"
            :disabled="loading || isRunning"
            @click="createChatSession"
          >
            +
          </button>
          <button
            type="button"
            class="grid h-9 w-9 place-items-center rounded-full text-[17px] leading-none text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="会话历史"
            aria-label="查看会话历史列表"
            @click="selectPane('sessions')"
          >
            ≡
          </button>
          <button
            type="button"
            class="grid h-9 w-9 place-items-center rounded-full text-[15px] leading-none text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="停止运行"
            aria-label="停止运行"
            :disabled="!isRunning"
            @click="stopRun"
          >
            ■
          </button>
          <div class="relative">
            <button
              type="button"
              class="grid h-9 w-9 place-items-center rounded-full text-[20px] leading-none text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="更多选项"
              :aria-label="moreMenuOpen ? '关闭更多菜单' : '打开更多菜单'"
              aria-haspopup="menu"
              :aria-expanded="moreMenuOpen"
              @click="moreMenuOpen = !moreMenuOpen"
            >
              ⋯
            </button>
            <div
              v-if="moreMenuOpen"
              class="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
              role="menu"
            >
              <button type="button" role="menuitem" class="w-full px-3 py-2 text-left text-[13px] hover:bg-slate-50" @click="selectPane('provider')">
                模型设置
              </button>
              <button type="button" role="menuitem" class="w-full border-t border-slate-100 px-3 py-2 text-left text-[13px] hover:bg-slate-50" @click="selectPane('skills')">
                Skills 管理
              </button>
              <button type="button" role="menuitem" class="w-full border-t border-slate-100 px-3 py-2 text-left text-[13px] hover:bg-slate-50" @click="selectPane('runtime')">
                调试面板
              </button>
            </div>
          </div>
        </div>
      </header>

      <div
        v-if="chatState.error"
        class="absolute left-3 right-3 top-14 z-30 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[12px] font-medium text-rose-700 shadow-sm"
        role="alert"
      >
        {{ chatState.error }}
      </div>

      <div
        ref="listRef"
        class="min-h-0 flex-1 overflow-y-auto sidepanel-scrollbar"
        role="log"
        aria-live="polite"
        aria-label="对话历史记录"
      >
        <div class="w-full px-5 pb-8 pt-6">
          <section v-if="loading && !hasChatMessages" class="flex min-h-[240px] items-center justify-center text-[13px] text-slate-500">
            正在加载对话...
          </section>

          <ChatTranscriptPane
            v-else-if="hasChatMessages"
            :items="chatState.items"
            :loading="loading"
            @toggle-tool="toggleTool"
          />

          <section v-else class="flex w-full flex-col items-start py-6">
            <div class="mb-2 flex items-center gap-3">
              <span class="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-[15px] font-black text-white" aria-hidden="true">白</span>
              <h1 class="text-lg font-black tracking-normal text-slate-950">白雪</h1>
            </div>
            <p class="mb-4 text-[13px] text-slate-500">试试这些：</p>
            <div class="grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left text-[12px] text-slate-700 hover:bg-white hover:shadow-sm"
                @click="useSuggestion('帮我填这个表')"
              >
                <span class="block font-semibold text-slate-900">网页操作</span>
                <span class="mt-1 block">帮我填这个表</span>
              </button>
              <button
                type="button"
                class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left text-[12px] text-slate-700 hover:bg-white hover:shadow-sm"
                @click="useSuggestion('帮我总结这个页面的要点')"
              >
                <span class="block font-semibold text-slate-900">信息提取</span>
                <span class="mt-1 block">总结这个页面</span>
              </button>
              <button
                type="button"
                class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left text-[12px] text-slate-700 hover:bg-white hover:shadow-sm"
                @click="useSuggestion('查看所有打开的标签页')"
              >
                <span class="block font-semibold text-slate-900">标签页管理</span>
                <span class="mt-1 block">查看所有标签页</span>
              </button>
              <button
                type="button"
                class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left text-[12px] text-slate-700 hover:bg-white hover:shadow-sm"
                @click="insertComposerToken('@')"
              >
                <span class="block font-semibold text-slate-900">更多玩法</span>
                <span class="mt-1 block">@ 引用标签页</span>
              </button>
            </div>
          </section>
        </div>
      </div>

      <footer class="z-20 shrink-0 bg-white px-3 pb-4 pt-2">
        <div v-if="showSkillList" class="mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl" role="listbox" aria-label="选择 skill">
          <div class="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Skills</span>
            <span class="text-[11px] text-slate-400">{{ isSkillsManageMode ? "/skills" : "/skill" }}</span>
          </div>
          <div v-if="managementLoading" class="px-3 py-3 text-[12px] text-slate-500">正在加载 skills...</div>
          <div v-else-if="managementError" class="px-3 py-3 text-[12px] text-rose-600">{{ managementError }}</div>
          <div v-else-if="filteredSkills.length === 0" class="px-3 py-3 text-[12px] text-slate-500">
            {{ isSkillsManageMode ? "没有匹配的 skills" : "没有可用的 skills，输入 /skills 管理" }}
          </div>
          <template v-else>
            <button
              v-for="(skill, index) in filteredSkills"
              :key="skill.skillId"
              type="button"
              role="option"
              :aria-selected="focusedSkillIndex === index"
              class="flex w-full items-start gap-2.5 border-b border-slate-100 px-3 py-2 text-left last:border-0"
              :class="focusedSkillIndex === index ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'"
              @mouseenter="focusedSkillIndex = index"
              @click="handleSkillRowClick(skill)"
            >
              <span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-slate-950 text-[10px] font-black text-white" aria-hidden="true">S</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[12px] font-semibold text-slate-950">{{ skill.skillId }}</span>
                <span class="mt-0.5 block truncate text-[11px] leading-4 text-slate-500">{{ skillDescription(skill) }}</span>
              </span>
              <span
                class="mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px]"
                :class="skill.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'"
              >
                {{ isSkillActionPending(skill.skillId) ? "处理中" : skill.enabled ? "可用" : "停用" }}
              </span>
            </button>
          </template>
        </div>

        <div v-if="showMentionList" class="mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl" role="listbox" aria-label="选择标签页进行引用">
          <div class="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recent Tabs</div>
          <div v-if="filteredTabs.length === 0" class="px-3 py-3 text-[12px] text-slate-500">没有匹配的标签页</div>
          <template v-else>
            <button
              v-for="(tab, index) in filteredTabs"
              :key="tab.id"
              type="button"
              role="option"
              :aria-selected="focusedMentionIndex === index"
              class="flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2 text-left last:border-0"
              :class="focusedMentionIndex === index ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'"
              @mouseenter="focusedMentionIndex = index"
              @click="selectMentionedTab(tab)"
            >
              <img v-if="tab.favIconUrl" :src="tab.favIconUrl" class="h-4 w-4 shrink-0 rounded-sm" aria-hidden="true" />
              <span v-else class="grid h-4 w-4 shrink-0 place-items-center rounded-sm bg-slate-100 text-[9px] text-slate-500" aria-hidden="true">□</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[12px] font-medium text-slate-950">{{ tab.title }}</span>
                <span class="block truncate font-mono text-[10px] text-slate-400">{{ tab.url }}</span>
              </span>
            </button>
          </template>
        </div>

        <div class="overflow-hidden rounded-[22px] border border-slate-300 bg-white shadow-sm focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
          <div v-if="selectedTabs.length > 0 || selectedSkills.length > 0" class="border-b border-slate-100 bg-slate-50/70 px-3 py-2">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0 text-[11px] font-semibold text-slate-500">
                已选择 {{ selectedTabs.length + selectedSkills.length }} 个上下文
              </div>
              <button type="button" class="rounded-md px-2 py-1 text-[11px] text-slate-500 hover:bg-white" @click="clearSelectedContext">清除</button>
            </div>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <span
                v-for="skill in selectedSkills"
                :key="skill.skillId"
                class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700"
              >
                <span class="max-w-[210px] truncate">/{{ skill.skillId }}</span>
                <button type="button" class="text-indigo-400 hover:text-rose-500" :aria-label="`移除 ${skill.skillId}`" @click="removeSelectedSkill(skill.skillId)">×</button>
              </span>
              <span
                v-for="tab in selectedTabs"
                :key="tab.id"
                class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
              >
                <span class="max-w-[210px] truncate">{{ tab.title }}</span>
                <button type="button" class="text-slate-400 hover:text-rose-500" :aria-label="`移除 ${tab.title}`" @click="removeSelectedTab(tab.id)">×</button>
              </span>
            </div>
          </div>

          <div v-if="composerQueueItems.length > 0" class="border-b border-slate-100 bg-amber-50/70 px-3 py-2">
            <div class="text-[11px] font-semibold text-amber-800">运行中已排队</div>
            <div class="mt-1 space-y-1">
              <div v-for="item in composerQueueItems" :key="item.id" class="truncate text-[11px] text-amber-800">
                {{ item.behavior === "followUp" ? "Follow-up" : "Steer" }} · {{ item.text }}
              </div>
            </div>
          </div>

          <textarea
            ref="composerRef"
            v-model="draft"
            class="max-h-44 min-h-20 w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-6 text-slate-950 outline-none placeholder:text-slate-400"
            :placeholder="isRunning ? '运行中输入可追加：Enter 发送 steer，Alt+Enter 作为 follow-up' : '告诉白雪你想做什么...'"
            :disabled="loading || sending"
            aria-label="消息输入框"
            @keydown="onComposerKeydown"
          />
          <div class="flex items-center justify-between gap-2 border-t border-slate-200 px-2 py-2">
            <div class="flex min-w-0 flex-wrap items-center gap-1.5">
              <span class="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500">前台</span>
              <button type="button" class="rounded-md px-2 py-1 text-[12px] text-slate-600 hover:bg-slate-100" @click="insertComposerToken('@')">
                @ tab
              </button>
              <button type="button" class="rounded-md px-2 py-1 text-[12px] text-slate-600 hover:bg-slate-100" @click="insertComposerToken('/skill')">
                / skill
              </button>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <button
                v-if="isRunning"
                type="button"
                class="grid h-8 w-8 place-items-center rounded-full border border-slate-300 bg-white text-[12px] text-slate-700 hover:bg-slate-50"
                aria-label="停止生成"
                @click="stopRun"
              >
                ■
              </button>
              <button
                type="button"
                class="grid h-8 w-8 place-items-center rounded-full bg-slate-950 text-[14px] text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                :disabled="!canSend"
                :aria-label="isRunning ? '追加发送（默认 steer，Alt+Enter 为 follow-up）' : '发送消息'"
                @click="sendPrompt(isRunning ? 'steer' : 'normal')"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
        <div class="mt-1 flex items-center justify-between px-1 text-[10px] text-slate-400">
          <span>输入 @ 引用标签页 · 输入 / 使用技能</span>
          <span>{{ isRunning ? "Enter steer · Alt+Enter follow-up" : "Shift+Enter 换行" }}</span>
        </div>
      </footer>
    </main>

    <section
      v-if="activePane === 'sessions'"
      class="absolute inset-0 z-50 flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-label="对话历史"
      @keydown.esc="closePanelOverlay"
    >
      <header class="flex h-14 shrink-0 items-center border-b border-slate-200 px-3">
        <button type="button" class="grid h-9 w-9 place-items-center rounded-full text-[20px] text-slate-700 hover:bg-slate-100" aria-label="关闭会话列表" @click="closePanelOverlay">
          ‹
        </button>
        <h2 class="ml-2 text-[16px] font-bold tracking-normal">对话历史</h2>
        <button type="button" class="ml-auto grid h-9 w-9 place-items-center rounded-full text-[20px] text-slate-700 hover:bg-slate-100" aria-label="新建会话" :disabled="loading || isRunning" @click="createChatSession">
          +
        </button>
      </header>
      <div class="px-4 py-3">
        <label class="sr-only" for="session-search-input">搜索会话记录</label>
        <input
          id="session-search-input"
          v-model="sessionSearch"
          type="text"
          class="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2 text-[14px] outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white"
          placeholder="搜索会话记录..."
        />
      </div>
      <div v-if="sessionsError" class="mx-4 mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
        {{ sessionsError }}
      </div>
      <nav class="min-h-0 flex-1 overflow-y-auto px-3 py-2 sidepanel-scrollbar" aria-label="会话列表">
        <div v-if="sessionsLoading && chatSessions.length === 0" class="px-4 py-6 text-[13px] text-slate-500">
          正在加载会话...
        </div>
        <div
          v-for="session in filteredChatSessions"
          :key="session.id"
          class="group relative mb-1.5 flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors"
          :class="session.id === chatState.sessionId ? 'border-slate-300 bg-slate-50 shadow-sm' : 'border-transparent hover:bg-slate-50'"
        >
          <button
            v-if="renamingSessionId !== session.id"
            type="button"
            class="flex min-w-0 flex-1 items-start gap-3 pr-16 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            :aria-current="session.id === chatState.sessionId ? 'true' : 'false'"
            :aria-label="`选择会话: ${session.title || '新对话'}`"
            @click="selectChatSession(session.id)"
          >
            <span class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[13px] text-slate-500">□</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[14px] font-semibold text-slate-950">{{ session.title || "新对话" }}</span>
              <span class="mt-1 block truncate text-[12px] text-slate-500">{{ session.preview || "暂无消息" }}</span>
              <span class="mt-1.5 block text-[11px] text-slate-400">{{ formatSessionDate(session.updatedAt) }} · {{ session.messageCount ?? 0 }} messages</span>
            </span>
          </button>
          <div v-else class="flex min-w-0 flex-1 items-start gap-3 pr-20">
            <span class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[13px] text-slate-500">□</span>
            <span class="min-w-0 flex-1">
              <input
                v-model="sessionRenameDraft"
                type="text"
                class="w-full min-w-0 rounded-md border border-blue-300 bg-white px-2 py-1 text-[14px] font-semibold text-slate-950 outline-none focus:ring-2 focus:ring-blue-100"
                aria-label="编辑会话标题"
                @keydown.enter.stop.prevent="saveSessionRename(session.id)"
                @keydown.esc.stop.prevent="cancelSessionRename"
                @click.stop
              />
              <span class="mt-1.5 block text-[11px] text-slate-400">{{ formatSessionDate(session.updatedAt) }} · {{ session.messageCount ?? 0 }} messages</span>
            </span>
          </div>
          <div
            v-if="renamingSessionId === session.id"
            class="absolute right-3 top-1/2 flex -translate-y-1/2 gap-1"
          >
            <button
              type="button"
              class="grid h-8 w-8 place-items-center rounded-lg border border-blue-200 bg-blue-50 text-[13px] font-bold text-blue-700"
              :aria-label="`保存会话标题: ${session.title || '新对话'}`"
              @click.stop="saveSessionRename(session.id)"
            >
              ✓
            </button>
            <button
              type="button"
              class="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-[13px] text-slate-500 hover:text-slate-900"
              aria-label="取消重命名"
              @click.stop="cancelSessionRename"
            >
              ×
            </button>
          </div>
          <button
            v-if="renamingSessionId !== session.id"
            type="button"
            class="absolute right-12 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg border border-slate-200 bg-white text-[13px] text-slate-500 opacity-0 transition-opacity hover:text-blue-700 group-hover:opacity-100 focus:opacity-100"
            :aria-label="`重命名会话: ${session.title || '新对话'}`"
            @click.stop="startSessionRename(session)"
          >
            ✎
          </button>
          <button
            v-if="renamingSessionId !== session.id"
            type="button"
            class="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg border text-[14px] opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            :class="pendingDeleteSessionId === session.id ? 'border-rose-300 bg-rose-50 text-rose-600 opacity-100' : 'border-slate-200 bg-white text-slate-500 hover:text-rose-600'"
            :aria-label="pendingDeleteSessionId === session.id ? `确认删除会话: ${session.title}` : `删除会话: ${session.title}`"
            @click.stop="deleteChatSession(session.id)"
          >
            ×
          </button>
        </div>
      </nav>
    </section>

    <section
      v-if="activePane === 'provider'"
      class="absolute inset-0 z-50 flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-label="模型设置"
      @keydown.esc="closePanelOverlay"
    >
      <header class="flex h-12 shrink-0 items-center border-b border-slate-200 px-2">
        <button type="button" class="grid h-9 w-9 place-items-center rounded-sm text-[20px] text-slate-600 hover:bg-slate-100" aria-label="返回" @click="closePanelOverlay">‹</button>
        <h2 class="ml-2 text-[14px] font-bold tracking-normal">模型设置</h2>
      </header>
      <main class="min-h-0 flex-1 overflow-y-auto p-4 sidepanel-scrollbar">
        <section v-if="managementLoading" class="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">正在加载模型设置...</section>
        <section v-else class="space-y-4">
          <div v-if="managementError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{{ managementError }}</div>
          <div v-if="managementNotice" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">{{ managementNotice }}</div>

          <div class="divide-y divide-slate-200 rounded-sm border border-slate-200 bg-slate-50/40">
            <div class="grid grid-cols-[58px_1fr] gap-3 px-3 py-3">
              <p class="text-[12px] font-semibold text-slate-500">主力</p>
              <div class="min-w-0 text-[13px]">
                <p class="truncate font-medium text-slate-950">{{ providerModelLabel }}</p>
                <p class="truncate text-[12px] text-slate-500">{{ providerApiLabel }} · {{ providerBaseUrlLabel }}</p>
              </div>
            </div>
            <div class="grid grid-cols-[58px_1fr] gap-3 px-3 py-3">
              <p class="text-[12px] font-semibold text-slate-500">辅助</p>
              <p class="text-[13px] text-slate-500">跟随主力</p>
            </div>
            <div class="grid grid-cols-[58px_1fr] gap-3 px-3 py-3">
              <p class="text-[12px] font-semibold text-slate-500">兜底</p>
              <p class="text-[13px] text-slate-500">未单独配置</p>
            </div>
          </div>

          <div class="space-y-3 rounded-sm border border-slate-200 bg-slate-50/40 p-4">
            <label class="block text-[12px] font-medium text-slate-600">
              Provider
              <select v-model="configProviderDraft" class="mt-1 w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none focus:border-blue-500">
                <option value="openai">OpenAI-compatible</option>
              </select>
            </label>
            <label class="block text-[12px] font-medium text-slate-600">
              API
              <select v-model="configApiDraft" class="mt-1 w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none focus:border-blue-500">
                <option value="responses">Responses API</option>
                <option value="chat_completions">Chat Completions</option>
              </select>
            </label>
            <label class="block text-[12px] font-medium text-slate-600">
              Model
              <input v-model="configModelDraft" class="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-[13px] text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500" placeholder="gpt-4o" />
            </label>
            <label class="block text-[12px] font-medium text-slate-600">
              Base URL
              <input v-model="configBaseUrlDraft" class="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-[13px] text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500" placeholder="https://api.openai.com/v1" />
            </label>
            <label class="block text-[12px] font-medium text-slate-600">
              API Key
              <input v-model="configApiKeyDraft" type="password" autocomplete="off" spellcheck="false" class="mt-1 w-full rounded-sm border border-slate-300 px-3 py-2 text-[13px] text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500" placeholder="Leave blank to keep saved key" />
            </label>
            <button type="button" class="rounded-sm bg-slate-950 px-3 py-2 text-[13px] font-bold text-white disabled:opacity-50" :disabled="managementBusy" @click="saveConfig">
              保存模型设置
            </button>
          </div>

          <details class="rounded-sm border border-slate-200 px-3 py-3">
            <summary class="cursor-pointer text-[12px] font-medium text-slate-600">配置摘要</summary>
            <pre class="mt-3 overflow-x-auto rounded-md bg-slate-950 px-3 py-3 text-[11px] leading-5 text-slate-100"><code>{{ configValuesJson }}</code></pre>
          </details>
        </section>
      </main>
    </section>

    <section v-if="activePane === 'skills'" class="absolute inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Skills 管理" @keydown.esc="closePanelOverlay">
      <header class="flex h-12 shrink-0 items-center border-b border-slate-200 px-2">
        <button type="button" class="grid h-9 w-9 place-items-center rounded-sm text-[20px] text-slate-600 hover:bg-slate-100" aria-label="返回" @click="closePanelOverlay">‹</button>
        <h2 class="ml-2 text-[14px] font-bold tracking-normal">Skills 管理</h2>
      </header>
      <main class="min-h-0 flex-1 overflow-y-auto p-4 sidepanel-scrollbar">
        <section v-if="managementLoading" class="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">正在加载 skills...</section>
        <section v-else class="space-y-3">
          <div v-if="managementError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{{ managementError }}</div>
          <div v-if="managementNotice" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">{{ managementNotice }}</div>
          <p class="text-[12px] text-slate-500">installed {{ skillsSummary?.installedCount ?? 0 }} · enabled {{ skillsSummary?.enabledCount ?? 0 }} · trusted {{ skillsSummary?.trustedCount ?? 0 }}</p>
          <div v-if="skillItems.length === 0" class="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">No skill catalog items.</div>
          <article v-for="skill in skillItems" v-else :key="skill.skillId" class="rounded-sm border border-slate-200 px-3 py-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="break-all text-[14px] font-semibold">{{ skill.skillId }}</p>
                <p class="mt-1 text-[12px] text-slate-500">{{ skill.source }} · {{ skill.status }} · {{ skill.kind ?? 'unknown' }}</p>
              </div>
              <span class="shrink-0 rounded-full px-2 py-1 text-[11px] font-medium" :class="skill.enabled ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600'">
                {{ skill.enabled ? 'enabled' : 'inactive' }}
              </span>
            </div>
            <p v-if="skill.description" class="mt-2 text-[13px] leading-5 text-slate-700">{{ skill.description }}</p>
            <div class="mt-3 grid gap-1 text-[11px] text-slate-500">
              <p class="break-all">entry {{ skill.entry ?? 'none' }} · version {{ skill.version ?? 'none' }}</p>
              <p class="break-all">actions {{ formatSkillActions(skill) }}</p>
              <p class="break-all">matches {{ formatList(skill.matches) }}</p>
              <p class="break-all">permissions {{ formatList(skill.permissions) }}</p>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" class="rounded-sm border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50" :disabled="managementBusy" @click="selectSkill(skill.skillId)">Select</button>
              <button type="button" class="rounded-sm border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50" :disabled="managementBusy || skill.enabled || skill.status === 'archived'" @click="submitSkillAction('skills.enable', skill.skillId)">Enable</button>
              <button type="button" class="rounded-sm border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50" :disabled="managementBusy || !skill.enabled" @click="submitSkillAction('skills.disable', skill.skillId)">Disable</button>
              <button type="button" class="rounded-sm border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50" :disabled="managementBusy || skill.status === 'archived'" @click="submitSkillAction('skills.uninstall', skill.skillId)">Uninstall</button>
              <button type="button" class="rounded-sm border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50" :disabled="managementBusy || !skill.versionSurface?.rollbackTarget" @click="submitSkillRollback(skill)">Rollback</button>
            </div>
          </article>

          <details class="rounded-sm border border-slate-200 px-3 py-3">
            <summary class="cursor-pointer text-[12px] font-medium text-slate-600">包编辑器</summary>
            <div class="mt-3 space-y-3">
              <input v-model="skillIdDraft" class="w-full rounded-sm border border-slate-300 px-3 py-2 text-[13px] text-slate-950 outline-none" placeholder="skill id" />
              <textarea v-model="skillManifestDraft" class="min-h-36 w-full rounded-sm border border-slate-300 px-3 py-2 font-mono text-[12px] leading-5 text-slate-950 outline-none" aria-label="Manifest JSON" />
              <textarea v-model="skillHandlerDraft" class="min-h-28 w-full rounded-sm border border-slate-300 px-3 py-2 font-mono text-[12px] leading-5 text-slate-950 outline-none" aria-label="Handler JS" />
              <textarea v-model="skillMarkdownDraft" class="min-h-20 w-full rounded-sm border border-slate-300 px-3 py-2 font-mono text-[12px] leading-5 text-slate-950 outline-none" aria-label="SKILL.md" />
              <button type="button" class="rounded-sm bg-slate-950 px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="managementBusy" @click="submitSkillPackageInstall">Save package</button>
            </div>
          </details>
        </section>
      </main>
    </section>

    <section v-if="activePane === 'runtime'" class="absolute inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="调试面板" @keydown.esc="closePanelOverlay">
      <header class="flex h-12 shrink-0 items-center border-b border-slate-200 px-2">
        <button type="button" class="grid h-9 w-9 place-items-center rounded-sm text-[20px] text-slate-600 hover:bg-slate-100" aria-label="返回" @click="closePanelOverlay">‹</button>
        <h2 class="ml-2 text-[14px] font-bold tracking-normal">调试面板</h2>
      </header>
      <main class="min-h-0 flex-1 overflow-y-auto p-4 sidepanel-scrollbar">
        <section v-if="managementLoading" class="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">正在加载 runtime...</section>
        <section v-else class="space-y-3">
          <div v-if="managementError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{{ managementError }}</div>
          <div v-if="managementNotice" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">{{ managementNotice }}</div>
          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="text-[16px] font-semibold tracking-normal">Runtime</h3>
              <p class="text-[12px] text-slate-500">{{ runtimeSummary?.status ?? 'empty' }} · {{ runtimeSummary?.mode ?? 'active-tab-only' }}</p>
            </div>
            <div class="flex gap-2">
              <button type="button" class="rounded-sm border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50" :disabled="managementBusy" @click="captureDiagnostics">Capture diagnostics</button>
              <button type="button" class="rounded-sm border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50" :disabled="managementBusy || !runtimeSummary?.lastError" @click="clearRuntimeError">Clear error</button>
            </div>
          </div>
          <div class="divide-y divide-slate-200 rounded-sm border border-slate-200">
            <div class="px-3 py-3 text-[13px]">
              <p class="font-medium">Active tab</p>
              <p class="mt-1 break-all text-slate-600">{{ runtimeSummary?.activeTab?.title ?? 'No active tab' }}</p>
              <p class="break-all text-[12px] text-slate-500">{{ runtimeSummary?.activeTab?.url ?? 'Unavailable' }}</p>
            </div>
            <div class="px-3 py-3 text-[13px]">
              <p class="font-medium">Session</p>
              <p class="mt-1 text-slate-600">{{ runtimeSummary?.sessionId ?? 'none' }} · loop {{ runtimeSummary?.loopState ?? 'idle' }}</p>
            </div>
            <div class="px-3 py-3 text-[13px]">
              <p class="font-medium">Last error</p>
              <p class="mt-1 break-all text-slate-600">{{ runtimeSummary?.lastError?.code ?? 'none' }}<span v-if="runtimeSummary?.lastError"> · {{ runtimeSummary.lastError.message }}</span></p>
            </div>
          </div>
          <section class="rounded-sm border border-slate-200 px-3 py-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-[13px] font-semibold">Pending interventions</h3>
                <p class="text-[12px] text-slate-500">{{ pendingInterventions.length }} waiting</p>
              </div>
              <span class="rounded-full px-2 py-1 text-[11px] font-medium" :class="pendingInterventions.length > 0 ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'">
                {{ pendingInterventions.length > 0 ? 'attention' : 'idle' }}
              </span>
            </div>
            <div v-if="pendingInterventions.length === 0" class="mt-3 rounded-md border border-dashed border-slate-200 px-3 py-3 text-[13px] text-slate-500">No pending intervention requests.</div>
            <article v-for="intervention in pendingInterventions" v-else :key="intervention.id" class="mt-3 rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
              <p class="text-[13px] font-semibold text-slate-950">{{ intervention.title }}</p>
              <p class="mt-1 text-[12px] text-slate-500">{{ intervention.kind }} · {{ intervention.trigger }} · {{ intervention.requestedAt }}</p>
              <p class="mt-3 text-[13px] leading-5 text-slate-700">{{ intervention.message }}</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <button type="button" class="rounded-sm bg-slate-950 px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50" :disabled="managementBusy" @click="approveIntervention(intervention.id)">Approve</button>
                <button type="button" class="rounded-sm border border-slate-300 px-3 py-2 text-[12px] font-medium text-slate-700 disabled:opacity-50" :disabled="managementBusy" @click="rejectIntervention(intervention.id)">Reject</button>
              </div>
            </article>
          </section>
          <section class="rounded-sm border border-slate-200 px-3 py-3">
            <h3 class="text-[13px] font-semibold">Hosts</h3>
            <p class="text-[12px] text-slate-500">default {{ hostsSummary?.defaultHostId ?? 'none' }} · connected {{ hostsSummary?.connectedCount ?? 0 }}/{{ hostsSummary?.totalCount ?? 0 }}</p>
            <article v-for="host in hostItems" :key="host.hostId" class="mt-3 rounded-sm border border-slate-200 px-3 py-3">
              <p class="text-[13px] font-medium text-slate-950">{{ host.hostId }}</p>
              <p class="mt-1 text-[12px] text-slate-500">{{ host.kind }} · {{ host.state }} · {{ host.connected ? 'connected' : 'disconnected' }}</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <button type="button" class="rounded-sm border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700" :disabled="managementBusy || host.connected" @click="submitHostAction('hosts.connect', host.hostId)">Connect</button>
                <button type="button" class="rounded-sm border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700" :disabled="managementBusy || !host.connected" @click="submitHostAction('hosts.disconnect', host.hostId)">Disconnect</button>
                <button type="button" class="rounded-sm border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700" :disabled="managementBusy || host.isDefault" @click="submitHostAction('hosts.set_default', host.hostId)">Set default</button>
              </div>
            </article>
          </section>
          <section v-if="diagnosticsPayload" class="rounded-sm border border-slate-200 px-3 py-3">
            <h3 class="text-[13px] font-semibold">Last diagnostics</h3>
            <pre class="mt-3 overflow-x-auto rounded-md bg-slate-950 px-3 py-3 text-[11px] leading-5 text-slate-100"><code>{{ diagnosticsPayload }}</code></pre>
          </section>
        </section>
      </main>
    </section>
  </div>
</template>
