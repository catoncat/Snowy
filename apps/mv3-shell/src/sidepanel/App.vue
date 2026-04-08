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
import {
  applyManagementResourceDocument,
  buildManagementBootstrapRequests,
  createInitialManagementState,
  createManagementActionMessage,
  type ManagementState,
} from "./management";

const RUNNER_BACKGROUND_TARGET = "bbl-next.runner.background";

type RuntimeEnvelope = {
  ok?: boolean;
  data?: unknown;
  error?: { message?: string } | string;
};

type SidepanelPane = "control" | "chat";
type HostActionKind = "hosts.connect" | "hosts.disconnect" | "hosts.set_default";
type SkillActionKind =
  | "skills.install"
  | "skills.enable"
  | "skills.disable"
  | "skills.uninstall";

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

const activePane = ref<SidepanelPane>("control");
const chatState = ref<ChatState>(createInitialChatState());
const draft = ref("");
const loading = ref(true);
const sending = ref(false);
const listRef = ref<HTMLElement | null>(null);

const managementState = ref<ManagementState>(createInitialManagementState());
const managementLoading = ref(true);
const managementBusy = ref(false);
const managementError = ref<string | null>(null);
const managementNotice = ref<string | null>(null);
const diagnosticsPayload = ref<string | null>(null);
const configProviderDraft = ref("");
const configModelDraft = ref("");
const skillIdDraft = ref("");

const isRunning = computed(() => chatState.value.status === "running");
const isStopped = computed(() => chatState.value.status === "stopped");
const canSend = computed(() => !loading.value && !sending.value && !isRunning.value);
const statusTone = computed(() =>
  isRunning.value
    ? "bg-blue-50 text-blue-700"
    : isStopped.value
      ? "bg-amber-50 text-amber-700"
      : "bg-emerald-50 text-emerald-700",
);
const runtimeSummary = computed(() => managementState.value.runtime?.data ?? null);
const configSummary = computed(() => managementState.value.config?.data ?? null);
const skillsSummary = computed(() => managementState.value.skills?.data ?? null);
const hostsSummary = computed(() => managementState.value.hosts?.data ?? null);
const hostItems = computed(() => hostsSummary.value?.items ?? []);
const activeTabId = computed(() => runtimeSummary.value?.activeTab?.tabId ?? null);

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

function syncConfigDraftsFromSummary() {
  configProviderDraft.value = readStringField(configSummary.value?.values.model, "provider");
  configModelDraft.value = readStringField(configSummary.value?.values.model, "model");
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
  const model = configModelDraft.value.trim();
  const modelPatch: Record<string, unknown> = {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
  if (Object.keys(modelPatch).length === 0) {
    managementError.value = "Enter at least one model setting before updating config.";
    return;
  }
  void runManagementAction("config.update", {
    patch: {
      model: modelPatch,
    },
  });
}

function submitSkillAction(kind: SkillActionKind) {
  const skillId = skillIdDraft.value.trim();
  if (!skillId) {
    managementError.value = "Enter a skill id first.";
    return;
  }
  void runManagementAction(kind, { skillId });
}

function submitHostAction(kind: HostActionKind, hostId: string) {
  void runManagementAction(kind, { hostId });
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
  <div class="flex min-h-screen flex-col bg-slate-50 text-slate-900">
    <header class="border-b border-slate-200 bg-white px-4 py-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold">BBL Next Sidepanel</p>
          <p class="text-xs text-slate-500">
            Shared control plane + chat shell
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="rounded-full px-2 py-1 text-xs font-medium" :class="statusTone">
            {{ chatState.status }}
          </span>
          <button
            class="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!isRunning"
            @click="stopRun"
          >
            Stop
          </button>
        </div>
      </div>
      <div class="mt-3 flex gap-2">
        <button
          class="rounded-lg px-3 py-1.5 text-xs font-medium"
          :class="activePane === 'control' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'"
          @click="activePane = 'control'"
        >
          Control Plane
        </button>
        <button
          class="rounded-lg px-3 py-1.5 text-xs font-medium"
          :class="activePane === 'chat' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'"
          @click="activePane = 'chat'"
        >
          Chat Shell
        </button>
      </div>
    </header>

    <main v-if="activePane === 'control'" class="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      <div
        v-if="managementLoading"
        class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500"
      >
        Loading shared control-plane summaries…
      </div>

      <template v-else>
        <div
          v-if="managementError"
          class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
        >
          {{ managementError }}
        </div>
        <div
          v-if="managementNotice"
          class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
        >
          {{ managementNotice }}
        </div>

        <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Runtime</p>
              <p class="mt-1 text-sm font-medium text-slate-900">
                {{ runtimeSummary?.status ?? 'empty' }} · {{ runtimeSummary?.mode ?? 'active-tab-only' }}
              </p>
              <p class="mt-1 text-xs text-slate-500">
                session {{ runtimeSummary?.sessionId ?? 'none' }} · loop {{ runtimeSummary?.loopState ?? 'idle' }}
              </p>
            </div>
            <div class="flex gap-2">
              <button
                class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
                :disabled="managementBusy"
                @click="captureDiagnostics"
              >
                Capture diagnostics
              </button>
              <button
                class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
                :disabled="managementBusy || !runtimeSummary?.lastError"
                @click="clearRuntimeError"
              >
                Clear error
              </button>
            </div>
          </div>
          <div class="mt-3 grid gap-3 text-xs text-slate-600">
            <div class="rounded-xl bg-slate-50 px-3 py-2">
              <p class="font-medium text-slate-900">Active tab</p>
              <p class="mt-1 break-all">{{ runtimeSummary?.activeTab?.title ?? 'No active tab' }}</p>
              <p class="break-all text-slate-500">{{ runtimeSummary?.activeTab?.url ?? 'Unavailable' }}</p>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-2">
              <p class="font-medium text-slate-900">Last error</p>
              <p class="mt-1 break-all">
                {{ runtimeSummary?.lastError?.code ?? 'none' }}
                <span v-if="runtimeSummary?.lastError">· {{ runtimeSummary.lastError.message }}</span>
              </p>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-2">
              <p class="font-medium text-slate-900">Interventions</p>
              <p class="mt-1">
                active {{ runtimeSummary?.interventions.activeCount ?? 0 }} / total
                {{ runtimeSummary?.interventions.totalCount ?? 0 }}
              </p>
            </div>
          </div>
        </section>

        <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Config</p>
          <p class="mt-1 text-sm text-slate-900">
            {{ configSummary?.status ?? 'placeholder' }}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            updated {{ configSummary?.updatedAt ?? 'never' }}
          </p>
          <div class="mt-3 space-y-3">
            <label class="block text-xs text-slate-600">
              Provider
              <input
                v-model="configProviderDraft"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none"
                placeholder="openai"
              />
            </label>
            <label class="block text-xs text-slate-600">
              Model
              <input
                v-model="configModelDraft"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none"
                placeholder="gpt-5.4"
              />
            </label>
            <button
              class="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              :disabled="managementBusy"
              @click="saveConfig"
            >
              Update config via config.update
            </button>
            <pre class="overflow-x-auto rounded-xl bg-slate-950 px-3 py-3 text-[11px] leading-5 text-slate-100"><code>{{ formatJson(configSummary?.values ?? {}) }}</code></pre>
          </div>
        </section>

        <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Skills</p>
          <p class="mt-1 text-sm text-slate-900">
            installed {{ skillsSummary?.installedCount ?? 0 }} · enabled {{ skillsSummary?.enabledCount ?? 0 }} · trusted {{ skillsSummary?.trustedCount ?? 0 }}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            recent {{ skillsSummary?.recentChange ?? 'none' }}
          </p>
          <div class="mt-3 space-y-3">
            <input
              v-model="skillIdDraft"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none"
              placeholder="skill id"
            />
            <div class="grid grid-cols-2 gap-2">
              <button class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700" :disabled="managementBusy" @click="submitSkillAction('skills.install')">Install</button>
              <button class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700" :disabled="managementBusy" @click="submitSkillAction('skills.enable')">Enable</button>
              <button class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700" :disabled="managementBusy" @click="submitSkillAction('skills.disable')">Disable</button>
              <button class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700" :disabled="managementBusy" @click="submitSkillAction('skills.uninstall')">Uninstall</button>
            </div>
          </div>
        </section>

        <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Hosts</p>
          <p class="mt-1 text-sm text-slate-900">
            default {{ hostsSummary?.defaultHostId ?? 'none' }} · connected {{ hostsSummary?.connectedCount ?? 0 }}/{{ hostsSummary?.totalCount ?? 0 }}
          </p>
          <div class="mt-3 space-y-3">
            <article
              v-for="host in hostItems"
              :key="host.hostId"
              class="rounded-xl border border-slate-200 px-3 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-slate-900">{{ host.hostId }}</p>
                  <p class="mt-1 text-xs text-slate-500">
                    {{ host.kind }} · {{ host.state }} · {{ host.connected ? 'connected' : 'disconnected' }}
                  </p>
                </div>
                <span v-if="host.isDefault" class="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">default</span>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700" :disabled="managementBusy || host.connected" @click="submitHostAction('hosts.connect', host.hostId)">Connect</button>
                <button class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700" :disabled="managementBusy || !host.connected" @click="submitHostAction('hosts.disconnect', host.hostId)">Disconnect</button>
                <button class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700" :disabled="managementBusy || host.isDefault" @click="submitHostAction('hosts.set_default', host.hostId)">Set default</button>
              </div>
            </article>
          </div>
        </section>

        <section
          v-if="diagnosticsPayload"
          class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Last diagnostics</p>
          <pre class="mt-3 overflow-x-auto rounded-xl bg-slate-950 px-3 py-3 text-[11px] leading-5 text-slate-100"><code>{{ diagnosticsPayload }}</code></pre>
        </section>
      </template>
    </main>

    <main v-else ref="listRef" class="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      <div
        v-if="loading"
        class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500"
      >
        Loading runtime chat…
      </div>

      <div
        v-else-if="chatState.items.length === 0"
        class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500"
      >
        Send a message to start the minimal runtime demo.
      </div>

      <template v-for="item in chatState.items" :key="item.id">
        <article
          v-if="item.kind === 'message'"
          class="rounded-2xl px-4 py-3 shadow-sm"
          :class="
            item.role === 'user'
              ? 'ml-8 bg-slate-900 text-white'
              : 'mr-8 bg-white text-slate-900 ring-1 ring-slate-200'
          "
        >
          <div class="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide opacity-70">
            <span>{{ item.role }}</span>
            <span>{{ item.state }}</span>
          </div>
          <p class="whitespace-pre-wrap text-sm leading-6">{{ item.text }}</p>
        </article>

        <article v-else class="mr-8 overflow-hidden rounded-2xl bg-amber-50 ring-1 ring-amber-200">
          <button
            class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            @click="toggleTool(item.id)"
          >
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-amber-800">
                {{ item.toolName }}
              </p>
              <p class="mt-1 text-sm text-amber-950">{{ item.summary }}</p>
            </div>
            <span class="text-xs font-medium text-amber-700">
              {{ item.expanded ? 'Hide' : 'Show' }}
            </span>
          </button>
          <pre
            v-if="item.expanded"
            class="overflow-x-auto border-t border-amber-200 px-4 py-3 text-xs leading-5 text-amber-950"
          ><code>{{ item.detail }}</code></pre>
        </article>
      </template>
    </main>

    <footer class="border-t border-slate-200 bg-white px-4 py-4">
      <template v-if="activePane === 'chat'">
        <div
          v-if="chatState.error"
          class="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
        >
          {{ chatState.error }}
        </div>
        <div class="rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm">
          <textarea
            v-model="draft"
            class="min-h-24 w-full resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
            placeholder="Ask the runtime to summarize its current state..."
            :disabled="loading || isRunning"
            @keydown.enter="onComposerEnter"
          />
          <div class="flex items-center justify-between border-t border-slate-200 px-2 pt-2">
            <p class="text-xs text-slate-500">
              {{ isRunning ? 'Streaming demo response…' : 'Press Enter to send' }}
            </p>
            <button
              class="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              :disabled="!draft.trim() || !canSend"
              @click="sendPrompt"
            >
              Send
            </button>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
          Management view reads only `resource.read` summaries and writes only approved control-plane actions.
        </div>
      </template>
    </footer>
  </div>
</template>
