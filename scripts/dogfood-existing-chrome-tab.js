import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultExtensionDir = resolve(repoRoot, "apps/mv3-shell/dist");
const defaultPluginRoot = "/Users/envvar/.codex/plugins/cache/openai-bundled/chrome/26.527.31326";
const target = "bbl-next.runner.background";

const defaultPrompt =
  "只读观察当前已登录 Chrome 标签页。不要点赞、发帖、评论、关注、私信、提交表单、点击按钮或输入文字；如果需要任何外部可见动作，先停下来请求用户确认。完成后显式调用 debug_bundle，参数 includeTimeline=true。";
const defaultAllowedExternalActions = new Set(["page.info", "page.screenshot", "page.scroll"]);
const queryLlmResultLimits = {
  bodyTextChars: 900,
  elementTextChars: 120,
  elements: 12,
  fallbackInteractiveElements: 12,
};
const compactAttributeNames = new Set([
  "aria-label",
  "data-testid",
  "href",
  "name",
  "placeholder",
  "role",
  "title",
  "type",
  "value",
]);

function expandPath(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return path;
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stripTomlComment(line) {
  let quote;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quote === '"') {
      escaped = true;
      continue;
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? undefined : char;
      continue;
    }
    if (char === "#" && !quote) return line.slice(0, index);
  }
  return line;
}

function parseTomlScalar(rawValue) {
  const value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const unquoted = value.slice(1, -1);
    return value.startsWith('"') ? unquoted.replace(/\\"/g, '"').replace(/\\\\/g, "\\") : unquoted;
  }
  if (value === "true") return true;
  if (value === "false") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function parseCodexConfig(configPath) {
  const root = {};
  const providers = {};
  let section = [];
  const text = readFileSync(configPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].split(".");
      continue;
    }
    const assignment = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!assignment) continue;
    const [, key, rawValue] = assignment;
    let targetObject;
    if (section.length === 2 && section[0] === "model_providers") {
      const providerId = section[1];
      providers[providerId] ??= {};
      targetObject = providers[providerId];
    } else if (section.length === 0) {
      targetObject = root;
    }
    if (targetObject) targetObject[key] = parseTomlScalar(rawValue);
  }
  return { providers, root };
}

function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function bearerTokenValue(value) {
  const token = stringValue(value)
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  return token || undefined;
}

function resolveLlmConfig({
  codexConfig = "~/.codex/config.toml",
  codexProvider = "rs",
  llmApiKey,
  llmBaseUrl,
  llmModel,
} = {}) {
  if (llmApiKey || llmBaseUrl) {
    assert(llmApiKey, "llmApiKey is required with explicit LLM config");
    return {
      apiKey: bearerTokenValue(llmApiKey) ?? llmApiKey,
      baseUrl: llmBaseUrl ?? "https://api.openai.com/v1",
      configured: true,
      model: llmModel ?? "gpt-4o",
      report: {
        api: "responses",
        baseUrl: llmBaseUrl ?? "https://api.openai.com/v1",
        configured: true,
        model: llmModel ?? "gpt-4o",
        provider: "openai",
        source: "cli_or_env",
      },
    };
  }

  const configPath = expandPath(codexConfig);
  if (!existsSync(configPath)) {
    return {
      configured: false,
      report: { configured: false, reason: "codex_config_missing", source: "codex_config" },
    };
  }
  const config = parseCodexConfig(configPath);
  const provider = config.providers[codexProvider];
  const token =
    bearerTokenValue(provider?.experimental_bearer_token) ??
    bearerTokenValue(provider?.api_key) ??
    bearerTokenValue(provider?.bearer_token);
  if (!provider || !token) {
    return {
      configured: false,
      report: {
        configured: false,
        provider: codexProvider,
        reason: provider ? "codex_provider_token_missing" : "codex_provider_missing",
        source: "codex_config",
      },
    };
  }
  const model =
    llmModel ?? stringValue(provider.model) ?? stringValue(config.root.model) ?? "gpt-4o";
  const baseUrl = llmBaseUrl ?? stringValue(provider.base_url) ?? "https://api.openai.com/v1";
  return {
    apiKey: token,
    baseUrl,
    configured: true,
    model,
    report: {
      api: "responses",
      baseUrl,
      codexProvider,
      configured: true,
      model,
      provider: "openai",
      source: "codex_config",
    },
  };
}

function requireBuiltExtension(extensionDir) {
  const manifestPath = resolve(extensionDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Built extension is missing at ${manifestPath}. Run bun run build first.`);
  }
}

function prepareExtensionDir(extensionDir, artifactDir) {
  const preparedDir = resolve(artifactDir, "extension-debug-host-permissions");
  rmSync(preparedDir, { recursive: true, force: true });
  cpSync(extensionDir, preparedDir, { recursive: true });
  const manifestPath = resolve(preparedDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.host_permissions = Array.from(
    new Set([...(manifest.host_permissions ?? []), "<all_urls>"]),
  );
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return preparedDir;
}

function recordNetworkEvents(context) {
  const events = [];
  const record = (type, request, extra = {}) => {
    events.push({
      frameUrl: safeFrameUrl(request),
      method: request.method(),
      resourceType: request.resourceType(),
      timestamp: new Date().toISOString(),
      type,
      url: redactUrl(request.url()),
      ...extra,
    });
  };
  context.on("request", (request) => record("request", request));
  context.on("response", (response) =>
    record("response", response.request(), {
      responseContentType: response.headers()["content-type"],
      status: response.status(),
      statusText: response.statusText(),
    }),
  );
  context.on("requestfailed", (request) =>
    record("requestfailed", request, { errorText: request.failure()?.errorText }),
  );
  return events;
}

function redactUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (/(token|secret|key|auth|password|credential|session)/i.test(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function safeFrameUrl(request) {
  try {
    return redactUrl(request.frame().url());
  } catch {
    return undefined;
  }
}

async function waitForExtensionWorker(context) {
  for (const worker of context.serviceWorkers()) {
    if (
      worker.url().startsWith("chrome-extension://") &&
      worker.url().endsWith("/src/background.js")
    ) {
      return worker;
    }
  }
  const worker = await context.waitForEvent("serviceworker", { timeout: 10_000 });
  assert(
    worker.url().startsWith("chrome-extension://") && worker.url().endsWith("/src/background.js"),
    `Unexpected service worker URL: ${worker.url()}`,
  );
  return worker;
}

async function runtimeSend(page, extensionId, message) {
  return await page.evaluate(
    async ({
      extensionId: evaluatedExtensionId,
      message: evaluatedMessage,
      target: evaluatedTarget,
    }) => {
      const chromeRuntime = globalThis.chrome?.runtime;
      if (!chromeRuntime) throw new Error("chrome.runtime is unavailable");
      return chromeRuntime.sendMessage(evaluatedExtensionId, {
        target: evaluatedTarget,
        ...evaluatedMessage,
      });
    },
    { extensionId, message, target },
  );
}

async function maybeConfigureLlm(sidepanelPage, extensionId, options) {
  const llmConfig = resolveLlmConfig(options);
  if (!llmConfig.configured) return llmConfig.report;
  const response = await runtimeSend(sidepanelPage, extensionId, {
    kind: "config.update",
    patch: {
      model: {
        api: "responses",
        apiKey: llmConfig.apiKey,
        baseUrl: llmConfig.baseUrl,
        model: llmConfig.model,
        provider: "openai",
      },
    },
  });
  assert(response.ok, `config.update failed: ${JSON.stringify(response)}`);
  return llmConfig.report;
}

function chatDone(bootstrap) {
  const messages = Array.isArray(bootstrap?.messages) ? bootstrap.messages : [];
  return (
    bootstrap?.runState?.status === "idle" &&
    messages.some((message) => message.role === "assistant")
  );
}

function latestAssistantText(bootstrap) {
  const messages = Array.isArray(bootstrap?.messages) ? bootstrap.messages : [];
  const assistant = [...messages].reverse().find((message) => message.role === "assistant");
  return typeof assistant?.text === "string" ? assistant.text : "";
}

function networkSummary(events) {
  const failed = events.filter((event) => event.type === "requestfailed");
  const responses = events.filter((event) => event.type === "response");
  const statusCounts = {};
  for (const event of responses) {
    if (typeof event.status === "number")
      statusCounts[event.status] = (statusCounts[event.status] ?? 0) + 1;
  }
  return {
    failedCount: failed.length,
    firstFailures: failed.slice(0, 10),
    requestCount: events.filter((event) => event.type === "request").length,
    responseCount: responses.length,
    statusCounts,
  };
}

async function captureDebugBundleArtifact(sidepanelPage, extensionId, artifactDir) {
  const diagnostics = await runtimeSend(sidepanelPage, extensionId, {
    kind: "runtime.capture_diagnostics",
  });
  const debugBundle = diagnostics.ok
    ? (diagnostics.data?.debug?.bundle ?? diagnostics.data?.debug ?? diagnostics.data)
    : diagnostics;
  const debugBundlePath = resolve(artifactDir, "debug-bundle.json");
  writeFileSync(debugBundlePath, JSON.stringify(debugBundle, null, 2));
  return { debugBundle, debugBundlePath };
}

function compactString(value, maxChars) {
  const text = String(value ?? "");
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function compactAttributes(attributes = {}) {
  const result = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (compactAttributeNames.has(key)) {
      result[key] = compactString(value, queryLlmResultLimits.elementTextChars);
    }
  }
  return result;
}

function compactElementForLlm(element) {
  return {
    ariaLabel: compactString(element.ariaLabel, queryLlmResultLimits.elementTextChars) || null,
    attributes: compactAttributes(element.attributes),
    box: element.box,
    localIndex: element.localIndex,
    role: element.role ?? null,
    tagName: element.tagName,
    testId: element.testId ?? null,
    textContent: compactString(element.textContent, queryLlmResultLimits.elementTextChars),
  };
}

function compactQuerySnapshotForLlm(snapshot) {
  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : [];
  const interactiveElements = Array.isArray(snapshot.interactiveElements)
    ? snapshot.interactiveElements
    : [];
  const bodyText = String(snapshot.bodyText ?? "");
  const includeInteractiveFallback = elements.length === 0;
  const compactInteractiveElements = includeInteractiveFallback
    ? interactiveElements
        .slice(0, queryLlmResultLimits.fallbackInteractiveElements)
        .map(compactElementForLlm)
    : [];
  return {
    bodyText: compactString(bodyText, queryLlmResultLimits.bodyTextChars),
    count: snapshot.count,
    elements: elements.slice(0, queryLlmResultLimits.elements).map(compactElementForLlm),
    interactiveElements: compactInteractiveElements,
    limits: queryLlmResultLimits,
    title: snapshot.title,
    truncated: {
      bodyText: bodyText.length > queryLlmResultLimits.bodyTextChars,
      elements: elements.length > queryLlmResultLimits.elements,
      interactiveElements:
        !includeInteractiveFallback ||
        interactiveElements.length > queryLlmResultLimits.fallbackInteractiveElements,
    },
    url: snapshot.url,
  };
}

async function inspectPageInfo(tab, input) {
  const maxElements = Math.max(1, Math.min(Number(input.maxElements ?? 30), 50));
  const maxTextChars = Math.max(200, Math.min(Number(input.maxTextChars ?? 1200), 1800));
  const snapshot = await tab.playwright.evaluate(
    ({ maxElements: pageMaxElements, maxTextChars: pageMaxTextChars }) => {
      function compactText(value, maxChars) {
        const text = String(value || "")
          .replace(/\s+/g, " ")
          .trim();
        return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
      }
      function boxFor(element) {
        const rect = element.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          centerX: Math.round(rect.x + rect.width / 2),
          centerY: Math.round(rect.y + rect.height / 2),
        };
      }
      function isVisibleBoxInViewport(box) {
        if (!box || box.width <= 0 || box.height <= 0) return false;
        return (
          box.x < Number(innerWidth || 0) &&
          box.x + box.width > 0 &&
          box.y < Number(innerHeight || 0) &&
          box.y + box.height > 0
        );
      }
      function collectInteractiveElements(root, selector, seen) {
        if (!root || typeof root.querySelectorAll !== "function") return [];
        const collected = [];
        for (const element of Array.from(root.querySelectorAll(selector))) {
          if (!seen.has(element)) {
            seen.add(element);
            collected.push(element);
          }
        }
        for (const element of Array.from(root.querySelectorAll("*"))) {
          if (element.shadowRoot) {
            collected.push(...collectInteractiveElements(element.shadowRoot, selector, seen));
          }
        }
        return collected;
      }
      function serialize(element, index) {
        const attrs = {};
        for (const name of [
          "aria-label",
          "data-testid",
          "href",
          "name",
          "placeholder",
          "role",
          "title",
          "type",
          "value",
        ]) {
          const value = element.getAttribute(name);
          if (value) attrs[name] = value.slice(0, 160);
        }
        return {
          localIndex: index,
          tagName: (element.tagName || "UNKNOWN").toLowerCase(),
          textContent: compactText(element.textContent, 160),
          ariaLabel: element.getAttribute("aria-label"),
          role: element.getAttribute("role"),
          testId: element.getAttribute("data-testid"),
          attributes: attrs,
          box: boxFor(element),
        };
      }

      const interactiveSelector =
        'button,[role="button"],a,input,textarea,select,[contenteditable="true"],[tabindex]:not([tabindex="-1"]),[aria-label]';
      const interactive = collectInteractiveElements(document, interactiveSelector, new Set())
        .map((element) => ({ element, box: boxFor(element) }))
        .filter(({ box }) => isVisibleBoxInViewport(box))
        .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
        .map(({ element }) => element)
        .slice(0, pageMaxElements);
      const doc = document.documentElement;
      return {
        action: "info",
        ok: true,
        title: document.title,
        url: location.href,
        visibleText: compactText(document.body?.innerText, pageMaxTextChars),
        viewport: {
          width: Number(innerWidth || 0),
          height: Number(innerHeight || 0),
          scrollX: Number(scrollX || 0),
          scrollY: Number(scrollY || 0),
          documentWidth: Number(doc?.scrollWidth || document.body?.scrollWidth || 0),
          documentHeight: Number(doc?.scrollHeight || document.body?.scrollHeight || 0),
        },
        interactiveElements: interactive.map(serialize),
        interactiveCount: interactive.length,
        limits: {
          maxElements: pageMaxElements,
          maxTextChars: pageMaxTextChars,
        },
      };
    },
    { maxElements, maxTextChars },
  );

  snapshot.interactiveElements = snapshot.interactiveElements ?? [];
  return snapshot;
}

async function inspectPage(tab, selector, elementStore) {
  const snapshot = await tab.playwright.evaluate(
    ({ selector: pageSelector }) => {
      function boxFor(element) {
        const rect = element.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          centerX: Math.round(rect.x + rect.width / 2),
          centerY: Math.round(rect.y + rect.height / 2),
        };
      }
      function serialize(element, index) {
        const attrs = {};
        for (const attr of Array.from(element.attributes ?? [])) attrs[attr.name] = attr.value;
        const box = boxFor(element);
        return {
          localIndex: index,
          tagName: (element.tagName || "UNKNOWN").toLowerCase(),
          textContent: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 500),
          ariaLabel: element.getAttribute("aria-label"),
          role: element.getAttribute("role"),
          testId: element.getAttribute("data-testid"),
          attributes: attrs,
          box,
        };
      }

      const selected = Array.from(document.querySelectorAll(pageSelector)).slice(0, 30);
      const interactive = Array.from(
        document.querySelectorAll(
          'button,[role="button"],a,input,textarea,[contenteditable="true"]',
        ),
      )
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .slice(0, 80);
      return {
        bodyText: (document.body?.innerText || "").slice(0, 5000),
        count: selected.length,
        elements: selected.map(serialize),
        interactiveElements: interactive.map(serialize),
        title: document.title,
        url: location.href,
      };
    },
    { selector },
  );

  for (const listName of ["elements", "interactiveElements"]) {
    snapshot[listName] = (snapshot[listName] ?? []).map((element) => {
      const uid = `ext-${elementStore.nextId++}`;
      elementStore.items.set(uid, element);
      return { uid, ...element };
    });
  }
  return snapshot;
}

async function serviceExternalPageRequest({ artifactDir, elementStore, request, tab }) {
  const action = request.action;
  const input = request.input ?? {};
  const startedAt = new Date().toISOString();

  if (request.family === "tabs" && action === "navigate") {
    await tab.goto(input.url);
    await tab.playwright.waitForTimeout(1500);
    return {
      data: {
        tab: {
          active: true,
          externalTabId: request.tab?.externalTabId,
          tabId: request.tab?.tabId ?? 900001,
          title: await tab.title(),
          url: await tab.url(),
        },
      },
      log: { action, family: request.family, input, startedAt, status: "ok" },
    };
  }

  if (request.family !== "page") {
    throw new Error(`Unsupported external request family: ${request.family}`);
  }

  if (action === "screenshot") {
    const bytes = await tab.screenshot({ fullPage: false });
    const fileName = `external-page-${request.id}-screenshot.png`;
    const path = resolve(artifactDir, fileName);
    writeFileSync(path, Buffer.from(bytes));
    return {
      data: {
        result: {
          action,
          artifactStored: true,
          format: "png",
          ok: true,
        },
        verified: true,
        debugEvidence: { artifactPath: path, visibility: "debug_only" },
        trace: [`external-page:${action}`],
      },
      log: { action, family: request.family, input, screenshot: path, startedAt, status: "ok" },
    };
  }

  if (action === "info") {
    const snapshot = await inspectPageInfo(tab, input);
    const path = resolve(artifactDir, `external-page-${request.id}-info.json`);
    writeFileSync(path, JSON.stringify(snapshot, null, 2));
    return {
      data: {
        result: snapshot,
        verified: true,
        debugEvidence: {
          artifactPath: path,
          note: "Full page info snapshot is artifact-only; LLM result is bounded.",
          visibility: "debug_only",
        },
        trace: [`external-page:${action}`],
      },
      log: { action, family: request.family, input, info: path, startedAt, status: "ok" },
    };
  }

  if (action === "query") {
    const selector = typeof input.selector === "string" && input.selector ? input.selector : "body";
    const snapshot = await inspectPage(tab, selector, elementStore);
    const path = resolve(artifactDir, `external-page-${request.id}-query.json`);
    writeFileSync(path, JSON.stringify(snapshot, null, 2));
    const compactSnapshot = compactQuerySnapshotForLlm(snapshot);
    return {
      data: {
        result: {
          action,
          selector,
          ...compactSnapshot,
        },
        verified: true,
        debugEvidence: {
          artifactPath: path,
          note: "Full query snapshot is artifact-only; LLM result is compacted.",
          visibility: "debug_only",
        },
        trace: [`external-page:${action}`],
      },
      log: { action, family: request.family, input, query: path, startedAt, status: "ok" },
    };
  }

  if (action === "click_xy") {
    await tab.cua.click({ x: Number(input.x), y: Number(input.y) });
    await tab.playwright.waitForTimeout(800);
    return {
      data: {
        result: {
          action,
          ok: true,
          x: Number(input.x),
          y: Number(input.y),
        },
        verified: true,
        trace: [`external-page:${action}`],
      },
      log: { action, family: request.family, input, startedAt, status: "ok" },
    };
  }

  if (action === "type_text") {
    await tab.cua.type({ text: String(input.text ?? "") });
    await tab.playwright.waitForTimeout(800);
    return {
      data: {
        result: { action, ok: true, text: String(input.text ?? "") },
        verified: true,
        trace: [`external-page:${action}`],
      },
      log: { action, family: request.family, input, startedAt, status: "ok" },
    };
  }

  if (action === "press_key") {
    await tab.cua.keypress({ keys: [String(input.key ?? "")] });
    await tab.playwright.waitForTimeout(800);
    return {
      data: {
        result: { action, key: String(input.key ?? ""), ok: true },
        verified: true,
        trace: [`external-page:${action}`],
      },
      log: { action, family: request.family, input, startedAt, status: "ok" },
    };
  }

  if (action === "scroll") {
    await tab.cua.scroll({
      scrollX: Number(input.deltaX ?? 0),
      scrollY: Number(input.deltaY ?? 0),
      x: 700,
      y: 450,
    });
    await tab.playwright.waitForTimeout(800);
    return {
      data: {
        result: {
          action,
          deltaX: Number(input.deltaX ?? 0),
          deltaY: Number(input.deltaY ?? 0),
          ok: true,
        },
        verified: true,
        trace: [`external-page:${action}`],
      },
      log: { action, family: request.family, input, startedAt, status: "ok" },
    };
  }

  throw new Error(`Unsupported external page action: ${action}`);
}

function externalActionKey(request) {
  return `${request.family}.${request.action}`;
}

function assertExternalActionAllowed(request, allowedExternalActions) {
  if (!allowedExternalActions) return;
  const actionKey = externalActionKey(request);
  if (allowedExternalActions.has(actionKey)) return;
  throw new Error(`Blocked external page action by dogfood safety policy: ${actionKey}`);
}

function normalizeAllowedExternalActions(value) {
  if (value == null) return new Set(defaultAllowedExternalActions);
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value);
  throw new Error("allowedExternalActions must be an array or Set when provided");
}

async function setupUserChrome(pluginRoot) {
  if (!globalThis.nodeRepl) {
    throw new Error(
      "This harness must run inside Codex node_repl; ordinary node/bun cannot access the existing Chrome profile.",
    );
  }
  if (!globalThis.agent) {
    const { setupBrowserRuntime } = await import(`${pluginRoot}/scripts/browser-client.mjs`);
    await setupBrowserRuntime({ globals: globalThis });
  }
  if (!globalThis.browser) {
    globalThis.browser = await agent.browsers.get("extension");
  }
  await browser.nameSession("🔎 BBL dogfood existing Chrome");
  return browser;
}

function findTargetTab(tabs, { tabTitleMatch, tabUrlMatch }) {
  return tabs.find((tab) => {
    const title = tab.title ?? "";
    const url = tab.url ?? "";
    return (
      (tabUrlMatch && url.includes(tabUrlMatch)) || (tabTitleMatch && title.includes(tabTitleMatch))
    );
  });
}

function productSidepanelUrlFromOptions({ productExtensionId, productSidepanelUrl }) {
  if (productSidepanelUrl) return productSidepanelUrl;
  if (productExtensionId) return `chrome-extension://${productExtensionId}/src/sidepanel.html`;
  return null;
}

function findProductSidepanelTab(
  tabs,
  { productExtensionId, productSidepanelUrl, productSidepanelUrlMatch },
) {
  const sidepanelUrl =
    productSidepanelUrlMatch ??
    productSidepanelUrl ??
    (productExtensionId ? `chrome-extension://${productExtensionId}/src/sidepanel.html` : null);
  if (sidepanelUrl) {
    return tabs.find((tab) => String(tab.url ?? "").includes(sidepanelUrl));
  }
  return tabs.find((tab) => {
    const title = String(tab.title ?? "");
    const url = String(tab.url ?? "");
    return (
      /^chrome-extension:\/\/[^/]+\/src\/sidepanel\.html/u.test(url) && /白雪|Snowy/u.test(title)
    );
  });
}

async function openProductSidepanelTab(userBrowser, { productExtensionId, productSidepanelUrl }) {
  const sidepanelUrl = productSidepanelUrlFromOptions({ productExtensionId, productSidepanelUrl });
  if (!sidepanelUrl) return null;
  if (!/^chrome-extension:\/\/[^/]+\/src\/sidepanel\.html$/u.test(sidepanelUrl)) {
    throw new Error(
      `productSidepanelUrl must be a chrome-extension://*/src/sidepanel.html URL: ${sidepanelUrl}`,
    );
  }
  const tab = await userBrowser.tabs.new();
  await tab.goto(sidepanelUrl);
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15_000 });
  return tab;
}

function writeBlockedArtifact(artifactDir, blocker) {
  const blockerPath = resolve(artifactDir, "blocked.json");
  writeFileSync(blockerPath, `${JSON.stringify(blocker, null, 2)}\n`, "utf8");
  const reportPath = resolve(artifactDir, "report.md");
  writeFileSync(
    reportPath,
    [
      "# Existing Chrome MV3 Dogfood Blocked",
      "",
      `- Classification: ${blocker.classification}`,
      `- Blocked at: ${blocker.blockedAt}`,
      `- First real blocker: ${blocker.firstBlocker}`,
      `- Required product path: ${blocker.requiredProductPath}`,
      `- Diagnostic note: ${blocker.diagnosticNote}`,
      "",
      "## Evidence",
      "",
      "```json",
      JSON.stringify(blocker.evidence ?? {}, null, 2),
      "```",
    ].join("\n"),
    "utf8",
  );
  return { blockerPath, reportPath };
}

function buildProductEntryProof({
  extensionId,
  mode,
  openedProductSidepanelTab,
  preparedExtensionDir,
  productSidepanelTabInfo,
  userDataDir,
}) {
  const diagnosticTempProductProfile = mode === "diagnostic-temp-product-profile";
  return {
    classification: diagnosticTempProductProfile ? "diagnostic-control" : "product-path",
    diagnosticTempProductProfile,
    extensionId,
    mode,
    openedProductSidepanelTab,
    productPathAcceptedForLoggedInDogfood: !diagnosticTempProductProfile,
    productSidepanelTab: productSidepanelTabInfo
      ? {
          externalTabId: productSidepanelTabInfo.id,
          title: productSidepanelTabInfo.title ?? null,
          url: productSidepanelTabInfo.url ?? null,
        }
      : null,
    preparedExtensionDir: preparedExtensionDir ?? null,
    userDataDir: userDataDir ?? null,
  };
}

export async function runExistingChromeDogfood(options = {}) {
  const artifactDir =
    options.artifactDir ??
    resolve(repoRoot, ".ml-cache/dogfood", `existing-chrome-mv3-${timestampForPath()}`);
  mkdirSync(artifactDir, { recursive: true });

  const diagnosticTempProductProfile = options.diagnosticTempProductProfile === true;
  const allowedExternalActions = normalizeAllowedExternalActions(options.allowedExternalActions);
  const userBrowser = await setupUserChrome(options.pluginRoot ?? defaultPluginRoot);
  const openTabs = await userBrowser.user.openTabs();
  const targetTabInfo = findTargetTab(openTabs, {
    tabTitleMatch: options.tabTitleMatch,
    tabUrlMatch: options.tabUrlMatch ?? "https://x.com/i/bookmarks",
  });
  let openedProductSidepanelTab = null;
  let productSidepanelTabInfo = findProductSidepanelTab(openTabs, {
    productExtensionId: options.productExtensionId,
    productSidepanelUrl: options.productSidepanelUrl,
    productSidepanelUrlMatch: options.productSidepanelUrlMatch,
  });
  assert(
    targetTabInfo,
    `No matching existing Chrome tab. Open the logged-in task page first; saw ${openTabs.length} tabs.`,
  );

  if (!diagnosticTempProductProfile && !productSidepanelTabInfo) {
    openedProductSidepanelTab = await openProductSidepanelTab(userBrowser, {
      productExtensionId: options.productExtensionId,
      productSidepanelUrl: options.productSidepanelUrl,
    });
    if (openedProductSidepanelTab) {
      productSidepanelTabInfo = {
        id: openedProductSidepanelTab.id,
        title: await openedProductSidepanelTab.title(),
        url: await openedProductSidepanelTab.url(),
      };
    }
  }

  if (!diagnosticTempProductProfile && !productSidepanelTabInfo) {
    const { blockerPath, reportPath } = writeBlockedArtifact(artifactDir, {
      blockedAt: new Date().toISOString(),
      classification: "blocked",
      diagnosticNote:
        "The runner refused to start a temporary Chrome for Testing product profile. X logged-in dogfood must use the product MV3 sidepanel/runtime installed in the user's existing Chrome profile.",
      evidence: {
        matchingTaskTab: {
          id: targetTabInfo.id,
          title: targetTabInfo.title ?? null,
          url: targetTabInfo.url ?? null,
        },
        openTabCount: openTabs.length,
        productExtensionId: options.productExtensionId ?? null,
        productSidepanelUrl: options.productSidepanelUrl ?? null,
        productSidepanelUrlMatch: options.productSidepanelUrlMatch ?? null,
      },
      firstBlocker: "product_sidepanel_tab_missing_in_existing_chrome_profile",
      requiredProductPath:
        "Open the repo MV3 product sidepanel in the same logged-in Chrome profile, or pass productExtensionId/productSidepanelUrl so the runner opens chrome-extension://*/src/sidepanel.html in that same profile.",
    });
    return {
      artifactDir,
      blocked: true,
      blocker: "product_sidepanel_tab_missing_in_existing_chrome_profile",
      blockerPath,
      reportPath,
    };
  }

  const taskTab = await userBrowser.user.claimTab(targetTabInfo);
  const taskTabProof = {
    mode: "attached-user-chrome-tab",
    matchedAt: new Date().toISOString(),
    match: {
      titleIncludes: options.tabTitleMatch ?? null,
      urlIncludes: options.tabUrlMatch ?? "https://x.com/i/bookmarks",
    },
    tab: {
      externalTabId: targetTabInfo.id,
      title: await taskTab.title(),
      url: await taskTab.url(),
    },
  };

  const extensionDir = resolve(repoRoot, expandPath(options.extensionDir ?? defaultExtensionDir));
  let context = null;
  let extensionId = options.productExtensionId ?? null;
  let preparedExtensionDir = null;
  let sidepanelPage = null;
  let productEntryProof = null;
  let userDataDir = null;

  if (diagnosticTempProductProfile) {
    requireBuiltExtension(extensionDir);
    preparedExtensionDir = prepareExtensionDir(extensionDir, artifactDir);
    userDataDir =
      options.userDataDir ?? resolve(tmpdir(), `bbl-existing-chrome-product-${Date.now()}`);
    context = await chromium.launchPersistentContext(userDataDir, {
      args: [
        `--disable-extensions-except=${preparedExtensionDir}`,
        `--load-extension=${preparedExtensionDir}`,
        "--no-default-browser-check",
        "--no-first-run",
      ],
      headless: false,
      viewport: { width: 1360, height: 920 },
    });
    const worker = await waitForExtensionWorker(context);
    extensionId = new URL(worker.url()).host;
    sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/src/sidepanel.html`);
  } else {
    const sidepanelTab =
      openedProductSidepanelTab ?? (await userBrowser.user.claimTab(productSidepanelTabInfo));
    sidepanelPage = sidepanelTab.playwright;
    if (!extensionId) {
      extensionId = new URL(await sidepanelTab.url()).host;
    }
  }

  const networkContext =
    context ??
    (typeof taskTab.playwright?.context === "function" ? taskTab.playwright.context() : null);
  const networkEvents = networkContext ? recordNetworkEvents(networkContext) : [];
  const externalRequestLogs = [];
  const elementStore = { items: new Map(), nextId: 1 };

  try {
    await sidepanelPage.waitForFunction(() => Boolean(globalThis.chrome?.runtime));
    productEntryProof = buildProductEntryProof({
      extensionId,
      mode: diagnosticTempProductProfile
        ? "diagnostic-temp-product-profile"
        : "attached-product-extension",
      openedProductSidepanelTab: Boolean(openedProductSidepanelTab),
      preparedExtensionDir,
      productSidepanelTabInfo,
      userDataDir,
    });
    writeFileSync(
      resolve(artifactDir, "product-entry-proof.json"),
      `${JSON.stringify(productEntryProof, null, 2)}\n`,
      "utf8",
    );

    const llmConfig = await maybeConfigureLlm(sidepanelPage, extensionId, options);
    await runtimeSend(sidepanelPage, extensionId, { kind: "runtime.chat.session.create" });
    const configureResponse = await runtimeSend(sidepanelPage, extensionId, {
      kind: "dogfood.externalPage.configure",
      enabled: true,
      tab: {
        id: taskTabProof.tab.externalTabId,
        title: taskTabProof.tab.title,
        url: taskTabProof.tab.url,
      },
      timeoutMs: options.externalPageTimeoutMs ?? 120_000,
    });
    assert(
      configureResponse.ok,
      `externalPage.configure failed: ${JSON.stringify(configureResponse)}`,
    );

    const beforeBytes = await taskTab.screenshot({ fullPage: false });
    const beforePath = resolve(artifactDir, "task-page-before.png");
    writeFileSync(beforePath, Buffer.from(beforeBytes));
    taskTabProof.evidence = { beforeScreenshot: beforePath };
    writeFileSync(
      resolve(artifactDir, "task-tab-proof.json"),
      JSON.stringify(taskTabProof, null, 2),
    );

    const prompt = options.prompt ?? defaultPrompt;
    const accepted = await runtimeSend(sidepanelPage, extensionId, {
      kind: "runtime.chat.send",
      text: prompt,
      context: {
        tabs: [
          {
            id: 900001,
            title: taskTabProof.tab.title,
            url: taskTabProof.tab.url,
          },
        ],
      },
    });
    assert(accepted.ok, `runtime.chat.send failed: ${JSON.stringify(accepted)}`);

    const timeoutMs = options.timeoutMs ?? 180_000;
    const startedAt = Date.now();
    let bootstrap = null;
    while (Date.now() - startedAt < timeoutMs) {
      const pending = await runtimeSend(sidepanelPage, extensionId, {
        kind: "dogfood.externalPage.take",
      });
      const request = pending.ok ? pending.data?.request : null;
      if (request) {
        try {
          assertExternalActionAllowed(request, allowedExternalActions);
          const serviced = await serviceExternalPageRequest({
            artifactDir,
            elementStore,
            request,
            tab: taskTab,
          });
          externalRequestLogs.push({ id: request.id, ...serviced.log });
          const resolved = await runtimeSend(sidepanelPage, extensionId, {
            kind: "dogfood.externalPage.resolve",
            requestId: request.id,
            data: serviced.data,
            ok: true,
          });
          assert(resolved.ok, `externalPage.resolve failed: ${JSON.stringify(resolved)}`);
        } catch (error) {
          externalRequestLogs.push({
            id: request.id,
            action: request.action,
            error: error instanceof Error ? error.message : String(error),
            family: request.family,
            status: "failed",
          });
          await runtimeSend(sidepanelPage, extensionId, {
            kind: "dogfood.externalPage.resolve",
            requestId: request.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const bootstrapResponse = await runtimeSend(sidepanelPage, extensionId, {
        kind: "runtime.chat.bootstrap",
      });
      if (bootstrapResponse.ok) {
        bootstrap = bootstrapResponse.data;
        if (chatDone(bootstrap)) break;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, request ? 100 : 500));
    }

    const finalBootstrapResponse = await runtimeSend(sidepanelPage, extensionId, {
      kind: "runtime.chat.bootstrap",
    });
    if (finalBootstrapResponse.ok) bootstrap = finalBootstrapResponse.data;

    const afterBytes = await taskTab.screenshot({ fullPage: false });
    const afterPath = resolve(artifactDir, "task-page-after.png");
    writeFileSync(afterPath, Buffer.from(afterBytes));
    const sidepanelPath = resolve(artifactDir, "sidepanel.png");
    await sidepanelPage.screenshot({ fullPage: true, path: sidepanelPath });

    const timeline = await runtimeSend(sidepanelPage, extensionId, {
      kind: "resource.read",
      limit: 200,
      resourceId: "observability.timeline",
    });
    const rawTail = await runtimeSend(sidepanelPage, extensionId, {
      kind: "resource.read",
      limit: 200,
      resourceId: "observability.rawEventTail",
    });
    const { debugBundle, debugBundlePath } = await captureDebugBundleArtifact(
      sidepanelPage,
      extensionId,
      artifactDir,
    );
    writeFileSync(resolve(artifactDir, "chat-bootstrap.json"), JSON.stringify(bootstrap, null, 2));
    writeFileSync(
      resolve(artifactDir, "external-page-requests.json"),
      JSON.stringify(externalRequestLogs, null, 2),
    );
    writeFileSync(
      resolve(artifactDir, "network-events.json"),
      JSON.stringify(networkEvents, null, 2),
    );
    writeFileSync(
      resolve(artifactDir, "observability-timeline.json"),
      JSON.stringify(timeline.ok ? timeline.data?.data : timeline, null, 2),
    );
    writeFileSync(
      resolve(artifactDir, "raw-event-tail.json"),
      JSON.stringify(rawTail.ok ? rawTail.data?.data : rawTail, null, 2),
    );

    const reportPath = resolve(artifactDir, "report.md");
    const summary = networkSummary(networkEvents);
    writeFileSync(
      reportPath,
      [
        "# Existing Chrome MV3 Dogfood Evidence",
        "",
        productEntryProof.productPathAcceptedForLoggedInDogfood
          ? "This run uses the product MV3/chat/kernel path from the user's existing Chrome profile while page actions are serviced by an explicit external-page dogfood bridge against the user's already-open Chrome tab."
          : "This run uses a temporary Chrome for Testing product profile and is diagnostic/control evidence only; it must not be counted as the X logged-in product-path dogfood pass.",
        "",
        `- Classification: ${productEntryProof.classification}`,
        `- Product entry mode: ${productEntryProof.mode}`,
        `- Accepted for logged-in dogfood: ${productEntryProof.productPathAcceptedForLoggedInDogfood}`,
        `- Prompt: ${prompt}`,
        `- Matched tab: ${taskTabProof.tab.title} (${taskTabProof.tab.url})`,
        `- Extension ID: ${extensionId}`,
        `- Extension dir: ${preparedExtensionDir ?? "(existing Chrome profile)"}`,
        `- LLM config: ${JSON.stringify(llmConfig)}`,
        `- Latest assistant text: ${latestAssistantText(bootstrap) || "(empty)"}`,
        `- External page requests: ${externalRequestLogs.length}`,
        `- Task before screenshot: ${beforePath}`,
        `- Task after screenshot: ${afterPath}`,
        `- Sidepanel screenshot: ${sidepanelPath}`,
        `- Debug bundle: ${debugBundlePath}`,
        `- Debug bundle lanes: ${JSON.stringify(debugBundle?.laneMap ?? [])}`,
        `- Product network requests: ${summary.requestCount}`,
        `- Product network responses: ${summary.responseCount}`,
        `- Product network failures: ${summary.failedCount}`,
        "",
        "## External Page Requests",
        "",
        "```json",
        JSON.stringify(externalRequestLogs, null, 2),
        "```",
      ].join("\n"),
      "utf8",
    );

    await runtimeSend(sidepanelPage, extensionId, {
      enabled: false,
      kind: "dogfood.externalPage.configure",
    }).catch(() => undefined);

    if (!options.keepProductOpen) {
      await context?.close();
    }
    const keepTabs = [{ status: "handoff", tab: taskTab }];
    if (options.keepProductOpen && openedProductSidepanelTab) {
      keepTabs.push({ status: "handoff", tab: openedProductSidepanelTab });
    }
    await userBrowser.tabs.finalize({ keep: keepTabs }).catch(() => undefined);

    return {
      artifactDir,
      reportPath,
      summary: {
        assistantText: latestAssistantText(bootstrap),
        externalPageRequests: externalRequestLogs.length,
        network: summary,
        taskTab: taskTabProof.tab,
      },
    };
  } finally {
    if (!options.keepProductOpen) {
      await context?.close().catch(() => undefined);
      if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
    }
  }
}
