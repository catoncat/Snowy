#!/usr/bin/env bun

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type BrowserContext, type Page, type Request, chromium } from "playwright";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultExtensionDir = resolve(repoRoot, "apps/mv3-shell/dist");
const defaultPrompt = "搜索我的推特收藏的书签，搜索 agent，然后给第一条点一个like";
const defaultUrl = "https://x.com/i/bookmarks";
const target = "bbl-next.runner.background";

type RuntimeResponse =
  | { ok: true; data: any }
  | { ok: false; error?: { code?: string; message?: string; details?: unknown } };

type ChromeRuntimeGlobal = typeof globalThis & {
  chrome?: {
    runtime?: {
      sendMessage: (
        extensionId: string,
        message: Record<string, unknown>,
      ) => Promise<RuntimeResponse>;
    };
    tabs?: {
      query: (queryInfo: Record<string, unknown>) => Promise<Array<{ id?: number; url?: string }>>;
      update: (tabId: number, updateProperties: Record<string, unknown>) => Promise<unknown>;
    };
  };
};

type NetworkEvent = {
  errorText?: string;
  frameUrl?: string;
  method: string;
  postData?: string;
  redirectedFrom?: string;
  resourceType: string;
  responseContentType?: string;
  status?: number;
  statusText?: string;
  timestamp: string;
  type: "request" | "response" | "requestfailed";
  url: string;
};

type CliOptions = {
  artifactDir?: string;
  capturePostData: boolean;
  codexConfig: string;
  codexProvider?: string;
  debugHostPermissions: boolean;
  extensionDir: string;
  headless: boolean;
  keepOpen: boolean;
  keepProfile: boolean;
  llmApiKey?: string;
  llmBaseUrl?: string;
  llmModel?: string;
  prepareLogin: boolean;
  profileName?: string;
  prompt: string;
  timeoutMs: number;
  url: string;
  userDataDir?: string;
};

type ResolvedLlmConfig =
  | {
      api: "responses";
      apiKey: string;
      baseUrl: string;
      configured: true;
      model: string;
      provider: "openai";
      report: Record<string, unknown>;
    }
  | {
      configured: false;
      report: Record<string, unknown>;
    };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function readArgValue(argv: string[], name: string): string | undefined {
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function parseOptions(argv: string[]): CliOptions {
  const timeout = Number(readArgValue(argv, "--timeout-ms") ?? "120000");
  const prepareLogin = argv.includes("--prepare-login") || argv.includes("--login-only");
  return {
    artifactDir: readArgValue(argv, "--artifact-dir"),
    capturePostData: argv.includes("--capture-post-data"),
    codexConfig: expandPath(
      readArgValue(argv, "--codex-config") ??
        process.env.BBL_DOGFOOD_CODEX_CONFIG ??
        "~/.codex/config.toml",
    ),
    codexProvider:
      readArgValue(argv, "--codex-provider") ?? process.env.BBL_DOGFOOD_CODEX_PROVIDER ?? "rs",
    debugHostPermissions: !argv.includes("--no-debug-host-permissions"),
    extensionDir: resolve(
      repoRoot,
      expandPath(readArgValue(argv, "--extension-dir") ?? defaultExtensionDir),
    ),
    headless: argv.includes("--headless"),
    keepOpen: argv.includes("--keep-open") || prepareLogin,
    keepProfile: argv.includes("--keep-profile"),
    llmApiKey: readArgValue(argv, "--llm-api-key") ?? process.env.BBL_DOGFOOD_LLM_API_KEY,
    llmBaseUrl: readArgValue(argv, "--llm-base-url") ?? process.env.BBL_DOGFOOD_LLM_BASE_URL,
    llmModel: readArgValue(argv, "--llm-model") ?? process.env.BBL_DOGFOOD_LLM_MODEL,
    prepareLogin,
    profileName: readArgValue(argv, "--profile-name"),
    prompt: readArgValue(argv, "--prompt") ?? defaultPrompt,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 120_000,
    url: readArgValue(argv, "--url") ?? defaultUrl,
    userDataDir: readArgValue(argv, "--user-data-dir")
      ? expandPath(readArgValue(argv, "--user-data-dir")!)
      : undefined,
  };
}

function expandPath(path: string): string {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2));
  }
  return path;
}

function safeProfileName(name: string): string {
  assert(
    /^[a-zA-Z0-9._-]+$/.test(name),
    "--profile-name may only contain letters, numbers, dot, underscore, or dash",
  );
  return name;
}

function stripTomlComment(line: string): string {
  let quote: "'" | '"' | undefined;
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
    if (char === "#" && !quote) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseTomlScalar(rawValue: string): string | number | boolean {
  const value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const unquoted = value.slice(1, -1);
    return value.startsWith('"') ? unquoted.replace(/\\"/g, '"').replace(/\\\\/g, "\\") : unquoted;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function parseCodexConfig(configPath: string) {
  const root: Record<string, string | number | boolean> = {};
  const providers: Record<string, Record<string, string | number | boolean>> = {};
  let section: string[] = [];
  const text = readFileSync(configPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) {
      continue;
    }
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].split(".");
      continue;
    }
    const assignment = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!assignment) {
      continue;
    }
    const [, key, rawValue] = assignment;
    let target: Record<string, string | number | boolean> | undefined;
    if (section.length === 2 && section[0] === "model_providers") {
      const providerId = section[1];
      providers[providerId] ??= {};
      target = providers[providerId];
    } else if (section.length === 0) {
      target = root;
    }
    if (!target) {
      continue;
    }
    target[key] = parseTomlScalar(rawValue);
  }
  return { providers, root };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function bearerTokenValue(value: unknown): string | undefined {
  const token = stringValue(value)
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  return token || undefined;
}

function resolveLlmConfig(options: CliOptions): ResolvedLlmConfig {
  if (options.llmApiKey || options.llmBaseUrl) {
    assert(
      options.llmApiKey,
      "--llm-api-key or BBL_DOGFOOD_LLM_API_KEY is required with explicit LLM config",
    );
    const model = options.llmModel ?? "gpt-4o";
    const baseUrl = options.llmBaseUrl ?? "https://api.openai.com/v1";
    return {
      api: "responses",
      apiKey: bearerTokenValue(options.llmApiKey) ?? options.llmApiKey,
      baseUrl,
      configured: true,
      model,
      provider: "openai",
      report: {
        api: "responses",
        baseUrl,
        configured: true,
        model,
        provider: "openai",
        source: "cli_or_env",
      },
    };
  }

  if (!options.codexProvider) {
    return {
      configured: false,
      report: { configured: false, reason: "using_existing_extension_config" },
    };
  }

  if (!existsSync(options.codexConfig)) {
    return {
      configured: false,
      report: {
        configured: false,
        provider: options.codexProvider,
        reason: "codex_config_missing",
        source: "codex_config",
      },
    };
  }

  const codexConfig = parseCodexConfig(options.codexConfig);
  const provider = codexConfig.providers[options.codexProvider];
  if (!provider) {
    return {
      configured: false,
      report: {
        configured: false,
        provider: options.codexProvider,
        reason: "codex_provider_missing",
        source: "codex_config",
      },
    };
  }

  const token =
    bearerTokenValue(provider.experimental_bearer_token) ??
    bearerTokenValue(provider.api_key) ??
    bearerTokenValue(provider.bearer_token);
  if (!token) {
    return {
      configured: false,
      report: {
        configured: false,
        provider: options.codexProvider,
        reason: "codex_provider_token_missing",
        source: "codex_config",
      },
    };
  }

  const model =
    options.llmModel ??
    stringValue(provider.model) ??
    stringValue(codexConfig.root.model) ??
    "gpt-4o";
  const baseUrl =
    options.llmBaseUrl ?? stringValue(provider.base_url) ?? "https://api.openai.com/v1";
  const api = "responses" as const;
  return {
    api,
    apiKey: token,
    baseUrl,
    configured: true,
    model,
    provider: "openai",
    report: {
      api,
      baseUrl,
      codexProvider: options.codexProvider,
      configured: true,
      model,
      provider: "openai",
      source: "codex_config",
    },
  };
}

function requireBuiltExtension(extensionDir: string): void {
  const manifestPath = resolve(extensionDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Built extension is missing at ${manifestPath}. Run bun run build first.`);
  }
}

function timestampForPath(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function redactUrl(rawUrl: string): string {
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

function safeFrameUrl(request: Request): string | undefined {
  try {
    return redactUrl(request.frame().url());
  } catch {
    return undefined;
  }
}

function recordNetworkEvents(context: BrowserContext, { capturePostData }: CliOptions) {
  const events: NetworkEvent[] = [];
  const recordBase = (request: Request): Omit<NetworkEvent, "timestamp" | "type"> => {
    const postData = capturePostData ? request.postData() : undefined;
    return {
      frameUrl: safeFrameUrl(request),
      method: request.method(),
      redirectedFrom: request.redirectedFrom()
        ? redactUrl(request.redirectedFrom()!.url())
        : undefined,
      resourceType: request.resourceType(),
      url: redactUrl(request.url()),
      ...(postData ? { postData: postData.slice(0, 4000) } : {}),
    } as Omit<NetworkEvent, "timestamp" | "type">;
  };

  context.on("request", (request) => {
    events.push({
      ...recordBase(request),
      timestamp: new Date().toISOString(),
      type: "request",
    });
  });
  context.on("response", (response) => {
    const request = response.request();
    events.push({
      ...recordBase(request),
      responseContentType: response.headers()["content-type"],
      status: response.status(),
      statusText: response.statusText(),
      timestamp: new Date().toISOString(),
      type: "response",
    });
  });
  context.on("requestfailed", (request) => {
    events.push({
      ...recordBase(request),
      errorText: request.failure()?.errorText,
      timestamp: new Date().toISOString(),
      type: "requestfailed",
    });
  });
  return events;
}

async function waitForExtensionWorker(context: BrowserContext) {
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

async function runtimeSend(
  page: Page,
  extensionId: string,
  message: Record<string, unknown>,
): Promise<RuntimeResponse> {
  return await page.evaluate(
    async ({
      extensionId: evaluatedExtensionId,
      message: evaluatedMessage,
      target: evaluatedTarget,
    }) => {
      const chromeRuntime = (globalThis as ChromeRuntimeGlobal).chrome?.runtime;
      if (!chromeRuntime) {
        throw new Error("chrome.runtime is unavailable");
      }
      return chromeRuntime.sendMessage(evaluatedExtensionId, {
        target: evaluatedTarget,
        ...evaluatedMessage,
      });
    },
    { extensionId, message, target },
  );
}

async function activateTaskTab(sidepanelPage: Page, taskPage: Page): Promise<void> {
  await taskPage.bringToFront();
  await sidepanelPage.evaluate(async (targetUrl) => {
    const chromeApi = (globalThis as ChromeRuntimeGlobal).chrome;
    if (!chromeApi?.tabs?.query || !chromeApi.tabs.update) {
      throw new Error("chrome.tabs is unavailable");
    }
    const tabs = await chromeApi.tabs.query({});
    const matched = tabs.find((tab) => tab.url === targetUrl);
    if (!matched?.id) {
      throw new Error(`Task tab not found: ${targetUrl}`);
    }
    await chromeApi.tabs.update(matched.id, { active: true });
  }, taskPage.url());
}

async function maybeConfigureLlm(sidepanelPage: Page, extensionId: string, options: CliOptions) {
  const llmConfig = resolveLlmConfig(options);
  if (!llmConfig.configured) {
    return llmConfig.report;
  }
  const response = await runtimeSend(sidepanelPage, extensionId, {
    kind: "config.update",
    patch: {
      model: {
        api: llmConfig.api,
        apiKey: llmConfig.apiKey,
        baseUrl: llmConfig.baseUrl,
        model: llmConfig.model,
        provider: llmConfig.provider,
      },
    },
  });
  assert(response.ok, `config.update failed: ${JSON.stringify(response)}`);
  return llmConfig.report;
}

async function waitForChatDone(sidepanelPage: Page, extensionId: string, timeoutMs: number) {
  const start = Date.now();
  let lastBootstrap: any = null;
  while (Date.now() - start <= timeoutMs) {
    const bootstrap = await runtimeSend(sidepanelPage, extensionId, {
      kind: "runtime.chat.bootstrap",
    });
    if (bootstrap.ok) {
      lastBootstrap = bootstrap.data;
      const runStatus = bootstrap.data?.runState?.status;
      const messages = Array.isArray(bootstrap.data?.messages) ? bootstrap.data.messages : [];
      const hasAssistant = messages.some(
        (message: { role?: string; text?: string }) =>
          message.role === "assistant" &&
          typeof message.text === "string" &&
          message.text.length > 0,
      );
      if (runStatus === "idle" && hasAssistant) {
        return { bootstrap: bootstrap.data, completionReason: "assistant_text", timedOut: false };
      }
      const hasAssistantTurn = messages.some(
        (message: { role?: string }) => message.role === "assistant",
      );
      if (runStatus === "idle" && hasAssistantTurn) {
        return {
          bootstrap: bootstrap.data,
          completionReason: "idle_without_assistant_text",
          timedOut: false,
        };
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return { bootstrap: lastBootstrap, completionReason: "timeout", timedOut: true };
}

async function readResource(page: Page, extensionId: string, resourceId: string, limit = 160) {
  const response = await runtimeSend(page, extensionId, {
    kind: "resource.read",
    limit,
    resourceId,
  });
  return response.ok ? response.data?.data : response;
}

function latestAssistantText(bootstrap: any): string {
  const messages = Array.isArray(bootstrap?.messages) ? bootstrap.messages : [];
  const assistant = [...messages]
    .reverse()
    .find((message: { role?: string; text?: string }) => message.role === "assistant");
  return typeof assistant?.text === "string" ? assistant.text : "";
}

function networkSummary(events: NetworkEvent[]) {
  const failed = events.filter((event) => event.type === "requestfailed");
  const responses = events.filter((event) => event.type === "response");
  const statusCounts = new Map<number, number>();
  for (const event of responses) {
    if (typeof event.status === "number") {
      statusCounts.set(event.status, (statusCounts.get(event.status) ?? 0) + 1);
    }
  }
  return {
    failedCount: failed.length,
    firstFailures: failed.slice(0, 10),
    requestCount: events.filter((event) => event.type === "request").length,
    responseCount: responses.length,
    statusCounts: Object.fromEntries([...statusCounts.entries()].sort(([a], [b]) => a - b)),
  };
}

async function captureDebugBundleArtifact(
  sidepanelPage: Page,
  extensionId: string,
  artifactDir: string,
) {
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

function writeReport({
  artifactDir,
  bootstrap,
  completionReason,
  debugBundle,
  debugBundlePath,
  effectiveExtensionDir,
  extensionId,
  llmConfig,
  networkEvents,
  options,
  screenshots,
  timedOut,
  userDataDir,
}: {
  artifactDir: string;
  bootstrap: any;
  completionReason: string;
  debugBundle: any;
  debugBundlePath: string;
  effectiveExtensionDir: string;
  extensionId: string;
  llmConfig: unknown;
  networkEvents: NetworkEvent[];
  options: CliOptions;
  screenshots: { sidepanel: string; task: string };
  timedOut: boolean;
  userDataDir: string;
}) {
  const summary = networkSummary(networkEvents);
  const reportPath = resolve(artifactDir, "report.md");
  const lines = [
    "# Real Browser Dogfood Evidence",
    "",
    "This is not a score. It is a debug artifact for the current Agent/user to inspect.",
    "",
    `- Mode: ${options.prepareLogin ? "prepare-login" : "dogfood-run"}`,
    `- URL: ${options.url}`,
    `- Prompt: ${options.prompt}`,
    `- Extension ID: ${extensionId}`,
    `- Extension dir: ${effectiveExtensionDir}`,
    `- Debug host permissions: ${options.debugHostPermissions}`,
    `- User data dir: ${userDataDir}`,
    `- Keep open: ${options.keepOpen}`,
    `- Timed out: ${timedOut}`,
    `- Completion reason: ${completionReason}`,
    `- LLM config: ${JSON.stringify(llmConfig)}`,
    `- Latest assistant text: ${latestAssistantText(bootstrap) || "(empty)"}`,
    `- Task screenshot: ${screenshots.task}`,
    `- Sidepanel screenshot: ${screenshots.sidepanel}`,
    `- Debug bundle: ${debugBundlePath}`,
    `- Debug bundle lanes: ${JSON.stringify(debugBundle?.laneMap ?? [])}`,
    `- Network requests: ${summary.requestCount}`,
    `- Network responses: ${summary.responseCount}`,
    `- Network failures: ${summary.failedCount}`,
    `- Status counts: ${JSON.stringify(summary.statusCounts)}`,
    "",
    "## First Network Failures",
    "",
    "```json",
    JSON.stringify(summary.firstFailures, null, 2),
    "```",
    "",
    "## Agent Self-Evaluation Prompt",
    "",
    "Inspect the screenshots, chat transcript, observability timeline, raw event tail, and network events. Decide whether the product completed the user task, where it failed, and whether the next action is keep, simplify, delete, or add one missing primitive.",
  ];
  writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
  return reportPath;
}

function resolveUserDataDir(options: CliOptions): string {
  if (options.userDataDir) {
    return resolve(repoRoot, options.userDataDir);
  }
  if (options.profileName) {
    return resolve(repoRoot, ".ml-cache/dogfood/profiles", safeProfileName(options.profileName));
  }
  return resolve(tmpdir(), `bbl-dogfood-profile-${Date.now()}`);
}

function prepareExtensionDirForDogfood(options: CliOptions, artifactDir: string): string {
  if (!options.debugHostPermissions) {
    return options.extensionDir;
  }

  const dogfoodExtensionDir = resolve(artifactDir, "extension-debug-host-permissions");
  rmSync(dogfoodExtensionDir, { recursive: true, force: true });
  cpSync(options.extensionDir, dogfoodExtensionDir, { recursive: true });
  const manifestPath = resolve(dogfoodExtensionDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    host_permissions?: string[];
  };
  manifest.host_permissions = Array.from(
    new Set([...(manifest.host_permissions ?? []), "<all_urls>"]),
  );
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return dogfoodExtensionDir;
}

export async function runRealBrowserNetworkDogfood(options = parseOptions(process.argv.slice(2))) {
  requireBuiltExtension(options.extensionDir);
  if (options.prepareLogin) {
    assert(!options.headless, "--prepare-login requires a visible browser window");
  }
  const artifactDir =
    options.artifactDir ??
    resolve(repoRoot, ".ml-cache/dogfood", `real-browser-network-${timestampForPath()}`);
  mkdirSync(artifactDir, { recursive: true });

  const userDataDir = resolveUserDataDir(options);
  const shouldCleanupProfile = !options.userDataDir && !options.profileName && !options.keepProfile;
  const extensionDir = prepareExtensionDirForDogfood(options, artifactDir);
  const context = await chromium.launchPersistentContext(userDataDir, {
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      "--no-default-browser-check",
      "--no-first-run",
    ],
    headless: options.headless,
    viewport: { width: 1360, height: 920 },
  });
  const networkEvents = recordNetworkEvents(context, options);

  try {
    const worker = await waitForExtensionWorker(context);
    const extensionId = new URL(worker.url()).host;
    const taskPage = await context.newPage();
    await taskPage.goto(options.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/src/sidepanel.html`);
    await sidepanelPage.waitForFunction(() =>
      Boolean((globalThis as ChromeRuntimeGlobal).chrome?.runtime),
    );

    const llmConfig = await maybeConfigureLlm(sidepanelPage, extensionId, options);
    await runtimeSend(sidepanelPage, extensionId, { kind: "runtime.chat.session.create" });
    await activateTaskTab(sidepanelPage, taskPage);

    if (options.prepareLogin) {
      const bootstrapResponse = await runtimeSend(sidepanelPage, extensionId, {
        kind: "runtime.chat.bootstrap",
      });
      const bootstrap = bootstrapResponse.ok ? bootstrapResponse.data : bootstrapResponse;
      const timeline = await readResource(sidepanelPage, extensionId, "observability.timeline");
      const rawEventTail = await readResource(
        sidepanelPage,
        extensionId,
        "observability.rawEventTail",
      );
      const { debugBundle, debugBundlePath } = await captureDebugBundleArtifact(
        sidepanelPage,
        extensionId,
        artifactDir,
      );
      const taskScreenshot = resolve(artifactDir, "task-page.png");
      await taskPage.screenshot({ fullPage: true, path: taskScreenshot });
      const sidepanelScreenshot = resolve(artifactDir, "sidepanel.png");
      await sidepanelPage.bringToFront();
      await sidepanelPage.screenshot({ fullPage: true, path: sidepanelScreenshot });

      writeFileSync(
        resolve(artifactDir, "chat-bootstrap.json"),
        JSON.stringify(bootstrap, null, 2),
      );
      writeFileSync(
        resolve(artifactDir, "network-events.json"),
        JSON.stringify(networkEvents, null, 2),
      );
      writeFileSync(
        resolve(artifactDir, "observability-timeline.json"),
        JSON.stringify(timeline, null, 2),
      );
      writeFileSync(
        resolve(artifactDir, "raw-event-tail.json"),
        JSON.stringify(rawEventTail, null, 2),
      );
      const reportPath = writeReport({
        artifactDir,
        bootstrap,
        effectiveExtensionDir: extensionDir,
        debugBundle,
        debugBundlePath,
        extensionId,
        llmConfig,
        completionReason: "prepare-login",
        networkEvents,
        options,
        screenshots: { sidepanel: sidepanelScreenshot, task: taskScreenshot },
        timedOut: false,
        userDataDir,
      });
      const result = {
        artifactDir,
        reportPath,
        summary: {
          mode: "prepare-login",
          network: networkSummary(networkEvents),
          userDataDir,
        },
      };
      const profileArg = options.profileName
        ? `--profile-name=${options.profileName}`
        : `--user-data-dir=${JSON.stringify(userDataDir)}`;
      console.log(
        JSON.stringify(
          {
            ...result,
            status: "login_window_open",
            nextCommand:
              `bun run dogfood:real-browser -- ${profileArg} ` +
              `--url=${options.url} --prompt=${JSON.stringify(options.prompt)}`,
          },
          null,
          2,
        ),
      );
      await new Promise(() => undefined);
      return result;
    }

    const accepted = await runtimeSend(sidepanelPage, extensionId, {
      kind: "runtime.chat.send",
      text: options.prompt,
    });
    assert(accepted.ok, `runtime.chat.send failed: ${JSON.stringify(accepted)}`);

    const { bootstrap, completionReason, timedOut } = await waitForChatDone(
      sidepanelPage,
      extensionId,
      options.timeoutMs,
    );
    const timeline = await readResource(sidepanelPage, extensionId, "observability.timeline");
    const rawEventTail = await readResource(
      sidepanelPage,
      extensionId,
      "observability.rawEventTail",
    );
    const { debugBundle, debugBundlePath } = await captureDebugBundleArtifact(
      sidepanelPage,
      extensionId,
      artifactDir,
    );

    const taskScreenshot = resolve(artifactDir, "task-page.png");
    await taskPage.screenshot({ fullPage: true, path: taskScreenshot });
    const sidepanelScreenshot = resolve(artifactDir, "sidepanel.png");
    await sidepanelPage.bringToFront();
    await sidepanelPage.screenshot({ fullPage: true, path: sidepanelScreenshot });

    writeFileSync(resolve(artifactDir, "chat-bootstrap.json"), JSON.stringify(bootstrap, null, 2));
    writeFileSync(
      resolve(artifactDir, "network-events.json"),
      JSON.stringify(networkEvents, null, 2),
    );
    writeFileSync(
      resolve(artifactDir, "observability-timeline.json"),
      JSON.stringify(timeline, null, 2),
    );
    writeFileSync(
      resolve(artifactDir, "raw-event-tail.json"),
      JSON.stringify(rawEventTail, null, 2),
    );
    const reportPath = writeReport({
      artifactDir,
      bootstrap,
      debugBundle,
      debugBundlePath,
      effectiveExtensionDir: extensionDir,
      extensionId,
      llmConfig,
      completionReason,
      networkEvents,
      options,
      screenshots: { sidepanel: sidepanelScreenshot, task: taskScreenshot },
      timedOut,
      userDataDir,
    });

    if (!options.keepOpen) {
      await context.close();
    }

    return {
      artifactDir,
      reportPath,
      summary: {
        assistantText: latestAssistantText(bootstrap),
        network: networkSummary(networkEvents),
        completionReason,
        timedOut,
        userDataDir,
      },
    };
  } finally {
    if (!options.keepOpen) {
      await context.close().catch(() => undefined);
    }
    if (shouldCleanupProfile) {
      rmSync(userDataDir, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRealBrowserNetworkDogfood()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.stack || error.message : String(error));
      process.exit(1);
    });
}
