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

const RUNNER_BACKGROUND_TARGET = "bbl-next.runner.background";

type RuntimeEnvelope = {
  ok?: boolean;
  data?: unknown;
  error?: { message?: string } | string;
};

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

const state = ref<ChatState>(createInitialChatState());
const draft = ref("");
const loading = ref(true);
const sending = ref(false);
const listRef = ref<HTMLElement | null>(null);

const isRunning = computed(() => state.value.status === "running");
const isStopped = computed(() => state.value.status === "stopped");
const canSend = computed(() => !loading.value && !sending.value && !isRunning.value);
const statusTone = computed(() =>
  isRunning.value ? "bg-blue-50 text-blue-700" : isStopped.value ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700",
);

async function scrollToBottom() {
  await nextTick();
  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight;
  }
}

watch(
  () => state.value.items.length,
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

async function bootstrap() {
  loading.value = true;
  try {
    const payload = await callRuntime<{
      sessionId: string | null;
      runState: { status?: string };
      messages: ChatItem[];
    }>("runtime.chat.bootstrap");
    state.value = applyBootstrapState(state.value, payload);
  } catch (error) {
    state.value = {
      ...state.value,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    loading.value = false;
  }
}

function onRuntimeMessage(message: unknown) {
  const payload = message as { type?: string; event?: ChatEvent } | null;
  if (!payload || payload.type !== "bbl-next.runtime.chat.event" || !payload.event) {
    return;
  }
  state.value = applyChatEvent(state.value, payload.event);
}

async function sendPrompt() {
  const text = draft.value.trim();
  if (!text || !canSend.value) {
    return;
  }

  const optimisticId = `local-user-${crypto.randomUUID()}`;
  state.value = {
    ...state.value,
    error: null,
    items: [
      ...state.value.items,
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
    state.value = {
      ...state.value,
      sessionId: payload.sessionId,
      status:
        payload.runState.status === "running" || payload.runState.status === "stopped"
          ? payload.runState.status
          : "idle",
    };
  } catch (error) {
    state.value = {
      ...state.value,
      items: state.value.items.filter((item) => item.id !== optimisticId),
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
      sessionId: state.value.sessionId,
    });
    state.value = {
      ...state.value,
      status:
        payload.runState.status === "running" || payload.runState.status === "stopped"
          ? payload.runState.status
          : "idle",
    };
  } catch (error) {
    state.value = {
      ...state.value,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function toggleTool(id: string) {
  state.value = toggleToolExpanded(state.value, id);
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
  void bootstrap();
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
          <p class="text-sm font-semibold">BBL Next Chat</p>
          <p class="text-xs text-slate-500">Minimal side panel runtime shell</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="rounded-full px-2 py-1 text-xs font-medium" :class="statusTone">
            {{ state.status }}
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
    </header>

    <main ref="listRef" class="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      <div
        v-if="loading"
        class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500"
      >
        Loading runtime chat…
      </div>

      <div
        v-else-if="state.items.length === 0"
        class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500"
      >
        Send a message to start the minimal runtime demo.
      </div>

      <template v-for="item in state.items" :key="item.id">
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
              {{ item.expanded ? "Hide" : "Show" }}
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
      <div
        v-if="state.error"
        class="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
      >
        {{ state.error }}
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
            {{ isRunning ? "Streaming demo response…" : "Press Enter to send" }}
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
    </footer>
  </div>
</template>
