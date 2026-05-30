import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { JsRunnerHost } from "@bbl-next/js-runner";
import {
  type ActiveTabMetadata,
  type InjectionStep,
  type SiteScriptInstaller,
  type SiteScriptInvocationRequest,
  type SiteScriptVerificationRequest,
  type SiteSkillAction,
  type SiteSkillDefinition,
  SiteSkillRegistry,
  SiteSkillRuntime,
  type SiteVerificationResult,
  buildInjectionPlan,
  createSingleActionSiteSkillDefinition,
  invokeSingleActionSiteSkill,
} from "@bbl-next/site-runtime";
// @ts-ignore source JS module has no declaration file yet
import { createPageHookBridge } from "mv3-shell/background";
import { describe, expect, it, vi } from "vitest";

const tab: ActiveTabMetadata = {
  tabId: 7,
  url: "https://x.com/home",
  active: true,
  title: "Home",
};

interface PageHookBridgeState {
  state: {
    installs: Array<{
      installationId: string;
      world: string;
      scriptId: string;
      jsPath: string | null;
      runAt: string | null;
      tabId: number | null;
      url: string;
    }>;
    invocations: Array<Record<string, unknown>>;
    verifications: Array<{ action: string; verified: boolean }>;
    keyEvents?: Array<Record<string, unknown>>;
    queryResults?: Array<Record<string, unknown>>;
    clickEvents?: Array<Record<string, unknown>>;
    fillEvents?: Array<Record<string, unknown>>;
    fetchEvents?: Array<Record<string, unknown>>;
  };
}

function cloneSerializable<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function getFirstElementUid(result: unknown): string {
  const elements = Array.from(
    (((result as { elements?: ArrayLike<{ uid?: string }> } | null)?.elements ?? []) as ArrayLike<{
      uid?: string;
    }>) ?? [],
  );
  const first = elements[0];
  if (!first?.uid) {
    throw new Error("Expected query result to include at least one element uid");
  }
  return first.uid;
}

function createDomSandbox(options?: {
  delayedSelectors?: Record<
    string,
    { readyAfterQueries: number; elements?: Array<Record<string, string>> }
  >;
  fetchImpl?: (input: unknown, init?: Record<string, unknown>) => unknown | Promise<unknown>;
}) {
  const dispatchLog: Array<{ target: string; type: string; key?: string }> = [];
  const delayedSelectorChecks = new Map<string, number>();

  function createTarget(target: string) {
    return {
      dispatchEvent(event: { type: string; key?: string }) {
        dispatchLog.push({
          target,
          type: event.type,
          ...(typeof event.key === "string" ? { key: event.key } : {}),
        });
        return true;
      },
    };
  }

  class KeyboardEvent {
    readonly type: string;
    readonly key: string;
    readonly bubbles: boolean;
    readonly cancelable: boolean;
    readonly composed: boolean;

    constructor(type: string, init: Record<string, unknown> = {}) {
      this.type = type;
      this.key = typeof init.key === "string" ? init.key : "";
      this.bubbles = init.bubbles === true;
      this.cancelable = init.cancelable === true;
      this.composed = init.composed === true;
    }
  }

  class MouseEvent {
    readonly type: string;
    readonly bubbles: boolean;
    readonly cancelable: boolean;
    constructor(type: string, init: Record<string, unknown> = {}) {
      this.type = type;
      this.bubbles = init.bubbles === true;
      this.cancelable = init.cancelable === true;
    }
  }

  class InputEvent {
    readonly type: string;
    readonly bubbles: boolean;
    constructor(type: string, init: Record<string, unknown> = {}) {
      this.type = type;
      this.bubbles = init.bubbles === true;
    }
  }

  class Event {
    readonly type: string;
    readonly bubbles: boolean;
    constructor(type: string, init: Record<string, unknown> = {}) {
      this.type = type;
      this.bubbles = init.bubbles === true;
    }
  }

  function createMockElement(tag: string, attrs: Record<string, string>, text: string) {
    const attrList = Object.entries(attrs).map(([name, value]) => ({ name, value }));
    const el: Record<string, unknown> = {
      tagName: tag.toUpperCase(),
      textContent: text,
      value: attrs.value ?? "",
      attributes: Object.assign(attrList, { length: attrList.length }),
      dispatchEvent(event: { type: string }) {
        dispatchLog.push({ target: `${tag}#${attrs.id ?? "?"}`, type: event.type });
        return true;
      },
      click() {
        (el as Record<string, unknown> & { dispatchEvent: (e: unknown) => boolean }).dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      },
    };
    return el;
  }

  const mockElements = [
    createMockElement("button", { id: "submit-btn", class: "primary" }, "Submit"),
    createMockElement("input", { id: "email", type: "email" }, ""),
    createMockElement("div", { id: "content", class: "main" }, "Hello World"),
  ];

  const activeElement = createTarget("activeElement");
  const body = createTarget("body");
  const documentElement = createTarget("documentElement");
  const document = {
    activeElement,
    body,
    documentElement,
    dispatchEvent: createTarget("document").dispatchEvent,
    querySelectorAll(selector: string) {
      const delayedSelector = options?.delayedSelectors?.[selector];
      if (delayedSelector) {
        const checks = (delayedSelectorChecks.get(selector) ?? 0) + 1;
        delayedSelectorChecks.set(selector, checks);
        if (checks >= delayedSelector.readyAfterQueries) {
          const readyElements = delayedSelector.elements?.map((attrs) =>
            createMockElement("div", attrs, `Delayed ${attrs.id ?? selector}`),
          ) ?? [createMockElement("div", { id: selector.replace(/^[#.]*/, "") }, "Delayed Ready")];
          return readyElements;
        }
        return [];
      }
      if (selector === "*") return [...mockElements];
      return mockElements.filter((el) => {
        if ((el.tagName as string).toLowerCase() === selector.toLowerCase()) return true;
        if (selector.startsWith("#")) {
          return (el.attributes as Array<{ name: string; value: string }>).some(
            (a) => a.name === "id" && a.value === selector.slice(1),
          );
        }
        if (selector.startsWith(".")) {
          return (el.attributes as Array<{ name: string; value: string }>).some(
            (a) => a.name === "class" && (a.value as string).split(" ").includes(selector.slice(1)),
          );
        }
        return false;
      });
    },
    __dispatchLog: dispatchLog,
    __mockElements: mockElements,
  };

  return {
    document,
    KeyboardEvent,
    MouseEvent,
    InputEvent,
    Event,
    fetch:
      options?.fetchImpl ??
      (async (input: unknown) => ({
        ok: true,
        status: 200,
        statusText: "OK",
        url: String(input),
        text: async () => "",
        headers: {
          get() {
            return null;
          },
        },
      })),
  };
}

function createScriptingChromeHarness(options?: {
  domSandboxFactory?: () => Record<string, unknown>;
  fetchImpl?: (input: unknown, init?: Record<string, unknown>) => unknown | Promise<unknown>;
}) {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const worlds = new Map<string, Record<string, unknown>>();

  function getContext(tabId: number, world: string): Record<string, unknown> {
    const key = `${tabId}:${world}`;
    const existing = worlds.get(key);
    if (existing) {
      return existing;
    }
    const sandbox: Record<string, unknown> = {
      console,
      ...(options?.domSandboxFactory
        ? options.domSandboxFactory()
        : createDomSandbox({
            ...(options?.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
          })),
    };
    sandbox.globalThis = sandbox;
    worlds.set(key, sandbox);
    return sandbox;
  }

  return {
    chromeApi: {
      scripting: {
        executeScript: vi.fn(
          async (request: {
            target: { tabId: number };
            world?: string;
            files?: string[];
            func?: (...args: unknown[]) => unknown;
            args?: unknown[];
          }) => {
            const world = request.world ?? "ISOLATED";
            const context = getContext(request.target.tabId, world);

            if (request.files) {
              for (const file of request.files) {
                let filePath = resolve(testDir, "../../../apps/mv3-shell", file);
                if (!existsSync(filePath) && file.endsWith(".js")) {
                  filePath = resolve(testDir, "../../../apps/mv3-shell", `${file.slice(0, -3)}.ts`);
                }
                const source = readFileSync(filePath, "utf8");
                runInNewContext(source, context, {
                  filename: file,
                });
              }
            }

            if (request.func) {
              context.__bblArgs = request.args ?? [];
              const result = cloneSerializable(
                await Promise.resolve(
                  runInNewContext(
                    `(${request.func.toString()})(...globalThis.__bblArgs)`,
                    context,
                    {
                      filename: "executeScript.js",
                    },
                  ),
                ),
              );
              context.__bblArgs = undefined;
              return [{ result }];
            }

            return [];
          },
        ),
      },
    },
  };
}

describe("site-runtime", () => {
  it("matches site skills only on the active tab", () => {
    const registry = new SiteSkillRegistry([
      {
        skillId: "twitter.search",
        matches: ["https://x.com/*"],
        actions: [],
      },
    ]);

    expect(registry.matchActiveTab(tab)).toHaveLength(1);
    expect(
      registry.matchActiveTab({
        ...tab,
        active: false,
      }),
    ).toHaveLength(0);
  });

  it("installs hooks only when an action is invoked and verifies the result", async () => {
    const installs: InjectionStep[] = [];
    const verifies: string[] = [];
    const registry = new SiteSkillRegistry([
      {
        skillId: "twitter.search",
        matches: ["https://x.com/*"],
        actions: [
          {
            name: "search_posts",
            worlds: ["content", "main"],
            verifier: "results_visible",
            module: {
              id: "twitter.search",
              source:
                "exports.default = async ({ ctx, input }) => ({ url: ctx.tab.url, query: input.query });",
            },
          },
        ],
      },
    ]);
    const runtime = new SiteSkillRuntime({
      registry,
      runnerHost: new JsRunnerHost(),
      installer: {
        install: async (step) => {
          installs.push(step);
        },
      },
      verifier: {
        verify: async ({ action }) => {
          verifies.push(action);
          return true;
        },
      },
    });

    const result = await runtime.invoke({
      skillId: "twitter.search",
      action: "search_posts",
      tab,
      input: {
        query: "browser brain loop",
      },
    });

    expect(installs.map((s) => s.world)).toEqual(["content", "main"]);
    expect(verifies).toEqual(["search_posts"]);
    expect(result).toMatchObject({
      verified: true,
      result: {
        url: "https://x.com/home",
        query: "browser brain loop",
      },
      trace: [
        "match:twitter.search",
        "plan:2_steps",
        "install:content:twitter.search:search_posts:content",
        "install:main:twitter.search:search_posts:main",
        "invoke:search_posts",
        "verify:results_visible",
      ],
    });
  });

  it("allows app integration to inject kernel-owned runner execution", async () => {
    const runtime = new SiteSkillRuntime({
      registry: new SiteSkillRegistry([
        {
          skillId: "fixture.page",
          matches: ["https://x.com/*"],
          actions: [
            {
              name: "execute_fixture",
              injectionSteps: [
                {
                  world: "main",
                  scriptId: "fixture.page:execute_fixture:main",
                },
              ],
              module: {
                id: "fixture.page.execute",
                source: "exports.default = async () => ({ ok: true });",
              },
            },
          ],
        },
      ]),
      runnerHost: {
        invoke: vi.fn(async () => {
          throw new Error("runner host should not be called");
        }),
      } as unknown as JsRunnerHost,
      installer: {
        install: async (step) => ({
          installationId: `${step.scriptId}:1`,
        }),
        invoke: async ({ input, installation, tab }) => {
          const installationResult =
            installation.result &&
            typeof installation.result === "object" &&
            "installationId" in installation.result
              ? installation.result
              : null;

          return {
            installationId: installationResult?.installationId,
            input,
            tabUrl: tab.url,
          };
        },
      },
    });

    const executeRunner = vi.fn(async ({ input, ctx, site }) => ({
      echoed: input,
      tabUrl: ctx.tab.url,
      installationCount: site.installations.length,
    }));

    const result = await runtime.invoke({
      skillId: "fixture.page",
      action: "execute_fixture",
      tab,
      input: {
        query: "browser brain loop",
      },
      executeRunner,
    });

    expect(executeRunner).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      verified: true,
      result: {
        installationId: "fixture.page:execute_fixture:main:1",
        input: {
          echoed: {
            query: "browser brain loop",
          },
          tabUrl: "https://x.com/home",
          installationCount: 1,
        },
        tabUrl: "https://x.com/home",
      },
      trace: [
        "match:fixture.page",
        "plan:1_steps",
        "install:main:fixture.page:execute_fixture:main",
        "invoke:execute_fixture",
      ],
    });
  });

  it("rejects invoke when the active tab does not match the skill", async () => {
    const installer = {
      install: vi.fn(async () => undefined),
    };
    const registry = new SiteSkillRegistry([
      {
        skillId: "twitter.search",
        matches: ["https://x.com/*"],
        actions: [
          {
            name: "search_posts",
            module: {
              id: "twitter.search",
              source: "exports.default = async () => ({ ok: true });",
            },
          },
        ],
      },
    ]);
    const runtime = new SiteSkillRuntime({
      registry,
      runnerHost: new JsRunnerHost(),
      installer,
    });

    await expect(
      runtime.invoke({
        skillId: "twitter.search",
        action: "search_posts",
        tab: {
          ...tab,
          url: "https://example.com/outside",
        },
      }),
    ).rejects.toMatchObject({
      code: "E_BAD_INPUT",
      message: "Active tab does not match twitter.search",
    });
    expect(installer.install).not.toHaveBeenCalled();
  });

  it("allows explicit background lane dispatch on a matching inactive tab", async () => {
    const runtime = new SiteSkillRuntime({
      registry: new SiteSkillRegistry([
        {
          skillId: "twitter.search",
          matches: ["https://x.com/*"],
          actions: [
            {
              name: "search_posts",
              module: {
                id: "twitter.search",
                source:
                  "exports.default = async ({ ctx, input }) => ({ url: ctx.tab.url, active: ctx.tab.active, query: input.query });",
              },
            },
          ],
        },
      ]),
      runnerHost: new JsRunnerHost(),
    });

    const result = await runtime.invoke({
      skillId: "twitter.search",
      action: "search_posts",
      lane: "background",
      tab: {
        ...tab,
        active: false,
      },
      input: {
        query: "background lane",
      },
    });

    expect(result).toMatchObject({
      verified: true,
      result: {
        url: "https://x.com/home",
        active: false,
        query: "background lane",
      },
    });
    expect(result.trace).toEqual([
      "lane:background",
      "match:twitter.search",
      "invoke:search_posts",
    ]);
  });

  it("rejects invoke when the tab is inactive even if the URL matches", async () => {
    const installer = {
      install: vi.fn(async () => undefined),
    };
    const registry = new SiteSkillRegistry([
      {
        skillId: "twitter.search",
        matches: ["https://x.com/*"],
        actions: [
          {
            name: "search_posts",
            module: {
              id: "twitter.search",
              source: "exports.default = async () => ({ ok: true });",
            },
          },
        ],
      },
    ]);
    const runtime = new SiteSkillRuntime({
      registry,
      runnerHost: new JsRunnerHost(),
      installer,
    });

    await expect(
      runtime.invoke({
        skillId: "twitter.search",
        action: "search_posts",
        tab: {
          ...tab,
          active: false,
        },
      }),
    ).rejects.toMatchObject({
      code: "E_BAD_INPUT",
      message: "Active tab does not match twitter.search",
    });
    expect(installer.install).not.toHaveBeenCalled();
  });

  it("does not install hooks before an explicit action invoke", () => {
    const installer = {
      install: vi.fn(async () => undefined),
    };
    const registry = new SiteSkillRegistry([
      {
        skillId: "twitter.search",
        matches: ["https://x.com/*"],
        actions: [
          {
            name: "search_posts",
            worlds: ["content"],
            module: {
              id: "twitter.search",
              source: "exports.default = async () => ({ ok: true });",
            },
          },
        ],
      },
    ]);

    new SiteSkillRuntime({
      registry,
      runnerHost: new JsRunnerHost(),
      installer,
    });

    expect(registry.matchActiveTab(tab).map((skill) => skill.skillId)).toEqual(["twitter.search"]);
    expect(installer.install).not.toHaveBeenCalled();
  });

  it("exposes a package-owned single-action definition for app bridge integration", () => {
    expect(
      createSingleActionSiteSkillDefinition({
        skillId: "fixture.page",
        action: "execute_fixture",
        tab: {
          tabId: 11,
          url: "https://fixture.test/demo",
          active: true,
        },
        plan: {
          skillId: "fixture.page",
          action: "execute_fixture",
          steps: [{ world: "main", scriptId: "bbl-next.page-hook.fixture" }],
        },
        module: {
          id: "fixture.page.execute",
          source: "exports.default = async () => ({ ok: true });",
        },
        verifier: "page_hook_ok",
      }),
    ).toEqual({
      skillId: "fixture.page",
      matches: ["https://fixture.test/demo"],
      actions: [
        {
          name: "execute_fixture",
          module: {
            id: "fixture.page.execute",
            source: "exports.default = async () => ({ ok: true });",
          },
          injectionSteps: [{ world: "main", scriptId: "bbl-next.page-hook.fixture" }],
          verifier: "page_hook_ok",
        },
      ],
    });
  });

  it("invokes a single-action site runtime through the package-owned helper", async () => {
    const scriptingHarness = createScriptingChromeHarness();
    const pageHookBridge = createPageHookBridge({
      chromeApi: scriptingHarness.chromeApi,
    });

    const result = await invokeSingleActionSiteSkill({
      request: {
        skillId: "fixture.page",
        action: "press_key",
        tab: {
          tabId: 13,
          url: "https://fixture.test/demo",
          active: true,
        },
        input: {
          key: "Enter",
        },
        plan: {
          skillId: "fixture.page",
          action: "press_key",
          steps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.page",
              jsPath: "src/page-hook.js",
              runAt: "document_idle",
            },
          ],
        },
        module: {
          id: "fixture.page.press_key",
          source: "exports.default = async ({ input }) => ({ key: input.key });",
        },
        verifier: "page_press_key",
      },
      runnerHost: new JsRunnerHost(),
      installer: {
        install: async (step, currentTab) => pageHookBridge.install(step, currentTab),
        invoke: async ({ installation, action, input, tab: currentTab, ctx }) =>
          pageHookBridge.invoke({
            installation,
            action,
            input,
            tab: currentTab,
            ctx,
          }),
        verify: async ({ installation, action, result, tab: currentTab }) =>
          pageHookBridge.verify({
            installation,
            action,
            result,
            tab: currentTab,
          }),
      },
    });

    const snapshot = (await pageHookBridge.snapshotState({
      tabId: 13,
      world: "main",
    })) as PageHookBridgeState["state"] | null;

    expect(snapshot?.installs).toEqual([
      expect.objectContaining({
        installationId: "bbl-next.page-hook.page:1",
        scriptId: "bbl-next.page-hook.page",
      }),
    ]);
    expect(result).toMatchObject({
      verified: true,
      result: {
        ok: true,
        action: "press_key",
        key: "Enter",
        installationId: "bbl-next.page-hook.page:1",
      },
      trace: [
        "match:fixture.page",
        "plan:1_steps",
        "install:main:bbl-next.page-hook.page",
        "invoke:press_key",
        "verify:page_press_key",
      ],
    });
  });

  it("runs a real page-hook file through the explicit injection bridge", async () => {
    const scriptingHarness = createScriptingChromeHarness();
    const pageHookBridge = createPageHookBridge({
      chromeApi: scriptingHarness.chromeApi,
    });
    const registry = new SiteSkillRegistry([
      {
        skillId: "fixture.page",
        matches: ["https://fixture.test/*"],
        actions: [
          {
            name: "execute_fixture",
            injectionSteps: [
              {
                world: "main",
                scriptId: "bbl-next.page-hook.fixture",
                jsPath: "src/page-hook.js",
                runAt: "document_idle",
              },
            ],
            verifier: "page_hook_ok",
            module: {
              id: "fixture.page.execute",
              source: `
                exports.default = async ({ ctx, input }) => {
                  const installation = ctx.site.installations.find(
                    (entry) => entry.step.scriptId === "bbl-next.page-hook.fixture"
                  );
                  if (!installation || !installation.result) {
                    throw new Error("fixture install missing");
                  }
                  return {
                    query: input.query,
                    installationId: installation.result.installationId,
                    canRun: typeof installation.result.run,
                    canVerify: typeof installation.result.verify,
                    canInvoke: typeof installation.result.invoke
                  };
                };
              `,
            },
          },
        ],
      },
    ]);
    const runtime = new SiteSkillRuntime({
      registry,
      runnerHost: new JsRunnerHost(),
      installer: {
        install: async (step, currentTab) => pageHookBridge.install(step, currentTab),
        invoke: async ({ installation, action, input, tab: currentTab, ctx }) =>
          pageHookBridge.invoke({
            installation,
            action,
            input,
            tab: currentTab,
            ctx,
          }),
        verify: async ({ installation, action, result, tab: currentTab }) =>
          pageHookBridge.verify({
            installation,
            action,
            result,
            tab: currentTab,
          }),
      },
    });

    const result = await runtime.invoke({
      skillId: "fixture.page",
      action: "execute_fixture",
      tab: {
        tabId: 11,
        url: "https://fixture.test/demo",
        active: true,
      },
      input: {
        query: "hello fixture",
      },
    });

    const snapshot = (await pageHookBridge.snapshotState({
      tabId: 11,
      world: "main",
    })) as PageHookBridgeState["state"] | null;

    expect(snapshot?.installs).toEqual([
      {
        installationId: "bbl-next.page-hook.fixture:1",
        world: "main",
        scriptId: "bbl-next.page-hook.fixture",
        jsPath: "src/page-hook.js",
        runAt: "document_idle",
        tabId: 11,
        url: "https://fixture.test/demo",
      },
    ]);
    expect(snapshot?.invocations).toEqual([
      expect.objectContaining({
        ok: true,
        action: "execute_fixture",
        installationId: "bbl-next.page-hook.fixture:1",
        installedScriptId: "bbl-next.page-hook.fixture",
        tabUrl: "https://fixture.test/demo",
        installCount: 1,
      }),
    ]);
    expect(snapshot?.verifications).toEqual([
      {
        action: "execute_fixture",
        verified: true,
      },
    ]);
    expect(result).toMatchObject({
      verified: true,
      result: {
        ok: true,
        action: "execute_fixture",
        input: {
          query: "hello fixture",
          installationId: "bbl-next.page-hook.fixture:1",
          canRun: "undefined",
          canVerify: "undefined",
          canInvoke: "undefined",
        },
        installationId: "bbl-next.page-hook.fixture:1",
        installedScriptId: "bbl-next.page-hook.fixture",
        tabUrl: "https://fixture.test/demo",
        installCount: 1,
      },
      trace: [
        "match:fixture.page",
        "plan:1_steps",
        "install:main:bbl-next.page-hook.fixture",
        "invoke:execute_fixture",
        "verify:page_hook_ok",
      ],
    });
  });

  it("stabilizes real page-hook verification until a delayed selector becomes ready", async () => {
    const scriptingHarness = createScriptingChromeHarness({
      domSandboxFactory: () =>
        createDomSandbox({
          delayedSelectors: {
            "#late-ready": {
              readyAfterQueries: 2,
            },
          },
        }),
    });
    const pageHookBridge = createPageHookBridge({
      chromeApi: scriptingHarness.chromeApi,
    });
    const runtime = new SiteSkillRuntime({
      registry: new SiteSkillRegistry([
        {
          skillId: "fixture.page",
          matches: ["https://fixture.test/*"],
          actions: [
            {
              name: "execute_fixture",
              injectionSteps: [
                {
                  world: "main",
                  scriptId: "bbl-next.page-hook.fixture",
                  jsPath: "src/page-hook.js",
                  runAt: "document_idle",
                },
              ],
              verifier: "page_ready_selector",
              stabilization: {
                maxAttempts: 3,
                intervalMs: 0,
              },
              module: {
                id: "fixture.page.execute",
                source: `
                  exports.default = async () => ({
                    stabilization: {
                      kind: "selector_present",
                      selector: "#late-ready",
                      minCount: 1
                    }
                  });
                `,
              },
            },
          ],
        },
      ]),
      runnerHost: new JsRunnerHost(),
      installer: {
        install: async (step, currentTab) => pageHookBridge.install(step, currentTab),
        invoke: async ({ installation, action, input, tab: currentTab, ctx }) =>
          pageHookBridge.invoke({
            installation,
            action,
            input,
            tab: currentTab,
            ctx,
          }),
        verify: async ({ installation, action, result, tab: currentTab, verifier }) =>
          pageHookBridge.verify({
            installation,
            action,
            verifier,
            result,
            tab: currentTab,
          }),
      },
    });

    const result = await runtime.invoke({
      skillId: "fixture.page",
      action: "execute_fixture",
      lane: "background",
      tab: {
        tabId: 17,
        url: "https://fixture.test/background-ready",
        active: false,
      },
    });

    const snapshot = (await pageHookBridge.snapshotState({
      tabId: 17,
      world: "main",
    })) as PageHookBridgeState["state"] | null;

    expect(result).toMatchObject({
      verified: true,
      trace: [
        "lane:background",
        "match:fixture.page",
        "plan:1_steps",
        "install:main:bbl-next.page-hook.fixture",
        "invoke:execute_fixture",
        "stabilize:not_ready:1",
        "verify:page_ready_selector",
      ],
    });
    expect(snapshot?.verifications).toEqual([
      {
        action: "execute_fixture",
        verified: false,
      },
      {
        action: "execute_fixture",
        verified: true,
      },
    ]);
  });

  it("escalates exhausted stabilization budget as runtime_blocked instead of verify_failed", async () => {
    const runtime = new SiteSkillRuntime({
      registry: new SiteSkillRegistry([
        {
          skillId: "fixture.page",
          matches: ["https://fixture.test/*"],
          actions: [
            {
              name: "execute_fixture",
              injectionSteps: [
                {
                  world: "main",
                  scriptId: "bbl-next.page-hook.fixture",
                },
              ],
              verifier: "page_ready_selector",
              stabilization: {
                maxAttempts: 2,
                intervalMs: 0,
              },
              handoff: {
                kind: "confirm",
                title: "Manual readiness required",
                message: "DOM never reached a ready state",
                trigger: "runtime_blocked",
              },
              module: {
                id: "fixture.page.execute",
                source: "exports.default = async () => ({ ok: true });",
              },
            },
          ],
        },
      ]),
      runnerHost: new JsRunnerHost(),
      installer: {
        install: async () => ({
          installationId: "fixture.page:execute_fixture:main:1",
        }),
        verify: vi.fn(
          async (): Promise<SiteVerificationResult> => ({
            status: "not_ready",
            reason: "selector:#never-ready",
          }),
        ),
      },
    });

    const result = await runtime.invoke({
      skillId: "fixture.page",
      action: "execute_fixture",
      lane: "background",
      tab: {
        tabId: 19,
        url: "https://fixture.test/background-stuck",
        active: false,
      },
    });

    expect(result).toMatchObject({
      verified: false,
      trace: [
        "lane:background",
        "match:fixture.page",
        "plan:1_steps",
        "install:main:bbl-next.page-hook.fixture",
        "invoke:execute_fixture",
        "stabilize:not_ready:1",
        "stabilize:not_ready:2",
        "stabilize:exhausted",
        "handoff:confirm:runtime_blocked",
      ],
      handoff: {
        trigger: "runtime_blocked",
        title: "Manual readiness required",
      },
    });
  });

  it("dispatches press_key through the real page-hook bridge only on explicit invoke", async () => {
    const scriptingHarness = createScriptingChromeHarness();
    const pageHookBridge = createPageHookBridge({
      chromeApi: scriptingHarness.chromeApi,
    });
    const registry = new SiteSkillRegistry([
      {
        skillId: "fixture.page",
        matches: ["https://fixture.test/*"],
        actions: [
          {
            name: "press_key",
            injectionSteps: [
              {
                world: "main",
                scriptId: "bbl-next.page-hook.page",
                jsPath: "src/page-hook.js",
                runAt: "document_idle",
              },
            ],
            verifier: "page_press_key",
            module: {
              id: "fixture.page.press_key",
              source: "exports.default = async ({ input }) => ({ key: input.key });",
            },
          },
        ],
      },
    ]);
    const runtime = new SiteSkillRuntime({
      registry,
      runnerHost: new JsRunnerHost(),
      installer: {
        install: async (step, currentTab) => pageHookBridge.install(step, currentTab),
        invoke: async ({ installation, action, input, tab: currentTab, ctx }) =>
          pageHookBridge.invoke({
            installation,
            action,
            input,
            tab: currentTab,
            ctx,
          }),
        verify: async ({ installation, action, result, tab: currentTab }) =>
          pageHookBridge.verify({
            installation,
            action,
            result,
            tab: currentTab,
          }),
      },
    });

    const beforeSnapshot = (await pageHookBridge.snapshotState({
      tabId: 13,
      world: "main",
    })) as PageHookBridgeState["state"] | null;

    expect(beforeSnapshot).toBeNull();

    const result = await runtime.invoke({
      skillId: "fixture.page",
      action: "press_key",
      tab: {
        tabId: 13,
        url: "https://fixture.test/demo",
        active: true,
      },
      input: {
        key: "Enter",
      },
    });

    const afterSnapshot = (await pageHookBridge.snapshotState({
      tabId: 13,
      world: "main",
    })) as
      | (PageHookBridgeState["state"] & {
          keyEvents?: Array<{ type: string; key: string }>;
        })
      | null;

    expect(afterSnapshot?.keyEvents).toEqual([
      {
        installationId: "bbl-next.page-hook.page:1",
        scriptId: "bbl-next.page-hook.page",
        type: "keydown",
        key: "Enter",
        tabUrl: "https://fixture.test/demo",
      },
      {
        installationId: "bbl-next.page-hook.page:1",
        scriptId: "bbl-next.page-hook.page",
        type: "keyup",
        key: "Enter",
        tabUrl: "https://fixture.test/demo",
      },
    ]);
    expect(afterSnapshot?.verifications).toEqual([
      {
        action: "press_key",
        verified: true,
      },
    ]);
    expect(result).toMatchObject({
      verified: true,
      result: {
        ok: true,
        action: "press_key",
        key: "Enter",
        installationId: "bbl-next.page-hook.page:1",
        installedScriptId: "bbl-next.page-hook.page",
        dispatchCount: 2,
      },
      trace: [
        "match:fixture.page",
        "plan:1_steps",
        "install:main:bbl-next.page-hook.page",
        "invoke:press_key",
        "verify:page_press_key",
      ],
    });
  });

  it("dispatches query through the real page-hook bridge and returns serialized elements", async () => {
    const scriptingHarness = createScriptingChromeHarness();
    const pageHookBridge = createPageHookBridge({
      chromeApi: scriptingHarness.chromeApi,
    });

    const result = await invokeSingleActionSiteSkill({
      request: {
        skillId: "fixture.page",
        action: "query",
        tab: {
          tabId: 15,
          url: "https://fixture.test/demo",
          active: true,
        },
        input: {
          selector: "button",
        },
        plan: {
          skillId: "fixture.page",
          action: "query",
          steps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.page",
              jsPath: "src/page-hook.js",
              runAt: "document_idle",
            },
          ],
        },
        module: {
          id: "fixture.page.query",
          source: "exports.default = async ({ input }) => ({ selector: input.selector });",
        },
        verifier: "page_query",
      },
      runnerHost: new JsRunnerHost(),
      installer: {
        install: async (step, currentTab) => pageHookBridge.install(step, currentTab),
        invoke: async ({ installation, action, input, tab: currentTab, ctx }) =>
          pageHookBridge.invoke({
            installation,
            action,
            input,
            tab: currentTab,
            ctx,
          }),
        verify: async ({ installation, action, result, tab: currentTab }) =>
          pageHookBridge.verify({
            installation,
            action,
            result,
            tab: currentTab,
          }),
      },
    });

    expect(result).toMatchObject({
      verified: true,
      result: {
        ok: true,
        action: "query",
        selector: "button",
        count: 1,
        elements: [
          expect.objectContaining({
            tagName: "button",
            textContent: "Submit",
          }),
        ],
        installationId: "bbl-next.page-hook.page:1",
      },
      trace: [
        "match:fixture.page",
        "plan:1_steps",
        "install:main:bbl-next.page-hook.page",
        "invoke:query",
        "verify:page_query",
      ],
    });

    const snapshot = (await pageHookBridge.snapshotState({
      tabId: 15,
      world: "main",
    })) as PageHookBridgeState["state"] | null;

    expect(snapshot?.queryResults).toHaveLength(1);
    expect(snapshot?.queryResults?.[0]).toMatchObject({
      action: "query",
      selector: "button",
      count: 1,
    });
  });

  it("dispatches query → click → fill through the real page-hook bridge as a multi-step flow", async () => {
    const scriptingHarness = createScriptingChromeHarness();
    const pageHookBridge = createPageHookBridge({
      chromeApi: scriptingHarness.chromeApi,
    });

    const pageSkill: SiteSkillDefinition = {
      skillId: "fixture.page",
      matches: ["https://fixture.test/*"],
      actions: [
        {
          name: "query",
          injectionSteps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.page",
              jsPath: "src/page-hook.js",
              runAt: "document_idle",
            },
          ],
          verifier: "page_query",
          module: {
            id: "fixture.page.query",
            source: "exports.default = async ({ input }) => ({ selector: input.selector });",
          },
        },
        {
          name: "click",
          injectionSteps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.page",
              jsPath: "src/page-hook.js",
              runAt: "document_idle",
            },
          ],
          verifier: "page_click",
          module: {
            id: "fixture.page.click",
            source: "exports.default = async ({ input }) => ({ uid: input.uid });",
          },
        },
        {
          name: "fill",
          injectionSteps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.page",
              jsPath: "src/page-hook.js",
              runAt: "document_idle",
            },
          ],
          verifier: "page_fill",
          module: {
            id: "fixture.page.fill",
            source:
              "exports.default = async ({ input }) => ({ uid: input.uid, value: input.value });",
          },
        },
      ],
    };

    const installer: SiteScriptInstaller = {
      install: async (step, currentTab) => pageHookBridge.install(step, currentTab),
      invoke: async ({
        installation,
        action,
        input,
        tab: currentTab,
        ctx,
      }: SiteScriptInvocationRequest) =>
        pageHookBridge.invoke({
          installation,
          action,
          input,
          tab: currentTab,
          ctx,
        }),
      verify: async ({
        installation,
        action,
        result,
        tab: currentTab,
      }: SiteScriptVerificationRequest) =>
        pageHookBridge.verify({
          installation,
          action,
          result,
          tab: currentTab,
        }),
    };

    const runtime = new SiteSkillRuntime({
      registry: new SiteSkillRegistry([pageSkill]),
      runnerHost: new JsRunnerHost(),
      installer,
    });

    const testTab = { tabId: 16, url: "https://fixture.test/demo", active: true };

    // Step 1: Query to get element uids
    const queryResult = await runtime.invoke({
      skillId: "fixture.page",
      action: "query",
      tab: testTab,
      input: { selector: "input" },
    });

    expect(queryResult).toMatchObject({
      verified: true,
      result: expect.objectContaining({
        ok: true,
        action: "query",
        count: 1,
        elements: [expect.objectContaining({ tagName: "input" })],
      }),
    });

    const querySnapshot = (await pageHookBridge.snapshotState({
      tabId: 16,
      world: "main",
    })) as PageHookBridgeState["state"] | null;
    const inputUid = getFirstElementUid(querySnapshot?.queryResults?.at(-1));

    // Step 2: Fill the input field
    const fillResult = await runtime.invoke({
      skillId: "fixture.page",
      action: "fill",
      tab: testTab,
      input: { uid: inputUid, value: "test@example.com" },
    });

    expect(fillResult).toMatchObject({
      verified: true,
      result: expect.objectContaining({
        ok: true,
        action: "fill",
        uid: inputUid,
        value: "test@example.com",
        tagName: "input",
      }),
    });

    // Step 3: Query button and click it
    await runtime.invoke({
      skillId: "fixture.page",
      action: "query",
      tab: testTab,
      input: { selector: "button" },
    });

    const buttonSnapshot = (await pageHookBridge.snapshotState({
      tabId: 16,
      world: "main",
    })) as PageHookBridgeState["state"] | null;
    const buttonUid = getFirstElementUid(buttonSnapshot?.queryResults?.at(-1));

    const clickResult = await runtime.invoke({
      skillId: "fixture.page",
      action: "click",
      tab: testTab,
      input: { uid: buttonUid },
    });

    expect(clickResult).toMatchObject({
      verified: true,
      result: expect.objectContaining({
        ok: true,
        action: "click",
        uid: buttonUid,
        tagName: "button",
      }),
    });

    // Verify full state
    const snapshot = (await pageHookBridge.snapshotState({
      tabId: 16,
      world: "main",
    })) as PageHookBridgeState["state"] | null;

    expect(snapshot?.queryResults).toHaveLength(2);
    expect(snapshot?.clickEvents).toHaveLength(1);
    expect(snapshot?.fillEvents).toHaveLength(1);
    expect(snapshot?.verifications).toEqual([
      { action: "query", verified: true },
      { action: "fill", verified: true },
      { action: "query", verified: true },
      { action: "click", verified: true },
    ]);
  });

  it("dispatches query → fill → click through the real page-hook bridge on an explicit background lane", async () => {
    const scriptingHarness = createScriptingChromeHarness();
    const pageHookBridge = createPageHookBridge({
      chromeApi: scriptingHarness.chromeApi,
    });

    const pageSkill: SiteSkillDefinition = {
      skillId: "fixture.page",
      matches: ["https://fixture.test/*"],
      actions: [
        {
          name: "query",
          injectionSteps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.page",
              jsPath: "src/page-hook.js",
              runAt: "document_idle",
            },
          ],
          verifier: "page_query",
          module: {
            id: "fixture.page.query",
            source: "exports.default = async ({ input }) => ({ selector: input.selector });",
          },
        },
        {
          name: "click",
          injectionSteps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.page",
              jsPath: "src/page-hook.js",
              runAt: "document_idle",
            },
          ],
          verifier: "page_click",
          module: {
            id: "fixture.page.click",
            source: "exports.default = async ({ input }) => ({ uid: input.uid });",
          },
        },
        {
          name: "fill",
          injectionSteps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.page",
              jsPath: "src/page-hook.js",
              runAt: "document_idle",
            },
          ],
          verifier: "page_fill",
          module: {
            id: "fixture.page.fill",
            source:
              "exports.default = async ({ input }) => ({ uid: input.uid, value: input.value });",
          },
        },
      ],
    };

    const installer: SiteScriptInstaller = {
      install: async (step, currentTab) => pageHookBridge.install(step, currentTab),
      invoke: async ({
        installation,
        action,
        input,
        tab: currentTab,
        ctx,
      }: SiteScriptInvocationRequest) =>
        pageHookBridge.invoke({
          installation,
          action,
          input,
          tab: currentTab,
          ctx,
        }),
      verify: async ({
        installation,
        action,
        result,
        tab: currentTab,
      }: SiteScriptVerificationRequest) =>
        pageHookBridge.verify({
          installation,
          action,
          result,
          tab: currentTab,
        }),
    };

    const runtime = new SiteSkillRuntime({
      registry: new SiteSkillRegistry([pageSkill]),
      runnerHost: new JsRunnerHost(),
      installer,
    });

    const testTab = { tabId: 17, url: "https://fixture.test/background", active: false };

    const queryResult = await runtime.invoke({
      skillId: "fixture.page",
      action: "query",
      lane: "background",
      tab: testTab,
      input: { selector: "input" },
    });

    expect(queryResult).toMatchObject({
      verified: true,
      result: expect.objectContaining({
        ok: true,
        action: "query",
        count: 1,
        tabUrl: "https://fixture.test/background",
        elements: [expect.objectContaining({ tagName: "input" })],
      }),
      trace: [
        "lane:background",
        "match:fixture.page",
        "plan:1_steps",
        "install:main:bbl-next.page-hook.page",
        "invoke:query",
        "verify:page_query",
      ],
    });

    const querySnapshot = (await pageHookBridge.snapshotState({
      tabId: 17,
      world: "main",
    })) as PageHookBridgeState["state"] | null;
    const inputUid = getFirstElementUid(querySnapshot?.queryResults?.at(-1));

    const fillResult = await runtime.invoke({
      skillId: "fixture.page",
      action: "fill",
      lane: "background",
      tab: testTab,
      input: { uid: inputUid, value: "background@example.com" },
    });

    expect(fillResult).toMatchObject({
      verified: true,
      result: expect.objectContaining({
        ok: true,
        action: "fill",
        uid: inputUid,
        value: "background@example.com",
        tagName: "input",
        tabUrl: "https://fixture.test/background",
      }),
      trace: [
        "lane:background",
        "match:fixture.page",
        "plan:1_steps",
        "install:main:bbl-next.page-hook.page",
        "invoke:fill",
        "verify:page_fill",
      ],
    });

    await runtime.invoke({
      skillId: "fixture.page",
      action: "query",
      lane: "background",
      tab: testTab,
      input: { selector: "button" },
    });

    const buttonSnapshot = (await pageHookBridge.snapshotState({
      tabId: 17,
      world: "main",
    })) as PageHookBridgeState["state"] | null;
    const buttonUid = getFirstElementUid(buttonSnapshot?.queryResults?.at(-1));

    const clickResult = await runtime.invoke({
      skillId: "fixture.page",
      action: "click",
      lane: "background",
      tab: testTab,
      input: { uid: buttonUid },
    });

    expect(clickResult).toMatchObject({
      verified: true,
      result: expect.objectContaining({
        ok: true,
        action: "click",
        uid: buttonUid,
        tagName: "button",
        tabUrl: "https://fixture.test/background",
      }),
      trace: [
        "lane:background",
        "match:fixture.page",
        "plan:1_steps",
        "install:main:bbl-next.page-hook.page",
        "invoke:click",
        "verify:page_click",
      ],
    });

    const snapshot = (await pageHookBridge.snapshotState({
      tabId: 17,
      world: "main",
    })) as PageHookBridgeState["state"] | null;

    expect(snapshot?.queryResults).toHaveLength(2);
    expect(snapshot?.queryResults?.map((entry) => entry.tabUrl)).toEqual([
      "https://fixture.test/background",
      "https://fixture.test/background",
    ]);
    expect(snapshot?.clickEvents).toEqual([
      expect.objectContaining({
        action: "click",
        tabUrl: "https://fixture.test/background",
      }),
    ]);
    expect(snapshot?.fillEvents).toEqual([
      expect.objectContaining({
        action: "fill",
        value: "background@example.com",
        tabUrl: "https://fixture.test/background",
      }),
    ]);
    expect(snapshot?.verifications).toEqual([
      { action: "query", verified: true },
      { action: "fill", verified: true },
      { action: "query", verified: true },
      { action: "click", verified: true },
    ]);
  });

  it("dispatches fetch_with_session through the real page-hook bridge with session credentials", async () => {
    const fetchImpl = vi.fn(async (input: unknown, init?: Record<string, unknown>) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      url: String(input),
      text: async () => '{"user":"demo"}',
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type" ? "application/json" : null;
        },
      },
      init,
    }));
    const scriptingHarness = createScriptingChromeHarness({
      fetchImpl,
    });
    const pageHookBridge = createPageHookBridge({
      chromeApi: scriptingHarness.chromeApi,
    });

    const result = await invokeSingleActionSiteSkill({
      request: {
        skillId: "fixture.site",
        action: "fetch_with_session",
        tab: {
          tabId: 18,
          url: "https://fixture.test/home",
          active: true,
        },
        input: {
          url: "https://fixture.test/api/me",
          method: "POST",
          body: '{"ping":true}',
        },
        plan: {
          skillId: "fixture.site",
          action: "fetch_with_session",
          steps: [
            {
              world: "main",
              scriptId: "bbl-next.page-hook.site",
              jsPath: "src/page-hook.js",
              runAt: "document_idle",
            },
          ],
        },
        module: {
          id: "fixture.site.fetch_with_session",
          source:
            "exports.default = async ({ input }) => ({ url: input.url, method: input.method, body: input.body });",
        },
        verifier: "site_fetch_with_session",
      },
      runnerHost: new JsRunnerHost(),
      installer: {
        install: async (step, currentTab) => pageHookBridge.install(step, currentTab),
        invoke: async ({ installation, action, input, tab: currentTab, ctx }) =>
          pageHookBridge.invoke({
            installation,
            action,
            input,
            tab: currentTab,
            ctx,
          }),
        verify: async ({ installation, action, result, tab: currentTab }) =>
          pageHookBridge.verify({
            installation,
            action,
            result,
            tab: currentTab,
          }),
      },
    });

    expect(result).toMatchObject({
      verified: true,
      result: {
        action: "fetch_with_session",
        status: 200,
        body: '{"user":"demo"}',
        installationId: "bbl-next.page-hook.site:1",
      },
      trace: [
        "match:fixture.site",
        "plan:1_steps",
        "install:main:bbl-next.page-hook.site",
        "invoke:fetch_with_session",
        "verify:site_fetch_with_session",
      ],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://fixture.test/api/me",
      expect.objectContaining({
        method: "POST",
        body: '{"ping":true}',
        credentials: "include",
      }),
    );

    const snapshot = (await pageHookBridge.snapshotState({
      tabId: 18,
      world: "main",
    })) as PageHookBridgeState["state"] | null;

    expect(snapshot?.fetchEvents).toEqual([
      expect.objectContaining({
        action: "fetch_with_session",
        url: "https://fixture.test/api/me",
        method: "POST",
        credentials: "include",
        status: 200,
        body: '{"user":"demo"}',
      }),
    ]);
  });

  describe("InjectionPlan", () => {
    const actionWithWorlds: SiteSkillAction = {
      name: "search_posts",
      worlds: ["content", "main"],
      module: { id: "twitter.search", source: "exports.default = async () => ({});" },
    };

    const actionWithScripts: SiteSkillAction = {
      name: "like_post",
      injectionSteps: [
        { world: "content", scriptId: "twitter.dom-helper", jsPath: "src/page-hook.js" },
        { world: "main", scriptId: "twitter.api-bridge", runAt: "document_idle" },
      ],
      module: { id: "twitter.like", source: "exports.default = async () => ({});" },
    };

    const actionNoInjection: SiteSkillAction = {
      name: "get_timeline",
      module: { id: "twitter.timeline", source: "exports.default = async () => ({});" },
    };

    it("builds plan from injectionSteps when provided", () => {
      const plan = buildInjectionPlan("twitter.like", actionWithScripts);
      expect(plan).toEqual({
        skillId: "twitter.like",
        action: "like_post",
        steps: [
          { world: "content", scriptId: "twitter.dom-helper", jsPath: "src/page-hook.js" },
          { world: "main", scriptId: "twitter.api-bridge", runAt: "document_idle" },
        ],
      });
    });

    it("falls back to worlds for legacy actions without injectionSteps", () => {
      const plan = buildInjectionPlan("twitter.search", actionWithWorlds);
      expect(plan).toEqual({
        skillId: "twitter.search",
        action: "search_posts",
        steps: [
          { world: "content", scriptId: "twitter.search:search_posts:content" },
          { world: "main", scriptId: "twitter.search:search_posts:main" },
        ],
      });
    });

    it("returns empty steps when no worlds or injectionSteps", () => {
      const plan = buildInjectionPlan("twitter.timeline", actionNoInjection);
      expect(plan).toEqual({
        skillId: "twitter.timeline",
        action: "get_timeline",
        steps: [],
      });
    });
  });

  describe("installer / verifier / runner boundaries", () => {
    it("installer receives structured InjectionStep from plan", async () => {
      const installedSteps: InjectionStep[] = [];
      const registry = new SiteSkillRegistry([
        {
          skillId: "github.pr",
          matches: ["https://github.com/*"],
          actions: [
            {
              name: "merge",
              injectionSteps: [
                { world: "content", scriptId: "gh.dom-helper", jsPath: "src/page-hook.js" },
                { world: "main", scriptId: "gh.api-hook", runAt: "document_idle" },
              ],
              module: {
                id: "gh.merge",
                source: "exports.default = async ({ ctx }) => ({ tab: ctx.tab.tabId });",
              },
            },
          ],
        },
      ]);
      const installer: SiteScriptInstaller = {
        install: async (step, _tab) => {
          installedSteps.push(step);
        },
      };
      const runtime = new SiteSkillRuntime({
        registry,
        runnerHost: new JsRunnerHost(),
        installer,
      });

      await runtime.invoke({
        skillId: "github.pr",
        action: "merge",
        tab: { tabId: 1, url: "https://github.com/foo/bar/pull/1", active: true },
      });

      expect(installedSteps).toEqual([
        { world: "content", scriptId: "gh.dom-helper", jsPath: "src/page-hook.js" },
        { world: "main", scriptId: "gh.api-hook", runAt: "document_idle" },
      ]);
    });

    it("verifier is independent: failure does not affect installer execution", async () => {
      const installs: string[] = [];
      const registry = new SiteSkillRegistry([
        {
          skillId: "gh.check",
          matches: ["https://github.com/*"],
          actions: [
            {
              name: "status",
              worlds: ["content"],
              verifier: "status_visible",
              module: {
                id: "gh.check",
                source: "exports.default = async () => ({ ok: true });",
              },
            },
          ],
        },
      ]);
      const runtime = new SiteSkillRuntime({
        registry,
        runnerHost: new JsRunnerHost(),
        installer: {
          install: async (step) => {
            installs.push(step.scriptId);
          },
        },
        verifier: {
          verify: async () => false,
        },
      });

      await expect(
        runtime.invoke({
          skillId: "gh.check",
          action: "status",
          tab: { tabId: 2, url: "https://github.com/a/b", active: true },
        }),
      ).rejects.toThrow(/Verifier failed/);

      // installer still ran before verifier
      expect(installs).toEqual(["gh.check:status:content"]);
    });

    it("returns a takeover handoff draft instead of throwing when verify failure is marked for handoff", async () => {
      const registry = new SiteSkillRegistry([
        {
          skillId: "github.login",
          matches: ["https://github.com/*"],
          actions: [
            {
              name: "complete_login",
              worlds: ["content"],
              verifier: "login_complete",
              handoff: {
                kind: "takeover",
                title: "Need human takeover",
                message: "Verification failed after the automated login step.",
              },
              module: {
                id: "github.login",
                source: 'exports.default = async () => ({ step: "submitted" });',
              },
            },
          ],
        },
      ]);
      const runtime = new SiteSkillRuntime({
        registry,
        runnerHost: new JsRunnerHost(),
        installer: {
          install: async () => undefined,
        },
        verifier: {
          verify: async () => false,
        },
      });

      const result = await runtime.invoke({
        skillId: "github.login",
        action: "complete_login",
        tab: { tabId: 5, url: "https://github.com/login", active: true },
      });

      expect(result).toMatchObject({
        verified: false,
        result: {
          step: "submitted",
        },
        handoff: {
          kind: "takeover",
          trigger: "verify_failed",
          title: "Need human takeover",
          message: "Verification failed after the automated login step.",
          skillId: "github.login",
          action: "complete_login",
          tabId: 5,
          payload: {
            tabUrl: "https://github.com/login",
            verifier: "login_complete",
            result: {
              step: "submitted",
            },
          },
        },
        trace: [
          "match:github.login",
          "plan:1_steps",
          "install:content:github.login:complete_login:content",
          "invoke:complete_login",
          "verify:login_complete",
          "handoff:takeover:verify_failed",
        ],
      });
      expect("id" in (result.handoff ?? {})).toBe(false);
      expect("status" in (result.handoff ?? {})).toBe(false);
    });

    it("returns an input handoff draft when runtime blocking errors are marked for handoff", async () => {
      const registry = new SiteSkillRegistry([
        {
          skillId: "twitter.login",
          matches: ["https://x.com/*"],
          actions: [
            {
              name: "submit_2fa",
              handoff: {
                kind: "input",
                trigger: "runtime_blocked",
                title: "Need user input",
                message: "2FA code is required before the flow can continue.",
                payload: {
                  inputKind: "otp",
                },
              },
              module: {
                id: "twitter.login.2fa",
                source: 'exports.default = async () => { throw new Error("OTP required"); };',
              },
            },
          ],
        },
      ]);
      const runtime = new SiteSkillRuntime({
        registry,
        runnerHost: new JsRunnerHost(),
      });

      const result = await runtime.invoke({
        skillId: "twitter.login",
        action: "submit_2fa",
        tab: { tabId: 6, url: "https://x.com/i/flow/login", active: true },
        input: {
          prompt: "enter code",
        },
      });

      expect(result).toMatchObject({
        verified: false,
        result: null,
        handoff: {
          kind: "input",
          trigger: "runtime_blocked",
          title: "Need user input",
          message: "2FA code is required before the flow can continue.",
          skillId: "twitter.login",
          action: "submit_2fa",
          tabId: 6,
          payload: {
            inputKind: "otp",
            tabUrl: "https://x.com/i/flow/login",
            input: {
              prompt: "enter code",
            },
            error: {
              name: "CapabilityError",
              message: "OTP required",
            },
          },
        },
        trace: ["match:twitter.login", "handoff:input:runtime_blocked"],
      });
      expect("id" in (result.handoff ?? {})).toBe(false);
      expect("status" in (result.handoff ?? {})).toBe(false);
    });

    it("does not attach product-level page handoff unless caller supplies a policy", async () => {
      await expect(
        invokeSingleActionSiteSkill({
          request: {
            skillId: "bbl.page",
            action: "query",
            tab: { tabId: 8, url: "https://fixture.test/query", active: true },
            input: {
              selector: "#missing",
            },
            plan: {
              skillId: "bbl.page",
              action: "query",
              steps: [],
            },
            module: {
              id: "bbl.page.query",
              source: "exports.default = async ({ input }) => ({ selector: input.selector });",
            },
            verifier: "page_query",
          },
          runnerHost: new JsRunnerHost(),
          verifier: {
            verify: async () => false,
          },
        }),
      ).rejects.toThrow(/Verifier failed/);
    });

    it("uses caller-provided page.query handoff policy for verify failures", async () => {
      const result = await invokeSingleActionSiteSkill({
        request: {
          skillId: "bbl.page",
          action: "query",
          tab: { tabId: 8, url: "https://fixture.test/query", active: true },
          input: {
            selector: "#missing",
          },
          plan: {
            skillId: "bbl.page",
            action: "query",
            steps: [],
          },
          module: {
            id: "bbl.page.query",
            source: "exports.default = async ({ input }) => ({ selector: input.selector });",
          },
          verifier: "page_query",
          handoff: {
            kind: "takeover",
            title: "Page action needs human handoff",
            message: "Finish the page.query step manually before continuing.",
          },
        },
        runnerHost: new JsRunnerHost(),
        verifier: {
          verify: async () => false,
        },
      });

      expect(result).toMatchObject({
        verified: false,
        result: {
          selector: "#missing",
        },
        handoff: {
          kind: "takeover",
          trigger: "verify_failed",
          skillId: "bbl.page",
          action: "query",
          tabId: 8,
          payload: {
            tabUrl: "https://fixture.test/query",
            verifier: "page_query",
            result: {
              selector: "#missing",
            },
          },
        },
        trace: [
          "match:bbl.page",
          "invoke:query",
          "verify:page_query",
          "handoff:takeover:verify_failed",
        ],
      });
    });

    it("uses caller-provided page.click handoff policy for verify failures", async () => {
      const result = await invokeSingleActionSiteSkill({
        request: {
          skillId: "bbl.page",
          action: "click",
          tab: { tabId: 9, url: "https://fixture.test/click", active: true },
          input: {
            uid: "missing-button",
          },
          plan: {
            skillId: "bbl.page",
            action: "click",
            steps: [],
          },
          module: {
            id: "bbl.page.click",
            source: "exports.default = async ({ input }) => ({ uid: input.uid });",
          },
          verifier: "page_click",
          handoff: {
            kind: "takeover",
            title: "Page action needs human handoff",
            message: "Finish the page.click step manually before continuing.",
          },
        },
        runnerHost: new JsRunnerHost(),
        verifier: {
          verify: async () => false,
        },
      });

      expect(result).toMatchObject({
        verified: false,
        result: {
          uid: "missing-button",
        },
        handoff: {
          kind: "takeover",
          trigger: "verify_failed",
          skillId: "bbl.page",
          action: "click",
          tabId: 9,
          payload: {
            tabUrl: "https://fixture.test/click",
            verifier: "page_click",
            result: {
              uid: "missing-button",
            },
          },
        },
        trace: [
          "match:bbl.page",
          "invoke:click",
          "verify:page_click",
          "handoff:takeover:verify_failed",
        ],
      });
    });

    it("uses caller-provided page.fill handoff policy for runtime blocking failures", async () => {
      const result = await invokeSingleActionSiteSkill({
        request: {
          skillId: "bbl.page",
          action: "fill",
          tab: { tabId: 10, url: "https://fixture.test/fill", active: true },
          input: {
            uid: "email-input",
            value: "demo@example.com",
          },
          plan: {
            skillId: "bbl.page",
            action: "fill",
            steps: [],
          },
          module: {
            id: "bbl.page.fill",
            source: "exports.default = async () => ({ ok: true });",
          },
          handoff: {
            kind: "takeover",
            trigger: "runtime_blocked",
            title: "Page action needs human handoff",
            message: "Finish the page.fill step manually before continuing.",
          },
          executeRunner: async () => {
            throw new Error("input disappeared");
          },
        },
        runnerHost: new JsRunnerHost(),
      });

      expect(result).toMatchObject({
        verified: false,
        result: null,
        handoff: {
          kind: "takeover",
          trigger: "runtime_blocked",
          skillId: "bbl.page",
          action: "fill",
          tabId: 10,
          payload: {
            tabUrl: "https://fixture.test/fill",
            input: {
              uid: "email-input",
              value: "demo@example.com",
            },
            error: {
              name: "Error",
              message: "input disappeared",
            },
          },
        },
        trace: ["match:bbl.page", "handoff:takeover:runtime_blocked"],
      });
    });

    it("runner does not trigger install or verify when they are absent", async () => {
      const registry = new SiteSkillRegistry([
        {
          skillId: "simple.skill",
          matches: ["https://example.com/*"],
          actions: [
            {
              name: "ping",
              module: {
                id: "simple.ping",
                source: "exports.default = async () => ({ pong: true });",
              },
            },
          ],
        },
      ]);
      const runtime = new SiteSkillRuntime({
        registry,
        runnerHost: new JsRunnerHost(),
        // no installer, no verifier
      });

      const result = await runtime.invoke({
        skillId: "simple.skill",
        action: "ping",
        tab: { tabId: 3, url: "https://example.com/test", active: true },
      });

      expect(result.result).toEqual({ pong: true });
      expect(result.verified).toBe(true);
      expect(result.trace).toEqual(["match:simple.skill", "invoke:ping"]);
    });

    it("trace reflects plan/install/run/verify four phases", async () => {
      const registry = new SiteSkillRegistry([
        {
          skillId: "full.flow",
          matches: ["https://full.test/*"],
          actions: [
            {
              name: "execute",
              injectionSteps: [
                { world: "content", scriptId: "full.content-hook" },
                { world: "main", scriptId: "full.main-hook" },
              ],
              verifier: "post_check",
              module: {
                id: "full.exec",
                source: "exports.default = async () => ({ done: true });",
              },
            },
          ],
        },
      ]);
      const runtime = new SiteSkillRuntime({
        registry,
        runnerHost: new JsRunnerHost(),
        installer: { install: async () => {} },
        verifier: { verify: async () => true },
      });

      const result = await runtime.invoke({
        skillId: "full.flow",
        action: "execute",
        tab: { tabId: 4, url: "https://full.test/page", active: true },
      });

      expect(result.trace).toEqual([
        "match:full.flow",
        "plan:2_steps",
        "install:content:full.content-hook",
        "install:main:full.main-hook",
        "invoke:execute",
        "verify:post_check",
      ]);
    });
  });
});
