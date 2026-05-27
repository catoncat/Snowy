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
type HostActionKind = "hosts.connect" | "hosts.disconnect" | "hosts.set_default";
type SkillActionKind =
  | "skills.install"
  | "skills.enable"
  | "skills.disable"
  | "skills.uninstall"
  | "skills.rollback";

const runtimeApi = (
  globalThis as {
    chrome?: {
      runtime?: {
        sendMessage?: (message: unknown) => Promise<RuntimeEnvelope>;
        onMessage?: {
          addListener: (listener: (message: unknown) => void) => void;
          removeListener: (listener: (message: unknown) => void) => void;
        };
      };
    };
  }
).chrome?.runtime;

const navItems: Array<{ id: SidepanelPane; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "sessions", label: "Sessions" },
  { id: "provider", label: "Provider" },
  { id: "skills", label: "Skills" },
  { id: "runtime", label: "Runtime" },
];

const activePane = ref<SidepanelPane>("chat");
const chatState = ref<ChatState>(createInitialChatState());
const draft = ref("");
const loading = ref(true);
const sending = ref(false);
const listRef = ref<HTMLElement | null>(null);
const composerRef = ref<HTMLTextAreaElement | null>(null);

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
const canSend = computed(() => !loading.value && !sending.value && !isRunning.value);
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
const activeSessionTitle = computed(() =>
  messageCount.value > 0 && chatState.value.sessionId
    ? `Session ${shortId(chatState.value.sessionId)}`
    : "新对话",
);
const activeTabTitle = computed(() => runtimeSummary.value?.activeTab?.title ?? "当前标签页未连接");
const lastMessagePreview = computed(() => {
  const lastMessage = [...chatState.value.items]
    .reverse()
    .find((item) => item.kind === "message");
  return lastMessage?.kind === "message" && lastMessage.text.trim()
    ? lastMessage.text.trim()
    : "暂无消息";
});
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

function insertComposerToken(token: string) {
  const needsSpace = draft.value.length > 0 && !draft.value.endsWith(" ");
  draft.value = `${draft.value}${needsSpace ? " " : ""}${token}`;
  void focusComposer();
}

function syncConfigDraftsFromSummary() {
  configProviderDraft.value = readStringField(configSummary.value?.values.model, "provider");
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

async function bootstrapChat() {
  loading.value = true;
  try {
    const payload = await callRuntime<{
      sessionId: string | null;
      runState: { status?: string };
      messages: ChatItem[];
    }>("runtime.chat.bootstrap");
    chatState.value = applyBootstrapState(chatState.value, payload);
  } catch (error) {
    chatState.value = {
      ...chatState.value,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    loading.value = false;
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
}

async function sendPrompt() {
  const text = draft.value.trim();
  if (!text || !canSend.value) {
    return;
  }

  const optimisticId = `local-user-${crypto.randomUUID()}`;
  chatState.value = {
    ...chatState.value,
    error: null,
    items: [
      ...chatState.value.items,
      {
        id: optimisticId,
        kind: "message",
        role: "user",
        text,
        state: "complete",
      },
    ],
  };
  draft.value = "";
  sending.value = true;

  try {
    const payload = await callRuntime<{
      sessionId: string | null;
      runState: { status?: string };
    }>("runtime.chat.send", { text });
    chatState.value = {
      ...chatState.value,
      sessionId: payload.sessionId,
      status:
        payload.runState.status === "running" || payload.runState.status === "stopped"
          ? payload.runState.status
          : "idle",
    };
  } catch (error) {
    chatState.value = {
      ...chatState.value,
      items: chatState.value.items.filter((item) => item.id !== optimisticId),
      error: error instanceof Error ? error.message : String(error),
    };
    draft.value = text;
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

function onComposerEnter(event: KeyboardEvent) {
  if (event.shiftKey) {
    return;
  }
  event.preventDefault();
  void sendPrompt();
}

onMounted(() => {
  runtimeApi?.onMessage?.addListener(onRuntimeMessage);
  void Promise.all([bootstrapChat(), bootstrapManagement()]);
});

onUnmounted(() => {
  runtimeApi?.onMessage?.removeListener(onRuntimeMessage);
});
</script>

<template>
  <div class="flex h-screen min-h-0 flex-col bg-white text-slate-950">
    <header class="shrink-0 border-b border-slate-200 bg-white">
      <div class="flex h-12 items-center gap-2 px-3">
        <div class="min-w-0 flex-1">
          <p class="truncate text-[15px] font-semibold leading-5 tracking-normal">
            {{ activeSessionTitle }}
          </p>
          <p class="truncate text-[11px] leading-4 text-slate-500">
            {{ activeTabTitle }}
          </p>
        </div>
        <button
          type="button"
          class="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-lg leading-none text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          title="停止运行"
          aria-label="停止运行"
          :disabled="!isRunning"
          @click="stopRun"
        >
          ■
        </button>
        <span
          class="rounded-full border px-2 py-1 text-[11px] font-medium leading-none"
          :class="statusTone"
        >
          {{ chatState.status }}
        </span>
      </div>
      <nav class="flex gap-1 overflow-x-auto border-t border-slate-100 px-2 py-1" aria-label="Sidepanel views">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors"
          :class="activePane === item.id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'"
          @click="selectPane(item.id)"
        >
          {{ item.label }}
        </button>
      </nav>
    </header>

    <main
      v-if="activePane === 'chat'"
      ref="listRef"
      class="flex-1 overflow-y-auto px-4 py-4 sidepanel-scrollbar"
    >
      <section
        v-if="loading && !hasChatMessages"
        class="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500"
      >
        Loading runtime chat...
      </section>
      <section v-else-if="!hasChatMessages" class="mx-auto flex min-h-full max-w-xl flex-col justify-center py-6">
        <p class="text-[12px] font-semibold text-slate-500">Browser Brain Loop</p>
        <h1 class="mt-2 text-[22px] font-semibold tracking-normal text-slate-950">
          想让浏览器做什么？
        </h1>
        <div class="mt-6 grid gap-2">
          <button
            type="button"
            class="rounded-md border border-slate-200 px-3 py-2 text-left text-[13px] text-slate-800 hover:bg-slate-50"
            @click="useSuggestion('总结当前页面的要点')"
          >
            总结当前页面的要点
          </button>
          <button
            type="button"
            class="rounded-md border border-slate-200 px-3 py-2 text-left text-[13px] text-slate-800 hover:bg-slate-50"
            @click="useSuggestion('查看所有打开的标签页')"
          >
            查看所有打开的标签页
          </button>
          <button
            type="button"
            class="rounded-md border border-slate-200 px-3 py-2 text-left text-[13px] text-slate-800 hover:bg-slate-50"
            @click="useSuggestion('帮我操作这个页面')"
          >
            帮我操作这个页面
          </button>
        </div>
      </section>
      <ChatTranscriptPane
        v-else
        :items="chatState.items"
        :loading="loading"
        @toggle-tool="toggleTool"
      />
    </main>

    <main
      v-else-if="activePane === 'sessions'"
      class="flex-1 overflow-y-auto px-4 py-4 sidepanel-scrollbar"
    >
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-[16px] font-semibold tracking-normal">对话历史</h2>
          <p class="text-[12px] text-slate-500">{{ messageCount }} messages · {{ toolCount }} tool traces</p>
        </div>
        <button
          type="button"
          class="rounded-md border border-slate-200 px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
          @click="useSuggestion('')"
        >
          回到输入
        </button>
      </div>
      <article
        class="rounded-md border px-3 py-3"
        :class="chatState.sessionId ? 'border-slate-300 bg-slate-50' : 'border-dashed border-slate-300 bg-white'"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-[14px] font-semibold">{{ activeSessionTitle }}</p>
            <p class="mt-1 max-h-10 overflow-hidden text-[12px] leading-5 text-slate-500">
              {{ lastMessagePreview }}
            </p>
          </div>
          <span class="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
            active
          </span>
        </div>
        <button
          type="button"
          class="mt-3 rounded-md bg-slate-950 px-3 py-2 text-[12px] font-medium text-white"
          @click="selectPane('chat')"
        >
          打开
        </button>
      </article>
      <p class="mt-4 text-[12px] text-slate-500">暂无其它会话。</p>
    </main>

    <main
      v-else-if="activePane === 'provider'"
      class="flex-1 overflow-y-auto px-4 py-4 sidepanel-scrollbar"
    >
      <template v-if="managementLoading">
        <section class="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
          Loading provider settings...
        </section>
      </template>
      <template v-else>
        <div
          v-if="managementError"
          class="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700"
        >
          {{ managementError }}
        </div>
        <div
          v-if="managementNotice"
          class="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700"
        >
          {{ managementNotice }}
        </div>

        <section class="space-y-3">
          <div>
            <h2 class="text-[16px] font-semibold tracking-normal">模型设置</h2>
            <p class="text-[12px] text-slate-500">
              {{ configSummary?.status ?? 'not configured' }} · updated {{ configSummary?.updatedAt ?? 'never' }}
            </p>
          </div>

          <div class="divide-y divide-slate-200 rounded-md border border-slate-200">
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

          <div class="space-y-3 rounded-md border border-slate-200 px-3 py-3">
            <label class="block text-[12px] font-medium text-slate-600">
              Provider
              <select
                v-model="configProviderDraft"
                class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none focus:border-slate-500"
              >
                <option value="openai">OpenAI-compatible</option>
              </select>
            </label>
            <label class="block text-[12px] font-medium text-slate-600">
              API
              <select
                v-model="configApiDraft"
                class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none focus:border-slate-500"
              >
                <option value="responses">Responses API</option>
                <option value="chat_completions">Chat Completions</option>
              </select>
            </label>
            <label class="block text-[12px] font-medium text-slate-600">
              Model
              <input
                v-model="configModelDraft"
                class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-[13px] text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-500"
                placeholder="gpt-4o"
              />
            </label>
            <label class="block text-[12px] font-medium text-slate-600">
              Base URL
              <input
                v-model="configBaseUrlDraft"
                class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-[13px] text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-500"
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label class="block text-[12px] font-medium text-slate-600">
              API Key
              <input
                v-model="configApiKeyDraft"
                type="password"
                autocomplete="off"
                spellcheck="false"
                class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-[13px] text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-500"
                placeholder="Leave blank to keep saved key"
              />
            </label>
            <button
              type="button"
              class="rounded-md bg-slate-950 px-3 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="managementBusy"
              @click="saveConfig"
            >
              保存模型设置
            </button>
          </div>

          <details class="rounded-md border border-slate-200 px-3 py-3">
            <summary class="cursor-pointer text-[12px] font-medium text-slate-600">配置摘要</summary>
            <pre class="mt-3 overflow-x-auto rounded-md bg-slate-950 px-3 py-3 text-[11px] leading-5 text-slate-100"><code>{{ configValuesJson }}</code></pre>
          </details>
        </section>
      </template>
    </main>

    <main
      v-else-if="activePane === 'skills'"
      class="flex-1 overflow-y-auto px-4 py-4 sidepanel-scrollbar"
    >
      <template v-if="managementLoading">
        <section class="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
          Loading skills...
        </section>
      </template>
      <template v-else>
        <div
          v-if="managementError"
          class="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700"
        >
          {{ managementError }}
        </div>
        <div
          v-if="managementNotice"
          class="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700"
        >
          {{ managementNotice }}
        </div>

        <div class="mb-4">
          <h2 class="text-[16px] font-semibold tracking-normal">Skills</h2>
          <p class="text-[12px] text-slate-500">
            installed {{ skillsSummary?.installedCount ?? 0 }} · enabled {{ skillsSummary?.enabledCount ?? 0 }} · trusted {{ skillsSummary?.trustedCount ?? 0 }}
          </p>
        </div>

        <div v-if="skillItems.length === 0" class="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
          No skill catalog items.
        </div>

        <div v-else class="space-y-2">
          <article
            v-for="skill in skillItems"
            :key="skill.skillId"
            class="rounded-md border border-slate-200 px-3 py-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="break-all text-[14px] font-semibold">{{ skill.skillId }}</p>
                <p class="mt-1 text-[12px] text-slate-500">
                  {{ skill.source }} · {{ skill.status }} · {{ skill.kind ?? 'unknown' }}
                </p>
              </div>
              <span
                class="shrink-0 rounded-full px-2 py-1 text-[11px] font-medium"
                :class="skill.enabled ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600'"
              >
                {{ skill.enabled ? 'enabled' : 'inactive' }}
              </span>
            </div>
            <p v-if="skill.description" class="mt-2 text-[13px] leading-5 text-slate-700">
              {{ skill.description }}
            </p>
            <div class="mt-3 grid gap-1 text-[11px] text-slate-500">
              <p class="break-all">entry {{ skill.entry ?? 'none' }} · version {{ skill.version ?? 'none' }}</p>
              <p class="break-all">actions {{ formatSkillActions(skill) }}</p>
              <p class="break-all">matches {{ formatList(skill.matches) }}</p>
              <p class="break-all">permissions {{ formatList(skill.permissions) }}</p>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50"
                :disabled="managementBusy"
                @click="selectSkill(skill.skillId)"
              >
                Select
              </button>
              <button
                type="button"
                class="rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50"
                :disabled="managementBusy || skill.enabled || skill.status === 'archived'"
                @click="submitSkillAction('skills.enable', skill.skillId)"
              >
                Enable
              </button>
              <button
                type="button"
                class="rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50"
                :disabled="managementBusy || !skill.enabled"
                @click="submitSkillAction('skills.disable', skill.skillId)"
              >
                Disable
              </button>
              <button
                type="button"
                class="rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50"
                :disabled="managementBusy || skill.status === 'archived'"
                @click="submitSkillAction('skills.uninstall', skill.skillId)"
              >
                Uninstall
              </button>
              <button
                type="button"
                class="rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50"
                :disabled="managementBusy || !skill.versionSurface?.rollbackTarget"
                @click="submitSkillRollback(skill)"
              >
                Rollback
              </button>
            </div>
          </article>
        </div>

        <details class="mt-4 rounded-md border border-slate-200 px-3 py-3">
          <summary class="cursor-pointer text-[12px] font-medium text-slate-600">包编辑器</summary>
          <div class="mt-3 space-y-3">
            <input
              v-model="skillIdDraft"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-[13px] text-slate-950 outline-none"
              placeholder="skill id"
            />
            <label class="block text-[12px] text-slate-600">
              Manifest JSON
              <textarea
                v-model="skillManifestDraft"
                class="mt-1 min-h-36 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-[12px] leading-5 text-slate-950 outline-none"
              />
            </label>
            <label class="block text-[12px] text-slate-600">
              Handler JS
              <textarea
                v-model="skillHandlerDraft"
                class="mt-1 min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-[12px] leading-5 text-slate-950 outline-none"
              />
            </label>
            <label class="block text-[12px] text-slate-600">
              SKILL.md
              <textarea
                v-model="skillMarkdownDraft"
                class="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-[12px] leading-5 text-slate-950 outline-none"
              />
            </label>
            <button
              type="button"
              class="rounded-md bg-slate-950 px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50"
              :disabled="managementBusy"
              @click="submitSkillPackageInstall"
            >
              Save package
            </button>
          </div>
        </details>
      </template>
    </main>

    <main
      v-else
      class="flex-1 overflow-y-auto px-4 py-4 sidepanel-scrollbar"
    >
      <template v-if="managementLoading">
        <section class="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
          Loading runtime...
        </section>
      </template>
      <template v-else>
        <div
          v-if="managementError"
          class="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700"
        >
          {{ managementError }}
        </div>
        <div
          v-if="managementNotice"
          class="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700"
        >
          {{ managementNotice }}
        </div>

        <section class="space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-[16px] font-semibold tracking-normal">Runtime</h2>
              <p class="text-[12px] text-slate-500">
                {{ runtimeSummary?.status ?? 'empty' }} · {{ runtimeSummary?.mode ?? 'active-tab-only' }}
              </p>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50"
                :disabled="managementBusy"
                @click="captureDiagnostics"
              >
                Capture diagnostics
              </button>
              <button
                type="button"
                class="rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 disabled:opacity-50"
                :disabled="managementBusy || !runtimeSummary?.lastError"
                @click="clearRuntimeError"
              >
                Clear error
              </button>
            </div>
          </div>

          <div class="divide-y divide-slate-200 rounded-md border border-slate-200">
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
              <p class="mt-1 break-all text-slate-600">
                {{ runtimeSummary?.lastError?.code ?? 'none' }}
                <span v-if="runtimeSummary?.lastError"> · {{ runtimeSummary.lastError.message }}</span>
              </p>
            </div>
          </div>

          <section class="rounded-md border border-slate-200 px-3 py-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-[13px] font-semibold">Pending interventions</h3>
                <p class="text-[12px] text-slate-500">
                  {{ pendingInterventions.length }} waiting
                </p>
              </div>
              <span
                class="rounded-full px-2 py-1 text-[11px] font-medium"
                :class="pendingInterventions.length > 0 ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'"
              >
                {{ pendingInterventions.length > 0 ? 'attention' : 'idle' }}
              </span>
            </div>

            <div
              v-if="pendingInterventions.length === 0"
              class="mt-3 rounded-md border border-dashed border-slate-200 px-3 py-3 text-[13px] text-slate-500"
            >
              No pending intervention requests.
            </div>

            <div v-else class="mt-3 space-y-2">
              <article
                v-for="intervention in pendingInterventions"
                :key="intervention.id"
                class="rounded-md border border-slate-200 bg-slate-50 px-3 py-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-[13px] font-semibold text-slate-950">{{ intervention.title }}</p>
                    <p class="mt-1 text-[12px] text-slate-500">
                      {{ intervention.kind }} · {{ intervention.trigger }} · {{ intervention.requestedAt }}
                    </p>
                  </div>
                  <span class="rounded-full bg-white px-2 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200">
                    {{ intervention.status }}
                  </span>
                </div>
                <p class="mt-3 text-[13px] leading-5 text-slate-700">{{ intervention.message }}</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-md bg-slate-950 px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50"
                    :disabled="managementBusy"
                    @click="approveIntervention(intervention.id)"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-slate-300 px-3 py-2 text-[12px] font-medium text-slate-700 disabled:opacity-50"
                    :disabled="managementBusy"
                    @click="rejectIntervention(intervention.id)"
                  >
                    Reject
                  </button>
                </div>
              </article>
            </div>
          </section>

          <section class="rounded-md border border-slate-200 px-3 py-3">
            <h3 class="text-[13px] font-semibold">Hosts</h3>
            <p class="text-[12px] text-slate-500">
              default {{ hostsSummary?.defaultHostId ?? 'none' }} · connected {{ hostsSummary?.connectedCount ?? 0 }}/{{ hostsSummary?.totalCount ?? 0 }}
            </p>
            <div class="mt-3 space-y-2">
              <article
                v-for="host in hostItems"
                :key="host.hostId"
                class="rounded-md border border-slate-200 px-3 py-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-[13px] font-medium text-slate-950">{{ host.hostId }}</p>
                    <p class="mt-1 text-[12px] text-slate-500">
                      {{ host.kind }} · {{ host.state }} · {{ host.connected ? 'connected' : 'disconnected' }}
                    </p>
                  </div>
                  <span v-if="host.isDefault" class="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">default</span>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button type="button" class="rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700" :disabled="managementBusy || host.connected" @click="submitHostAction('hosts.connect', host.hostId)">Connect</button>
                  <button type="button" class="rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700" :disabled="managementBusy || !host.connected" @click="submitHostAction('hosts.disconnect', host.hostId)">Disconnect</button>
                  <button type="button" class="rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] font-medium text-slate-700" :disabled="managementBusy || host.isDefault" @click="submitHostAction('hosts.set_default', host.hostId)">Set default</button>
                </div>
              </article>
            </div>
          </section>

          <section
            v-if="diagnosticsPayload"
            class="rounded-md border border-slate-200 px-3 py-3"
          >
            <h3 class="text-[13px] font-semibold">Last diagnostics</h3>
            <pre class="mt-3 overflow-x-auto rounded-md bg-slate-950 px-3 py-3 text-[11px] leading-5 text-slate-100"><code>{{ diagnosticsPayload }}</code></pre>
          </section>
        </section>
      </template>
    </main>

    <footer v-if="activePane === 'chat'" class="shrink-0 border-t border-slate-200 bg-white px-3 py-3">
      <div
        v-if="chatState.error"
        class="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700"
      >
        {{ chatState.error }}
      </div>
      <div class="rounded-lg border border-slate-300 bg-white shadow-sm">
        <textarea
          ref="composerRef"
          v-model="draft"
          class="max-h-44 min-h-24 w-full resize-none bg-transparent px-3 py-3 text-[14px] leading-6 outline-none placeholder:text-slate-400"
          placeholder="发消息给浏览器 agent..."
          :disabled="loading || isRunning"
          @keydown.enter="onComposerEnter"
        />
        <div class="flex items-center justify-between gap-2 border-t border-slate-200 px-2 py-2">
          <div class="flex min-w-0 flex-wrap items-center gap-1.5">
            <span class="rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-500">前台</span>
            <button
              type="button"
              class="rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
              @click="insertComposerToken('@')"
            >
              @ tab
            </button>
            <button
              type="button"
              class="rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
              @click="insertComposerToken('/')"
            >
              / skill
            </button>
          </div>
          <button
            type="button"
            class="rounded-md bg-slate-950 px-3 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            :disabled="!draft.trim() || !canSend"
            @click="sendPrompt"
          >
            Send
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>
