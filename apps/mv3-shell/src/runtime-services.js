import { BrowserVfs } from "@bbl-next/browser-vfs";
import { CapabilityError } from "@bbl-next/contracts";
import {
  BUILTIN_CAPABILITIES,
  CapabilityRegistry,
  FamilyProviderRegistry,
  createConfigCapabilityProvider,
  createConfigControlPlane,
  createTabsCapabilityProvider,
  dispatchCapabilityCall,
} from "@bbl-next/core";
import { InMemorySessionStorage, VfsSessionStorage, createKernel } from "@bbl-next/kernel";
import { invokeSingleActionSiteSkill } from "@bbl-next/site-runtime";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const DEFAULT_INTERVENTION_TIMEOUT_MS = 5 * 60 * 1000;
const SKILL_STATUS_BY_ACTION = {
  "skills.install": "installed",
  "skills.enable": "enabled",
  "skills.disable": "disabled",
  "skills.uninstall": "archived",
};

function createInMemorySkillManager() {
  const records = new Map();

  function cloneSkillRecord(record) {
    return {
      skillId: record.skillId,
      status: record.status,
      trusted: record.trusted,
      recentChange: record.recentChange,
      lastChangedAt: record.lastChangedAt,
    };
  }

  return {
    async list() {
      return [...records.values()].map((record) => cloneSkillRecord(record));
    },
    async listActiveIds() {
      return [...records.values()]
        .filter((record) => record.status !== "archived")
        .map((record) => record.skillId);
    },
    async manage({ action, skillId }) {
      const previous = records.get(skillId);
      const status = SKILL_STATUS_BY_ACTION[action];
      if (!status) {
        throw new CapabilityError("E_RUNTIME", `Unsupported skill lifecycle action: ${action}`);
      }

      const nextRecord = {
        skillId,
        status,
        trusted: previous?.trusted ?? false,
        recentChange: action,
        lastChangedAt: new Date().toISOString(),
      };
      records.set(skillId, nextRecord);

      return {
        skill: {
          skillId,
          status,
          trusted: nextRecord.trusted,
          recentChange: action,
        },
      };
    },
  };
}

function createBridgeRunnerHost({ invokeRunner }) {
  return {
    async invoke(request) {
      const response = await invokeRunner(request);
      if (!response.ok) {
        const error = response.error ?? {
          code: "E_RUNTIME",
          message: "Runner bridge unavailable",
        };
        throw new CapabilityError(error.code, error.message, error.details);
      }
      if (response.data?.ok !== true) {
        const error = response.data?.error ?? {
          code: "E_RUNTIME",
          message: "Runner invocation failed",
        };
        throw new CapabilityError(error.code, error.message, error.details);
      }
      return response.data.result;
    },
  };
}

function createSiteRuntimeInstaller(pageHookBridge) {
  if (!pageHookBridge) {
    return undefined;
  }
  return {
    install(step, currentTab) {
      return pageHookBridge.install(step, currentTab);
    },
    invoke(request) {
      return pageHookBridge.invoke(request);
    },
    verify(request) {
      return pageHookBridge.verify(request);
    },
  };
}

function toKernelStepFailure(error) {
  const code = error instanceof CapabilityError ? error.code : "E_RUNTIME";
  const message = error instanceof Error ? error.message : String(error);
  const details = error instanceof CapabilityError ? error.details : undefined;
  return {
    ok: false,
    error: message,
    retryable: code === "E_RUNTIME",
    data: {
      code,
      details,
    },
  };
}

function unwrapKernelStepResult(executed, fallbackMessage) {
  if (executed.result?.ok) {
    return executed.result.data;
  }

  const failure = isPlainObject(executed.result?.data) ? executed.result.data : {};
  throw new CapabilityError(
    typeof failure.code === "string" ? failure.code : "E_RUNTIME",
    executed.result?.error ?? fallbackMessage,
    failure.details,
  );
}

function activateKernelRun(kernel, sessionId) {
  const state = kernel.getRunState(sessionId);
  switch (state.phase) {
    case "idle":
      kernel.startRun(sessionId);
      break;
    case "paused":
      kernel.resume(sessionId);
      break;
    case "running":
      break;
    default:
      throw new CapabilityError("E_RUNTIME", `Kernel run is unavailable while ${state.phase}`);
  }
}

function settleKernelRun(kernel, sessionId) {
  if (kernel.getRunState(sessionId).phase === "running") {
    kernel.pause(sessionId);
  }
}

async function createSessionStorage({ sessionStorage, workspaceId }) {
  if (sessionStorage) {
    return sessionStorage;
  }
  if (typeof indexedDB === "undefined") {
    return new InMemorySessionStorage();
  }
  const vfs = await BrowserVfs.create({ workspaceId });
  return new VfsSessionStorage(vfs);
}

function pickRuntimeSession(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return null;
  }
  return (
    [...sessions]
      .filter((session) => session?.title === "mv3-shell runtime session")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
  );
}

function toCanonicalTab(activeTab) {
  return {
    tabId: activeTab.id,
    url: activeTab.url,
    active: activeTab.active === true,
    title: typeof activeTab.title === "string" ? activeTab.title : undefined,
  };
}

async function queryActiveTab(chromeApi) {
  if (!chromeApi?.tabs?.query) {
    return null;
  }
  const activeTabs = await chromeApi.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const activeTab = Array.isArray(activeTabs) ? activeTabs[0] : undefined;
  if (!activeTab || typeof activeTab.id !== "number" || typeof activeTab.url !== "string") {
    return null;
  }
  return activeTab;
}

async function requireActiveTab(chromeApi, actionKind) {
  const activeTab = await queryActiveTab(chromeApi);
  if (!activeTab) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      `${actionKind} requires an active tab with url metadata`,
    );
  }
  return activeTab;
}

function createChromeTabsTransport({ chromeApi }) {
  return {
    async list() {
      if (!chromeApi?.tabs?.query) {
        throw new CapabilityError("E_RUNTIME", "chrome.tabs.query is required for tabs.list");
      }
      const tabs = await chromeApi.tabs.query({});
      return Array.isArray(tabs)
        ? tabs
            .filter((tab) => typeof tab?.id === "number" && typeof tab?.url === "string")
            .map((tab) => toCanonicalTab(tab))
        : [];
    },
    async getActive(actionKind) {
      return toCanonicalTab(await requireActiveTab(chromeApi, actionKind));
    },
    async navigate(url) {
      if (!chromeApi?.tabs?.update) {
        throw new CapabilityError("E_RUNTIME", "chrome.tabs.update is required for tabs.navigate");
      }
      const activeTab = await requireActiveTab(chromeApi, "tabs.navigate");
      const updatedTab = await chromeApi.tabs.update(activeTab.id, {
        url,
      });

      return toCanonicalTab(
        updatedTab && typeof updatedTab.id === "number" && typeof updatedTab.url === "string"
          ? updatedTab
          : {
              ...activeTab,
              url,
              active: true,
            },
      );
    },
  };
}

async function resolveRuntimeInvokeTab(chromeApi, requestedTab, actionKind) {
  if (!requestedTab || typeof requestedTab.tabId !== "number") {
    throw new CapabilityError("E_BAD_INPUT", `${actionKind} requires tab metadata`);
  }

  const activeTab = await requireActiveTab(chromeApi, actionKind);
  if (activeTab.id !== requestedTab.tabId) {
    throw new CapabilityError("E_BAD_INPUT", `${actionKind} target must be the active tab`);
  }

  return toCanonicalTab(activeTab);
}

function buildPageActionRequest({ action, input, tab, scriptPath }) {
  switch (action) {
    case "press_key":
      if (!isPlainObject(input) || typeof input.key !== "string" || input.key.length === 0) {
        throw new CapabilityError("E_BAD_INPUT", "page.press_key requires a non-empty key");
      }
      return {
        skillId: "bbl.page",
        action: "press_key",
        tab,
        input: {
          key: input.key,
        },
        plan: {
          skillId: "bbl.page",
          action: "press_key",
          steps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.page",
              jsPath: scriptPath,
              runAt: "document_idle",
            },
          ],
        },
        module: {
          id: "bbl.page.press_key",
          source: "exports.default = async ({ input }) => ({ key: input.key });",
        },
        verifier: "page_press_key",
      };
    default:
      throw new CapabilityError("E_BAD_INPUT", `Unsupported page action: ${action}`);
  }
}

function normalizeChatRunStatus(status) {
  return status === "running" || status === "stopped" ? status : "idle";
}

function createChatMessageItem({ id, role, text, state = "complete" }) {
  return {
    id,
    kind: "message",
    role,
    text,
    state,
  };
}

function createChatToolItem({ id, toolName, summary, detail }) {
  return {
    id,
    kind: "tool",
    toolName,
    summary,
    detail,
    expanded: false,
  };
}

function summarizeChatToolDetail(detail) {
  const normalized = String(detail ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "Tool completed";
  }
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
}

function toChatTranscriptItem(message) {
  if (!message || typeof message !== "object") {
    return null;
  }
  if (message.role === "user" || message.role === "assistant") {
    if (typeof message.toolName === "string" && message.toolName.length > 0) {
      return createChatToolItem({
        id: message.toolCallId ?? message.entryId,
        toolName: message.toolName,
        summary: summarizeChatToolDetail(message.content),
        detail: message.content,
      });
    }
    return createChatMessageItem({
      id: message.entryId,
      role: message.role,
      text: message.content,
    });
  }
  return null;
}

async function emitRuntimeChatEvent(chromeApi, event) {
  if (typeof chromeApi?.runtime?.sendMessage !== "function") {
    return;
  }
  await chromeApi.runtime.sendMessage({
    type: "bbl-next.runtime.chat.event",
    event,
  });
}

async function waitForStreamTurn(signal) {
  if (signal?.aborted) {
    throw new Error("Chat run aborted");
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (signal?.aborted) {
    throw new Error("Chat run aborted");
  }
}

function buildRuntimeBootstrapToolPayload({ activeTab, kernelState, sessionId }) {
  return JSON.stringify(
    {
      sessionId,
      activeTab: activeTab
        ? {
            tabId: activeTab.id,
            url: activeTab.url,
            title: typeof activeTab.title === "string" ? activeTab.title : undefined,
          }
        : null,
      kernelRunPhase: kernelState?.runState?.phase ?? "idle",
    },
    null,
    2,
  );
}

export function createRemoteExecAdapter(sendExec) {
  return {
    exec(request) {
      return Promise.resolve(sendExec(request)).catch((error) => ({
        ok: false,
        error: {
          code:
            error && typeof error === "object" && typeof error.code === "string"
              ? error.code
              : "E_RUNTIME",
          message: error instanceof Error ? error.message : "Remote exec failed",
          details: {
            kind: "exec",
            hostId: request.hostId,
            reason: "remote_exec_failed",
          },
        },
      }));
    },
  };
}

export function createBackgroundRuntimeServices({
  invokeRunner,
  pageHookBridge,
  chromeApi = globalThis.chrome,
  sessionStorage = undefined,
  llmAdapter = undefined,
  configSummary = undefined,
  workspaceId = "mv3-shell",
  interventionTimeoutMs = DEFAULT_INTERVENTION_TIMEOUT_MS,
  pageHookScriptPath = "src/page-hook.js",
} = {}) {
  let servicesPromise = null;
  let sessionPromise = null;
  let chatRunStatus = "idle";
  let activeChatRun = null;
  const skillManager = createInMemorySkillManager();

  async function ensureServices() {
    if (!servicesPromise) {
      servicesPromise = (async () => {
        const storage = await createSessionStorage({
          sessionStorage,
          workspaceId,
        });
        const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
        const providers = new FamilyProviderRegistry();
        const configControlPlane = createConfigControlPlane({ summary: configSummary });

        providers.register(createTabsCapabilityProvider(createChromeTabsTransport({ chromeApi })));
        providers.register(createConfigCapabilityProvider(configControlPlane));

        const runnerHost = createBridgeRunnerHost({ invokeRunner });
        let kernelRef = null;
        const executeRunnerStep = async ({ step }) => {
          try {
            const invocation = await runnerHost.invoke({
              module: step.module,
              input: step.input,
              ctx: step.ctx ?? {},
              ...(typeof step.timeoutMs === "number" ? { timeoutMs: step.timeoutMs } : {}),
            });
            return {
              ok: true,
              data: invocation.result,
            };
          } catch (error) {
            return toKernelStepFailure(error);
          }
        };
        const executeSiteStep = async ({ sessionId, step }) => {
          if (!kernelRef) {
            return toKernelStepFailure(
              new CapabilityError("E_RUNTIME", "Kernel site executor is not ready"),
            );
          }
          if (!isPlainObject(step.input)) {
            return toKernelStepFailure(
              new CapabilityError("E_BAD_INPUT", "Kernel site step requires structured input"),
            );
          }

          const payload = step.input;
          if (
            !payload.plan ||
            !Array.isArray(payload.plan.steps) ||
            !payload.module ||
            typeof payload.module.id !== "string" ||
            typeof payload.module.source !== "string"
          ) {
            return toKernelStepFailure(
              new CapabilityError("E_BAD_INPUT", "Kernel site step requires plan and module"),
            );
          }

          try {
            const result = await invokeSingleActionSiteSkill({
              request: {
                skillId: step.skillId,
                action: step.action,
                tab: step.tab,
                input: payload.input ?? {},
                ctx: isPlainObject(payload.ctx) ? payload.ctx : {},
                plan: payload.plan,
                module: payload.module,
                ...(typeof payload.verifier === "string" ? { verifier: payload.verifier } : {}),
                ...(isPlainObject(payload.intervention)
                  ? { intervention: payload.intervention }
                  : {}),
                executeRunner: async (request) => {
                  const runnerExecuted = await kernelRef.executeStep(sessionId, {
                    kind: "runner",
                    capabilityId: step.capabilityId
                      ? `${step.capabilityId}.runner`
                      : `site.runner.${step.skillId}.${step.action}`,
                    module: request.module,
                    input: request.input,
                    ctx: request.ctx,
                  });
                  return unwrapKernelStepResult(
                    runnerExecuted,
                    `Kernel runner step failed for ${step.skillId}.${step.action}`,
                  );
                },
              },
              runnerHost,
              ...(pageHookBridge
                ? {
                    installer: createSiteRuntimeInstaller(pageHookBridge),
                  }
                : {}),
            });

            return {
              ok: true,
              data: result,
              verified: result.verified,
            };
          } catch (error) {
            return toKernelStepFailure(error);
          }
        };
        const kernel = createKernel({
          storage,
          llm: llmAdapter ?? {
            complete: async () => "",
          },
          registry,
          providers,
          executeRunnerStep,
          executeSiteStep,
        });
        kernelRef = kernel;

        return {
          configControlPlane,
          storage,
          registry,
          providers,
          runnerHost,
          kernel,
        };
      })();
    }
    return servicesPromise;
  }

  async function ensureSession() {
    if (!sessionPromise) {
      sessionPromise = ensureServices().then(async ({ kernel }) => {
        const existing = pickRuntimeSession(await kernel.listSessions());
        const session =
          existing ??
          (await kernel.createSession({
            title: "mv3-shell runtime session",
          }));
        await kernel.rehydrateInterventions(session.id);
        return session;
      });
    }
    return sessionPromise;
  }

  async function dispatchCapability({
    capabilityId,
    input = {},
    skillId = "mv3-shell.background",
    permissions = ["*"],
  }) {
    const [{ registry, providers }, session] = await Promise.all([
      ensureServices(),
      ensureSession(),
    ]);
    return dispatchCapabilityCall({
      registry,
      providers,
      sessionId: session.id,
      capabilityId,
      input,
      skillId,
      permissions,
      listSkills: async () => skillManager.listActiveIds(),
      manageSkill: async (request) => skillManager.manage(request),
    });
  }

  async function getKernelRuntimeState() {
    const [{ kernel }, session] = await Promise.all([ensureServices(), ensureSession()]);
    return {
      session,
      runState: kernel.getRunState(session.id),
    };
  }

  async function getConfigBootstrapSummary() {
    const { configControlPlane } = await ensureServices();
    return configControlPlane.getBootstrapSummary();
  }

  async function getInterventionState() {
    if (!sessionPromise) {
      return {
        sessionId: null,
        status: "empty",
        totalCount: 0,
        activeCount: 0,
        recentCount: 0,
        active: [],
      };
    }
    const [{ kernel }, session] = await Promise.all([ensureServices(), sessionPromise]);
    const summary = kernel.getInterventionSummary({
      sessionId: session.id,
    });
    await kernel.persistInterventions(session.id);
    return {
      sessionId: session.id,
      ...summary,
    };
  }

  async function listInterventions() {
    if (!sessionPromise) {
      return [];
    }
    const [{ kernel }, session] = await Promise.all([ensureServices(), sessionPromise]);
    const items = kernel.listInterventions({
      sessionId: session.id,
    });
    await kernel.persistInterventions(session.id);
    return items;
  }

  async function readInterventionAudit(limit) {
    if (!sessionPromise) {
      return [];
    }
    const [{ kernel }, session] = await Promise.all([ensureServices(), sessionPromise]);
    const entries = kernel.readInterventionAudit({
      sessionId: session.id,
      limit,
    });
    await kernel.persistInterventions(session.id);
    return entries;
  }

  async function resolveIntervention({ id, resolution } = {}) {
    if (typeof id !== "string" || !id.trim()) {
      throw new CapabilityError("E_BAD_INPUT", "intervention.resolve requires a request id");
    }
    const { kernel } = await ensureServices();
    const record = kernel.resolveIntervention(
      id,
      isPlainObject(resolution) ? resolution : undefined,
    );
    if (record.sessionId) {
      await kernel.persistInterventions(record.sessionId);
    }
    return record;
  }

  async function cancelIntervention({ id, reason } = {}) {
    if (typeof id !== "string" || !id.trim()) {
      throw new CapabilityError("E_BAD_INPUT", "intervention.cancel requires a request id");
    }
    const { kernel } = await ensureServices();
    const record = kernel.cancelIntervention(
      id,
      typeof reason === "string" && reason.trim() ? { reason: reason.trim() } : undefined,
    );
    if (record.sessionId) {
      await kernel.persistInterventions(record.sessionId);
    }
    return record;
  }

  async function listSkills() {
    return skillManager.list();
  }

  async function buildChatBootstrap() {
    const [{ kernel }, session] = await Promise.all([ensureServices(), ensureSession()]);
    const context = await kernel.buildContext(session.id);

    return {
      sessionId: session.id,
      messages: context.messages.map((message) => toChatTranscriptItem(message)).filter(Boolean),
      runState: {
        status: normalizeChatRunStatus(chatRunStatus),
      },
    };
  }

  async function emitChatRunState(sessionId, status) {
    chatRunStatus = normalizeChatRunStatus(status);
    await emitRuntimeChatEvent(chromeApi, {
      type: "run.state",
      sessionId,
      status: chatRunStatus,
    });
  }

  async function sendChatPrompt({ text } = {}) {
    const prompt = typeof text === "string" ? text.trim() : "";
    if (!prompt) {
      throw new CapabilityError("E_BAD_INPUT", "runtime.chat.send requires a non-empty text");
    }

    if (activeChatRun && chatRunStatus === "running") {
      throw new CapabilityError(
        "E_RUNTIME",
        "runtime.chat.send requires the current run to finish",
      );
    }

    const [{ kernel }, session] = await Promise.all([ensureServices(), ensureSession()]);
    await kernel.appendMessage(session.id, {
      role: "user",
      text: prompt,
    });

    const runId = `chat-${crypto.randomUUID()}`;
    const assistantMessageId = `assistant-${crypto.randomUUID()}`;
    const toolMessageId = `tool-${crypto.randomUUID()}`;
    const controller = new AbortController();
    activeChatRun = {
      id: runId,
      sessionId: session.id,
      assistantMessageId,
      controller,
    };

    await emitChatRunState(session.id, "running");

    void (async () => {
      let finalAssistantText = "";
      try {
        const openingDelta = "Checking the runtime surface";
        finalAssistantText += openingDelta;
        await emitRuntimeChatEvent(chromeApi, {
          type: "assistant.delta",
          sessionId: session.id,
          messageId: assistantMessageId,
          chunk: openingDelta,
        });
        await waitForStreamTurn(controller.signal);

        const [activeTab, kernelState] = await Promise.all([
          queryActiveTab(chromeApi),
          getKernelRuntimeState(),
        ]);
        const toolDetail = buildRuntimeBootstrapToolPayload({
          activeTab,
          kernelState,
          sessionId: session.id,
        });
        const toolSummary = activeTab
          ? `Active tab: ${activeTab.title ?? activeTab.url}`
          : "No active tab is available";

        await emitRuntimeChatEvent(chromeApi, {
          type: "tool.result",
          sessionId: session.id,
          messageId: toolMessageId,
          toolName: "runtime.bootstrap",
          summary: toolSummary,
          detail: toolDetail,
        });
        await waitForStreamTurn(controller.signal);

        const closingDelta = activeTab
          ? `. Ready to work with ${activeTab.title ?? activeTab.url}.`
          : ". Ready to work once a tab is active.";
        finalAssistantText += closingDelta;
        await emitRuntimeChatEvent(chromeApi, {
          type: "assistant.delta",
          sessionId: session.id,
          messageId: assistantMessageId,
          chunk: closingDelta,
        });
        await waitForStreamTurn(controller.signal);

        await kernel.appendMessage(session.id, {
          role: "assistant",
          text: toolDetail,
          toolName: "runtime.bootstrap",
          toolCallId: toolMessageId,
        });
        await kernel.appendMessage(session.id, {
          role: "assistant",
          text: finalAssistantText,
        });

        await emitRuntimeChatEvent(chromeApi, {
          type: "assistant.done",
          sessionId: session.id,
          messageId: assistantMessageId,
          text: finalAssistantText,
        });

        if (activeChatRun?.id === runId) {
          activeChatRun = null;
          await emitChatRunState(session.id, "idle");
        }
      } catch (error) {
        if (controller.signal.aborted) {
          if (activeChatRun?.id === runId) {
            activeChatRun = null;
          }
          return;
        }
        if (activeChatRun?.id === runId) {
          activeChatRun = null;
          chatRunStatus = "idle";
        }
        await emitRuntimeChatEvent(chromeApi, {
          type: "run.error",
          sessionId: session.id,
          message: error instanceof Error ? error.message : String(error),
        });
        await emitChatRunState(session.id, "idle");
      }
    })();

    return {
      sessionId: session.id,
      accepted: true,
      runState: {
        status: normalizeChatRunStatus(chatRunStatus),
      },
    };
  }

  async function stopChatRun() {
    const session = await ensureSession();
    if (activeChatRun?.controller) {
      activeChatRun.controller.abort();
      activeChatRun = null;
    }
    await emitChatRunState(session.id, "stopped");
    return {
      sessionId: session.id,
      runState: {
        status: normalizeChatRunStatus(chatRunStatus),
      },
    };
  }

  async function invokeSiteSkill({
    skillId,
    action,
    tab,
    input = {},
    ctx = {},
    plan,
    module,
    verifier,
    intervention,
  }) {
    if (!plan || !Array.isArray(plan.steps)) {
      throw new CapabilityError("E_BAD_INPUT", "Site runtime invoke requires an injection plan");
    }
    if (!module || typeof module.id !== "string" || typeof module.source !== "string") {
      throw new CapabilityError("E_BAD_INPUT", "Site runtime invoke requires a runner module");
    }
    if (plan.steps.length > 0 && !pageHookBridge) {
      throw new CapabilityError("E_RUNTIME", "Page hook bridge is not configured");
    }

    const [{ kernel }, session] = await Promise.all([ensureServices(), ensureSession()]);
    const resolvedTab = await resolveRuntimeInvokeTab(chromeApi, tab, "Site runtime invoke");
    activateKernelRun(kernel, session.id);
    let executed;
    try {
      executed = await kernel.executeStep(session.id, {
        kind: "site",
        capabilityId: "site.runtime.invoke",
        skillId,
        action,
        tab: resolvedTab,
        input: {
          input,
          ctx,
          plan,
          module,
          ...(verifier ? { verifier } : {}),
          ...(intervention ? { intervention } : {}),
        },
      });
    } finally {
      settleKernelRun(kernel, session.id);
    }
    const result = unwrapKernelStepResult(executed, `Site runtime invoke failed for ${skillId}`);

    if (!result.intervention) {
      return result;
    }

    const requested = kernel.requestIntervention(session.id, result.intervention, {
      timeoutMs: interventionTimeoutMs,
    });
    await kernel.persistInterventions(session.id);

    return {
      ...result,
      intervention: requested,
    };
  }

  async function invokePageAction({ action, input = {}, ctx = {} } = {}) {
    if (!pageHookBridge) {
      throw new CapabilityError("E_RUNTIME", "Page hook bridge is not configured");
    }

    const [{ kernel }, session] = await Promise.all([ensureServices(), ensureSession()]);
    const request = buildPageActionRequest({
      action,
      input,
      tab: toCanonicalTab(await requireActiveTab(chromeApi, `page.${action}`)),
      scriptPath: pageHookScriptPath,
    });
    activateKernelRun(kernel, session.id);
    let executed;
    try {
      executed = await kernel.executeStep(session.id, {
        kind: "site",
        capabilityId: `page.${action}`,
        skillId: request.skillId,
        action: request.action,
        tab: request.tab,
        input: {
          input: request.input,
          ctx,
          plan: request.plan,
          module: request.module,
          ...(request.verifier ? { verifier: request.verifier } : {}),
        },
      });
    } finally {
      settleKernelRun(kernel, session.id);
    }
    const result = unwrapKernelStepResult(executed, `Page action failed for page.${action}`);

    if (!result.intervention) {
      return result;
    }

    const requested = kernel.requestIntervention(session.id, result.intervention, {
      timeoutMs: interventionTimeoutMs,
    });
    await kernel.persistInterventions(session.id);

    return {
      ...result,
      intervention: requested,
    };
  }

  return {
    bootstrapChat: buildChatBootstrap,
    dispatchCapability,
    ensureServices,
    ensureSession,
    getConfigBootstrapSummary,
    getInterventionState,
    getKernelRuntimeState,
    invokePageAction,
    invokeSiteSkill,
    listSkills,
    listInterventions,
    readInterventionAudit,
    resolveIntervention,
    cancelIntervention,
    sendChatPrompt,
    stopChatRun,
  };
}
