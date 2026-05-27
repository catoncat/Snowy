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
const providerEditorOpen = ref(false);
const providerServiceNameDraft = ref("OpenAI-compatible");
const providerApiBaseDraft = ref("");
const providerApiKeyEditorDraft = ref("");
const providerEditorModelDraft = ref("");
const providerAvailableModels = ref<string[]>([]);
const providerDiscoveringModels = ref(false);
const providerEditorError = ref("");
const showProviderApiKey = ref(false);
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
const skillEditorOpen = ref(false);
const skillEditorMode = ref<"create" | "import" | "edit">("create");

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
const skillEditorTitle = computed(() =>
  skillEditorMode.value === "edit"
    ? "编辑技能包"
    : skillEditorMode.value === "import"
      ? "导入已有技能"
      : "新建技能",
);
const providerModelLabel = computed(
  () => configModelDraft.value || readStringField(configSummary.value?.values.model, "model") || "未配置",
);
const providerApiLabel = computed(
  () => configApiDraft.value || readStringField(configSummary.value?.values.model, "api") || "responses",
);
const providerBaseUrlLabel = computed(
  () => configBaseUrlDraft.value || readStringField(configSummary.value?.values.model, "baseUrl") || "未配置",
);
const providerVisibleError = computed(() => providerEditorError.value || managementError.value);
const providerEditorTitle = computed(() =>
  providerServiceCards.value.length > 0 ? "编辑自定义服务" : "添加自定义服务",
);
const providerModelOptions = computed(() =>
  dedupeTextValues([
    configModelDraft.value,
    readStringField(configSummary.value?.values.model, "model"),
    providerEditorModelDraft.value,
    ...providerAvailableModels.value,
  ]),
);
const providerServiceCards = computed(() => {
  const model = configModelDraft.value || readStringField(configSummary.value?.values.model, "model");
  const baseUrl = configBaseUrlDraft.value || readStringField(configSummary.value?.values.model, "baseUrl");
  const provider = configProviderDraft.value || readStringField(configSummary.value?.values.model, "provider") || "openai";
  const api = configApiDraft.value || readStringField(configSummary.value?.values.model, "api") || "responses";
  if (!model && !baseUrl) {
    return [];
  }
  return [
    {
      id: "current",
      name: provider === "openai" ? "OpenAI-compatible" : provider,
      api,
      apiBase: baseUrl,
      selectedModels: model ? [model] : [],
      selectedModelCount: model ? 1 : 0,
    },
  ];
});
const configValuesJson = computed(() => formatJson(configSummary.value?.values ?? {}));

function readStringField(record: unknown, field: string): string {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return "";
  }
  const value = (record as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

function trimText(value: unknown): string {
  return String(value ?? "").trim();
}

function dedupeTextValues(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = trimText(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function buildProviderModelsEndpoint(apiBase: string): string {
  const base = trimText(apiBase)
    .replace(/\/+$/u, "")
    .replace(/\/chat\/completions$/iu, "")
    .replace(/\/responses$/iu, "");
  return `${base}/models`;
}

function parseProviderModelList(payload: unknown): string[] {
  const record = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.data)
      ? record.data
      : Array.isArray(record?.models)
        ? record.models
        : [];
  return dedupeTextValues(
    candidates.map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const row = item as Record<string, unknown>;
        return row.id ?? row.name;
      }
      return item;
    }),
  );
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

function skillDisplayName(skill: SkillCatalogItem): string {
  return skill.skillId;
}

function skillStatusLabel(skill: SkillCatalogItem): string {
  if (skill.status === "archived") {
    return "已归档";
  }
  if (skill.enabled) {
    return "已启用";
  }
  if (skill.status === "disabled") {
    return "已禁用";
  }
  return "已安装";
}

function skillStatusClass(skill: SkillCatalogItem): string {
  if (skill.enabled) {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }
  if (skill.status === "archived") {
    return "border-slate-200 bg-slate-100 text-slate-500";
  }
  return "border-slate-200 bg-white text-slate-500";
}

function skillSourceLabel(skill: SkillCatalogItem): string {
  if (skill.source === "package") {
    return "自定义";
  }
  if (skill.source === "builtin") {
    return "内置";
  }
  return String(skill.source || "runtime");
}

function skillDraftManifest(skill: SkillCatalogItem | null = null): string {
  return JSON.stringify(
    {
      version: skill?.version ?? 1,
      permissions: skill?.permissions ?? [],
      description: skill?.description ?? "描述这个技能要解决什么问题",
      kind: skill?.kind ?? "prompt",
      entry: skill?.entry ?? "handler.js",
      ...(skill?.tags.length ? { tags: skill.tags } : {}),
      ...(skill?.matches.length ? { matches: skill.matches } : {}),
    },
    null,
    2,
  );
}

function resetSkillPackageDraft() {
  skillIdDraft.value = "skill.new";
  skillManifestDraft.value = skillDraftManifest();
  skillHandlerDraft.value = "exports.default = async ({ input }) => ({ action: input.action, args: input.args });";
  skillMarkdownDraft.value = "# 新技能\n\n描述这个技能如何帮助当前对话。\n";
}

function openSkillCreateEditor() {
  managementError.value = null;
  managementNotice.value = null;
  resetSkillPackageDraft();
  skillEditorMode.value = "create";
  skillEditorOpen.value = true;
}

function openSkillImportEditor() {
  managementError.value = null;
  managementNotice.value = null;
  resetSkillPackageDraft();
  skillEditorMode.value = "import";
  skillMarkdownDraft.value = "# Imported Skill\n\n粘贴已有技能的 SKILL.md 内容。\n";
  skillEditorOpen.value = true;
}

function editSkillPackageDraft(skill: SkillCatalogItem) {
  managementError.value = null;
  managementNotice.value = null;
  skillIdDraft.value = skill.skillId;
  skillManifestDraft.value = skillDraftManifest(skill);
  skillHandlerDraft.value = "exports.default = async ({ input }) => ({ action: input.action, args: input.args });";
  skillMarkdownDraft.value = `# ${skillDisplayName(skill)}\n\n${skillDescription(skill)}\n`;
  skillEditorMode.value = "edit";
  skillEditorOpen.value = true;
}

function closeSkillEditor() {
  skillEditorOpen.value = false;
  managementError.value = null;
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

function useSkillInComposer(skill: SkillCatalogItem) {
  if (!skill.enabled) {
    managementError.value = "请先启用该技能。";
    return;
  }
  addSelectedSkill(skill);
  activePane.value = "chat";
  void focusComposer();
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
  providerAvailableModels.value = dedupeTextValues([
    configModelDraft.value,
    ...providerAvailableModels.value,
  ]);
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

function openProviderEditor() {
  providerEditorError.value = "";
  providerServiceNameDraft.value =
    configProviderDraft.value === "openai" || !configProviderDraft.value
      ? "OpenAI-compatible"
      : configProviderDraft.value;
  providerApiBaseDraft.value = configBaseUrlDraft.value;
  providerApiKeyEditorDraft.value = "";
  providerEditorModelDraft.value = configModelDraft.value;
  providerAvailableModels.value = dedupeTextValues([
    configModelDraft.value,
    ...providerAvailableModels.value,
  ]);
  showProviderApiKey.value = false;
  providerEditorOpen.value = true;
}

function closeProviderEditor() {
  providerEditorOpen.value = false;
  providerEditorError.value = "";
  providerApiKeyEditorDraft.value = "";
  showProviderApiKey.value = false;
}

async function discoverProviderModels() {
  providerEditorError.value = "";
  const apiBase = trimText(providerApiBaseDraft.value);
  const apiKey = trimText(providerApiKeyEditorDraft.value || configApiKeyDraft.value);
  if (!apiBase) {
    providerEditorError.value = "请先填写 API Base。";
    return;
  }
  if (!apiKey) {
    providerEditorError.value = "请先填写 API Key。";
    return;
  }

  providerDiscoveringModels.value = true;
  try {
    const response = await fetch(buildProviderModelsEndpoint(apiBase), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(bodyText || `获取模型失败：${response.status} ${response.statusText}`.trim());
    }
    const models = parseProviderModelList(bodyText ? JSON.parse(bodyText) : {});
    if (models.length === 0) {
      throw new Error("没有从该服务返回可用模型。");
    }
    providerAvailableModels.value = models;
    if (!providerEditorModelDraft.value || !models.includes(providerEditorModelDraft.value)) {
      providerEditorModelDraft.value = models[0] ?? "";
    }
  } catch (error) {
    providerEditorError.value = error instanceof Error ? error.message : String(error);
  } finally {
    providerDiscoveringModels.value = false;
  }
}

function saveProviderServiceDraft() {
  providerEditorError.value = "";
  const serviceName = trimText(providerServiceNameDraft.value);
  const apiBase = trimText(providerApiBaseDraft.value);
  const model = trimText(providerEditorModelDraft.value);
  const apiKey = trimText(providerApiKeyEditorDraft.value);
  if (!serviceName) {
    providerEditorError.value = "请先填写服务名称。";
    return;
  }
  if (!apiBase) {
    providerEditorError.value = "请先填写 API Base。";
    return;
  }
  if (!model) {
    providerEditorError.value = "请先填写或选择模型。";
    return;
  }

  configProviderDraft.value = "openai";
  configBaseUrlDraft.value = apiBase;
  configModelDraft.value = model;
  if (apiKey) {
    configApiKeyDraft.value = apiKey;
  }
  providerAvailableModels.value = dedupeTextValues([model, ...providerAvailableModels.value]);
  closeProviderEditor();
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
    managementError.value = "请先填写 skill id。";
    return;
  }
  void runManagementAction(kind, { skillId });
}

function submitSkillPackageInstall() {
  const skillId = skillIdDraft.value.trim();
  if (!skillId) {
    managementError.value = "请先填写 skill id。";
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
    skillEditorOpen.value = false;
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

function confirmSkillUninstall(skill: SkillCatalogItem) {
  const confirmed = globalThis.confirm?.(`确认卸载技能 ${skillDisplayName(skill)} ?`) ?? true;
  if (!confirmed) {
    return;
  }
  submitSkillAction("skills.uninstall", skill.skillId);
}

function runtimeStatusLabel(status: string | null | undefined): string {
  if (status === "healthy") {
    return "运行正常";
  }
  if (status === "degraded") {
    return "需要处理";
  }
  if (status === "empty") {
    return "未就绪";
  }
  return "未知状态";
}

function runtimeStatusClass(status: string | null | undefined): string {
  if (status === "healthy") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }
  if (status === "degraded") {
    return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
  }
  return "bg-slate-100 text-slate-500 ring-1 ring-slate-200";
}

function hostStatusLabel(host: { connected?: boolean; state?: string }): string {
  if (host.connected) {
    return "已连接";
  }
  if (host.state === "error") {
    return "连接异常";
  }
  return "未连接";
}

function hostStatusClass(host: { connected?: boolean; state?: string }): string {
  if (host.connected) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }
  if (host.state === "error") {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  }
  return "bg-slate-100 text-slate-500 ring-1 ring-slate-200";
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
                技能管理
              </button>
              <button type="button" role="menuitem" class="w-full border-t border-slate-100 px-3 py-2 text-left text-[13px] hover:bg-slate-50" @click="selectPane('runtime')">
                系统设置
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
      @keydown.esc="providerEditorOpen ? closeProviderEditor() : closePanelOverlay()"
    >
      <header class="flex h-12 shrink-0 items-center border-b border-slate-200 px-2">
        <button
          type="button"
          class="grid h-9 w-9 place-items-center rounded-sm text-[20px] text-slate-600 hover:bg-slate-100"
          :aria-label="providerEditorOpen ? '返回模型设置' : '返回'"
          @click="providerEditorOpen ? closeProviderEditor() : closePanelOverlay()"
        >
          ‹
        </button>
        <h2 class="ml-2 text-[14px] font-bold tracking-normal">
          {{ providerEditorOpen ? providerEditorTitle : "模型设置" }}
        </h2>
      </header>

      <main v-if="managementLoading" class="min-h-0 flex-1 overflow-y-auto p-4 sidepanel-scrollbar">
        <section v-if="managementLoading" class="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">正在加载模型设置...</section>
      </main>

      <main v-else-if="!providerEditorOpen" class="min-h-0 flex-1 overflow-y-auto p-4 sidepanel-scrollbar">
        <section class="space-y-4">
          <div v-if="providerVisibleError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{{ providerVisibleError }}</div>
          <div v-if="managementNotice" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">{{ managementNotice }}</div>

          <section class="space-y-4 rounded-sm border border-slate-200 bg-slate-50/40 p-4">
            <label class="block space-y-1.5">
              <span class="block text-[13px] font-semibold text-slate-950">主对话</span>
              <select
                v-model="configModelDraft"
                data-provider-scene="primary"
                class="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none focus:border-blue-500"
              >
                <option value="" disabled>
                  {{ providerModelOptions.length > 0 ? "请选择模型" : "当前没有可用模型" }}
                </option>
                <option v-for="model in providerModelOptions" :key="model" :value="model">
                  {{ model }}
                </option>
              </select>
            </label>

            <label class="block space-y-1.5">
              <span class="block text-[13px] font-semibold text-slate-950">标题与摘要</span>
              <select
                class="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none focus:border-blue-500"
                disabled
              >
                <option>跟随主对话</option>
              </select>
            </label>

            <label class="block space-y-1.5">
              <span class="block text-[13px] font-semibold text-slate-950">失败兜底</span>
              <select
                class="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none focus:border-blue-500"
                disabled
              >
                <option>关闭</option>
              </select>
            </label>
          </section>

          <section class="space-y-3 rounded-sm border border-slate-200 bg-slate-50/40 p-4">
            <div class="flex items-center justify-between gap-3">
              <div class="space-y-1">
                <h3 class="text-[13px] font-semibold text-slate-950">自定义服务</h3>
                <p class="text-[12px] text-slate-500">只有这里添加的服务会出现在模型选择里。</p>
              </div>
              <button
                type="button"
                class="rounded-sm border border-slate-300 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-100"
                @click="openProviderEditor"
              >
                {{ providerServiceCards.length > 0 ? "管理模型" : "添加服务" }}
              </button>
            </div>

            <div
              v-if="providerServiceCards.length <= 0"
              class="rounded-sm border border-dashed border-slate-300 px-3 py-4 text-[12px] text-slate-500"
            >
              还没有添加自定义服务。
            </div>

            <article
              v-for="provider in providerServiceCards"
              v-else
              :key="provider.id"
              class="rounded-sm border border-slate-200 bg-white px-3 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 space-y-1">
                  <h4 class="truncate text-[13px] font-semibold text-slate-950">{{ provider.name }}</h4>
                  <p class="truncate text-[11px] text-slate-500">{{ provider.apiBase || "未配置 API Base" }}</p>
                  <p class="text-[11px] text-slate-500">{{ provider.api }} · {{ provider.selectedModelCount }} 个模型</p>
                </div>
                <button
                  type="button"
                  class="rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-100"
                  @click="openProviderEditor"
                >
                  管理模型
                </button>
              </div>
              <div v-if="provider.selectedModels.length > 0" class="mt-2 flex flex-wrap gap-2">
                <span
                  v-for="model in provider.selectedModels"
                  :key="model"
                  class="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600"
                >
                  <span class="truncate">{{ model }}</span>
                </span>
              </div>
            </article>
          </section>

          <details class="rounded-sm border border-slate-200 px-3 py-3">
            <summary class="cursor-pointer text-[12px] font-medium text-slate-600">配置摘要</summary>
            <pre class="mt-3 overflow-x-auto rounded-md bg-slate-950 px-3 py-3 text-[11px] leading-5 text-slate-100"><code>{{ configValuesJson }}</code></pre>
          </details>
        </section>
      </main>

      <main v-else class="min-h-0 flex-1 overflow-y-auto p-4 sidepanel-scrollbar">
        <section class="space-y-4 rounded-sm border border-slate-200 bg-slate-50/40 p-4">
          <div class="space-y-1">
            <h3 class="text-[15px] font-semibold tracking-normal text-slate-950">{{ providerEditorTitle }}</h3>
            <p class="text-[12px] leading-relaxed text-slate-500">连接后，你可以把想使用的模型加入可选列表。</p>
          </div>

          <label class="block space-y-1.5">
            <span class="block text-[11px] font-bold uppercase tracking-normal text-slate-500">服务名称</span>
            <input
              v-model="providerServiceNameDraft"
              data-provider-field="name"
              type="text"
              autocomplete="off"
              class="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500"
              placeholder="例如 OpenRouter"
            />
          </label>

          <label class="block space-y-1.5">
            <span class="block text-[11px] font-bold uppercase tracking-normal text-slate-500">API Base</span>
            <input
              v-model="providerApiBaseDraft"
              data-provider-field="api-base"
              type="text"
              autocomplete="off"
              class="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500"
              placeholder="https://your-api.example/v1"
            />
          </label>

          <label class="block space-y-1.5">
            <span class="block text-[11px] font-bold uppercase tracking-normal text-slate-500">API</span>
            <select
              v-model="configApiDraft"
              data-provider-field="api"
              class="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none focus:border-blue-500"
            >
              <option value="responses">Responses API</option>
              <option value="chat_completions">Chat Completions</option>
            </select>
          </label>

          <label class="block space-y-1.5">
            <span class="block text-[11px] font-bold uppercase tracking-normal text-slate-500">API Key</span>
            <span class="relative block">
              <input
                v-model="providerApiKeyEditorDraft"
                data-provider-field="api-key"
                :type="showProviderApiKey ? 'text' : 'password'"
                autocomplete="off"
                spellcheck="false"
                class="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 pr-10 text-[13px] text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500"
                placeholder="留空则继续使用已保存的 API Key"
              />
              <button
                type="button"
                class="absolute inset-y-0 right-0 px-2.5 text-[12px] font-semibold text-slate-500 hover:text-slate-900"
                :aria-label="showProviderApiKey ? '隐藏 API Key' : '显示 API Key'"
                :aria-pressed="showProviderApiKey"
                @click="showProviderApiKey = !showProviderApiKey"
              >
                {{ showProviderApiKey ? "隐藏" : "显示" }}
              </button>
            </span>
          </label>

          <label class="block space-y-1.5">
            <span class="block text-[11px] font-bold uppercase tracking-normal text-slate-500">模型</span>
            <input
              v-model="providerEditorModelDraft"
              data-provider-field="model"
              type="text"
              list="provider-model-options"
              autocomplete="off"
              class="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500"
              placeholder="gpt-4o"
            />
            <datalist id="provider-model-options">
              <option v-for="model in providerAvailableModels" :key="model" :value="model" />
            </datalist>
          </label>

          <button
            type="button"
            class="inline-flex items-center justify-center rounded-sm bg-slate-950 px-3 py-2 text-[13px] font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            :disabled="providerDiscoveringModels"
            @click="discoverProviderModels"
          >
            {{ providerDiscoveringModels ? "获取中..." : "连接并获取模型" }}
          </button>

          <div v-if="providerAvailableModels.length > 0" class="rounded-sm border border-slate-200 bg-white p-3">
            <p class="text-[12px] font-semibold text-slate-950">已发现 {{ providerAvailableModels.length }} 个模型</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                v-for="model in providerAvailableModels"
                :key="model"
                type="button"
                class="max-w-full rounded-full border px-2.5 py-1 text-[11px]"
                :class="providerEditorModelDraft === model ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'"
                @click="providerEditorModelDraft = model"
              >
                <span class="block truncate">{{ model }}</span>
              </button>
            </div>
          </div>

          <p v-if="providerVisibleError" class="text-[11px] text-rose-600">{{ providerVisibleError }}</p>
        </section>
      </main>

      <footer class="shrink-0 border-t border-slate-200 bg-slate-50/80 p-4">
        <div v-if="providerEditorOpen" class="flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-sm border border-slate-300 bg-white py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-100"
            @click="closeProviderEditor"
          >
            返回
          </button>
          <button
            type="button"
            class="flex-[1.4] rounded-sm bg-slate-950 py-2.5 text-[13px] font-bold text-white hover:bg-slate-800"
            @click="saveProviderServiceDraft"
          >
            保存服务
          </button>
        </div>
        <button
          v-else
          type="button"
          class="w-full rounded-sm bg-slate-950 py-2.5 text-[13px] font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          :disabled="managementBusy"
          @click="saveConfig"
        >
          {{ managementBusy ? "保存中..." : "保存并生效" }}
        </button>
      </footer>
    </section>

    <section v-if="activePane === 'skills'" class="absolute inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="技能管理" @keydown.esc="skillEditorOpen ? closeSkillEditor() : closePanelOverlay()">
      <header class="flex h-12 shrink-0 items-center border-b border-slate-200 px-2">
        <button type="button" class="grid h-9 w-9 place-items-center rounded-sm text-[20px] text-slate-600 hover:bg-slate-100" :aria-label="skillEditorOpen ? '返回技能管理列表' : '返回'" @click="skillEditorOpen ? closeSkillEditor() : closePanelOverlay()">‹</button>
        <div class="ml-2 min-w-0">
          <h2 class="text-[14px] font-bold tracking-normal">技能管理</h2>
          <p v-if="skillEditorOpen" class="truncate text-[10px] text-slate-500">{{ skillEditorTitle }}</p>
        </div>
        <button
          v-if="!skillEditorOpen"
          type="button"
          class="ml-auto rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          :disabled="managementLoading"
          @click="bootstrapManagement"
        >
          刷新
        </button>
      </header>
      <main class="min-h-0 flex-1 overflow-y-auto p-4 sidepanel-scrollbar">
        <section v-if="managementLoading" class="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">正在加载技能...</section>
        <section v-else class="space-y-6">
          <div v-if="managementError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{{ managementError }}</div>
          <div v-if="managementNotice" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">{{ managementNotice }}</div>

          <template v-if="!skillEditorOpen">
            <section class="space-y-3 rounded-md border border-slate-200 bg-slate-50/40 px-3 py-3">
              <div class="space-y-1">
                <h3 class="text-[11px] font-bold uppercase tracking-normal text-slate-500">技能管理</h3>
                <p class="text-[12px] leading-5 text-slate-500">先管理已有技能；需要新建或导入时，再进入编辑界面。</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button type="button" class="rounded-md bg-slate-950 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-slate-800" @click="openSkillCreateEditor">
                  新建技能
                </button>
                <button type="button" class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-100" @click="openSkillImportEditor">
                  导入已有技能
                </button>
              </div>
            </section>

            <section class="space-y-3">
              <div class="space-y-1">
                <h3 class="text-[11px] font-bold uppercase tracking-normal text-slate-500">已安装技能 · {{ skillItems.length }}</h3>
                <p class="text-[11px] text-slate-500">enabled {{ skillsSummary?.enabledCount ?? 0 }} · trusted {{ skillsSummary?.trustedCount ?? 0 }}</p>
              </div>

              <div v-if="skillItems.length === 0" class="rounded-md border border-dashed border-slate-300 bg-slate-50/40 px-4 py-4 text-[13px] text-slate-600">
                <p class="font-semibold text-slate-950">还没有已安装技能</p>
                <p class="mt-1 text-[12px] text-slate-500">你可以先创建一个新技能，或粘贴已有技能包内容安装。</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button type="button" class="rounded-md bg-slate-950 px-3 py-1.5 text-[12px] font-semibold text-white" @click="openSkillCreateEditor">创建第一个技能</button>
                  <button type="button" class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700" @click="openSkillImportEditor">导入已有技能</button>
                </div>
              </div>

              <ul v-else class="space-y-2" role="list">
                <li v-for="skill in skillItems" :key="skill.skillId" role="listitem" class="space-y-2 rounded-sm border border-slate-200 bg-slate-50/50 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="truncate text-[13px] font-semibold text-slate-950">{{ skillDisplayName(skill) }}</p>
                      <p class="mt-0.5 truncate text-[11px] text-slate-500">{{ skill.skillId }}</p>
                    </div>
                    <div class="flex shrink-0 items-center gap-1.5">
                      <span class="rounded-full border bg-white px-2 py-0.5 text-[10px] text-slate-500">{{ skillSourceLabel(skill) }}</span>
                      <span class="rounded-full border px-2 py-0.5 text-[10px] font-semibold" :class="skillStatusClass(skill)">{{ skillStatusLabel(skill) }}</span>
                    </div>
                  </div>
                  <p class="text-[12px] leading-5 text-slate-600">{{ skillDescription(skill) }}</p>
                  <details class="rounded border border-slate-200 bg-white px-2.5 py-2 text-[11px] text-slate-500">
                    <summary class="cursor-pointer select-none font-semibold">查看高级信息</summary>
                    <div class="mt-2 grid gap-1">
                      <p class="break-all">entry {{ skill.entry ?? 'none' }} · version {{ skill.version ?? 'none' }}</p>
                      <p class="break-all">actions {{ formatSkillActions(skill) }}</p>
                      <p class="break-all">matches {{ formatList(skill.matches) }}</p>
                      <p class="break-all">permissions {{ formatList(skill.permissions) }}</p>
                      <p class="break-all">versions {{ formatSkillVersionSurface(skill) }}</p>
                    </div>
                  </details>
                  <div class="flex flex-wrap items-center gap-2">
                    <button type="button" class="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-100" @click="editSkillPackageDraft(skill)">
                      编辑
                    </button>
                    <button
                      type="button"
                      class="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      :disabled="managementBusy || skill.status === 'archived'"
                      @click="submitSkillAction(skill.enabled ? 'skills.disable' : 'skills.enable', skill.skillId)"
                    >
                      {{ skill.enabled ? '禁用' : '启用' }}
                    </button>
                    <button
                      type="button"
                      class="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      :disabled="!skill.enabled"
                      @click="useSkillInComposer(skill)"
                    >
                      用于对话
                    </button>
                    <button
                      v-if="skill.versionSurface?.rollbackTarget"
                      type="button"
                      class="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      :disabled="managementBusy"
                      @click="submitSkillRollback(skill)"
                    >
                      回滚
                    </button>
                    <button
                      type="button"
                      class="ml-auto rounded-sm border border-rose-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      :disabled="managementBusy || skill.status === 'archived'"
                      @click="confirmSkillUninstall(skill)"
                    >
                      卸载
                    </button>
                  </div>
                </li>
              </ul>
            </section>
          </template>

          <section v-else class="space-y-4 rounded-md border border-slate-200 bg-slate-50/40 p-4">
            <div class="space-y-1">
              <h3 class="text-[15px] font-semibold tracking-normal text-slate-950">{{ skillEditorTitle }}</h3>
              <p class="text-[12px] leading-5 text-slate-500">当前 vNext 使用 package setup plan 安装技能；保存后会写入 mem://skills 并刷新列表。</p>
            </div>
            <label class="block space-y-1.5">
              <span class="block text-[11px] font-bold uppercase tracking-normal text-slate-500">Skill ID</span>
              <input v-model="skillIdDraft" class="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none focus:border-blue-500" placeholder="skill.example" />
            </label>
            <label class="block space-y-1.5">
              <span class="block text-[11px] font-bold uppercase tracking-normal text-slate-500">Manifest JSON</span>
              <textarea v-model="skillManifestDraft" class="min-h-36 w-full rounded-sm border border-slate-300 bg-white px-3 py-2 font-mono text-[12px] leading-5 text-slate-950 outline-none focus:border-blue-500" aria-label="Manifest JSON" />
            </label>
            <label class="block space-y-1.5">
              <span class="block text-[11px] font-bold uppercase tracking-normal text-slate-500">Handler JS</span>
              <textarea v-model="skillHandlerDraft" class="min-h-28 w-full rounded-sm border border-slate-300 bg-white px-3 py-2 font-mono text-[12px] leading-5 text-slate-950 outline-none focus:border-blue-500" aria-label="Handler JS" />
            </label>
            <label class="block space-y-1.5">
              <span class="block text-[11px] font-bold uppercase tracking-normal text-slate-500">SKILL.md</span>
              <textarea v-model="skillMarkdownDraft" class="min-h-24 w-full rounded-sm border border-slate-300 bg-white px-3 py-2 font-mono text-[12px] leading-5 text-slate-950 outline-none focus:border-blue-500" aria-label="SKILL.md" />
            </label>
          </section>
        </section>
      </main>
      <footer v-if="skillEditorOpen" class="shrink-0 border-t border-slate-200 bg-slate-50/80 p-4">
        <div class="flex gap-2">
          <button type="button" class="flex-1 rounded-sm border border-slate-300 bg-white py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-100" @click="closeSkillEditor">返回</button>
          <button type="button" class="flex-[1.4] rounded-sm bg-slate-950 py-2.5 text-[13px] font-bold text-white hover:bg-slate-800 disabled:opacity-50" :disabled="managementBusy" @click="submitSkillPackageInstall">
            {{ managementBusy ? "保存中..." : "保存并安装" }}
          </button>
        </div>
      </footer>
    </section>

    <section v-if="activePane === 'runtime'" class="absolute inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="系统设置" @keydown.esc="closePanelOverlay">
      <header class="flex h-12 shrink-0 items-center border-b border-slate-200 px-2">
        <button type="button" class="grid h-9 w-9 place-items-center rounded-sm text-[20px] text-slate-600 hover:bg-slate-100" aria-label="返回" @click="closePanelOverlay">‹</button>
        <h2 class="ml-2 text-[14px] font-bold tracking-normal">系统设置</h2>
      </header>
      <main class="min-h-0 flex-1 overflow-y-auto p-4 sidepanel-scrollbar">
        <section v-if="managementLoading" class="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">正在加载系统设置...</section>
        <section v-else class="space-y-8">
          <div v-if="managementError" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{{ managementError }}</div>
          <div v-if="managementNotice" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">{{ managementNotice }}</div>

          <section class="space-y-4">
            <div class="flex items-center gap-2 text-slate-500 opacity-70">
              <span class="text-[13px]" aria-hidden="true">●</span>
              <h3 class="text-[10px] font-bold uppercase tracking-normal">运行策略</h3>
            </div>
            <div class="space-y-3 rounded-sm border border-slate-200 bg-slate-50/50 px-3 py-3">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0 space-y-0.5">
                  <p class="text-[13px] font-semibold text-slate-950">运行状态</p>
                  <p class="truncate text-[11px] text-slate-500">{{ runtimeSummary?.mode ?? 'active-tab-only' }}</p>
                </div>
                <span class="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold" :class="runtimeStatusClass(runtimeSummary?.status)">
                  {{ runtimeStatusLabel(runtimeSummary?.status) }}
                </span>
              </div>
              <div class="divide-y divide-slate-200 rounded-sm border border-slate-200 bg-white">
                <div class="px-3 py-3 text-[13px]">
                  <p class="font-semibold text-slate-950">当前标签页</p>
                  <p class="mt-1 break-all text-slate-600">{{ runtimeSummary?.activeTab?.title ?? '未连接当前标签页' }}</p>
                  <p class="break-all text-[12px] text-slate-500">{{ runtimeSummary?.activeTab?.url ?? '不可用' }}</p>
                </div>
                <div class="px-3 py-3 text-[13px]">
                  <p class="font-semibold text-slate-950">当前会话</p>
                  <p class="mt-1 text-slate-600">{{ runtimeSummary?.sessionId ?? 'none' }} · loop {{ runtimeSummary?.loopState ?? 'idle' }}</p>
                </div>
                <div class="px-3 py-3 text-[13px]">
                  <p class="font-semibold text-slate-950">最近错误</p>
                  <p class="mt-1 break-all text-slate-600">{{ runtimeSummary?.lastError?.code ?? 'none' }}<span v-if="runtimeSummary?.lastError"> · {{ runtimeSummary.lastError.message }}</span></p>
                </div>
              </div>
            </div>
          </section>

          <section class="space-y-4">
            <div class="flex items-center gap-2 text-slate-500 opacity-70">
              <span class="text-[13px]" aria-hidden="true">●</span>
              <h3 class="text-[10px] font-bold uppercase tracking-normal">人工接管</h3>
            </div>
            <div class="rounded-sm border border-slate-200 bg-slate-50/50 px-3 py-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-[13px] font-semibold text-slate-950">待处理请求</p>
                  <p class="text-[12px] text-slate-500">{{ pendingInterventions.length }} 个等待处理</p>
                </div>
                <span class="rounded-full px-2 py-1 text-[11px] font-semibold" :class="pendingInterventions.length > 0 ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'">
                  {{ pendingInterventions.length > 0 ? '需要处理' : '空闲' }}
                </span>
              </div>
              <div v-if="pendingInterventions.length === 0" class="mt-3 rounded-md border border-dashed border-slate-200 bg-white px-3 py-3 text-[13px] text-slate-500">当前没有等待人工接管的请求。</div>
              <article v-for="intervention in pendingInterventions" v-else :key="intervention.id" class="mt-3 rounded-sm border border-slate-200 bg-white px-3 py-3">
                <p class="text-[13px] font-semibold text-slate-950">{{ intervention.title }}</p>
                <p class="mt-1 text-[12px] text-slate-500">{{ intervention.kind }} · {{ intervention.trigger }} · {{ intervention.requestedAt }}</p>
                <p class="mt-3 text-[13px] leading-5 text-slate-700">{{ intervention.message }}</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button type="button" class="rounded-sm bg-slate-950 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50" :disabled="managementBusy" @click="approveIntervention(intervention.id)">恢复运行</button>
                  <button type="button" class="rounded-sm border border-slate-300 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 disabled:opacity-50" :disabled="managementBusy" @click="rejectIntervention(intervention.id)">拒绝</button>
                </div>
              </article>
            </div>
          </section>

          <section class="space-y-4">
            <div class="flex items-center gap-2 text-slate-500 opacity-70">
              <span class="text-[13px]" aria-hidden="true">●</span>
              <h3 class="text-[10px] font-bold uppercase tracking-normal">桥接连接</h3>
            </div>
            <div class="space-y-3 rounded-sm border border-slate-200 bg-slate-50/50 px-3 py-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-[13px] font-semibold text-slate-950">执行主机</p>
                  <p class="text-[12px] text-slate-500">默认 {{ hostsSummary?.defaultHostId ?? 'none' }} · 已连接 {{ hostsSummary?.connectedCount ?? 0 }}/{{ hostsSummary?.totalCount ?? 0 }}</p>
                </div>
              </div>
              <div v-if="hostItems.length === 0" class="rounded-md border border-dashed border-slate-200 bg-white px-3 py-3 text-[13px] text-slate-500">当前没有可管理的执行主机。</div>
              <article v-for="host in hostItems" v-else :key="host.hostId" class="rounded-sm border border-slate-200 bg-white px-3 py-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-[13px] font-semibold text-slate-950">{{ host.hostId }}</p>
                    <p class="mt-1 text-[12px] text-slate-500">{{ host.kind }} · {{ host.state }}</p>
                  </div>
                  <span class="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold" :class="hostStatusClass(host)">{{ hostStatusLabel(host) }}</span>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button type="button" class="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 disabled:opacity-50" :disabled="managementBusy || host.connected" @click="submitHostAction('hosts.connect', host.hostId)">连接</button>
                  <button type="button" class="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 disabled:opacity-50" :disabled="managementBusy || !host.connected" @click="submitHostAction('hosts.disconnect', host.hostId)">断开</button>
                  <button type="button" class="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 disabled:opacity-50" :disabled="managementBusy || host.isDefault" @click="submitHostAction('hosts.set_default', host.hostId)">设为默认</button>
                </div>
              </article>
            </div>
          </section>

          <section class="space-y-4">
            <div class="flex items-center gap-2 text-slate-500 opacity-70">
              <span class="text-[13px]" aria-hidden="true">●</span>
              <h3 class="text-[10px] font-bold uppercase tracking-normal">运行诊断</h3>
            </div>
            <div class="space-y-3 rounded-sm border border-slate-200 bg-slate-50/50 px-3 py-3">
              <p class="text-[13px] font-semibold text-slate-950">诊断快照</p>
              <p class="text-[12px] leading-5 text-slate-500">捕获当前 runtime、host、site 和最近错误状态，排查完成后可清除错误状态。</p>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="rounded-sm bg-slate-950 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50" :disabled="managementBusy" @click="captureDiagnostics">捕获诊断</button>
                <button type="button" class="rounded-sm border border-slate-300 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 disabled:opacity-50" :disabled="managementBusy || !runtimeSummary?.lastError" @click="clearRuntimeError">清除错误</button>
              </div>
              <pre v-if="diagnosticsPayload" class="mt-3 max-h-72 overflow-auto rounded-md bg-slate-950 px-3 py-3 text-[11px] leading-5 text-slate-100"><code>{{ diagnosticsPayload }}</code></pre>
            </div>
          </section>
        </section>
      </main>
    </section>
  </div>
</template>
