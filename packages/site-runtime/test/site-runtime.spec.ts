import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { JsRunnerHost } from "@bbl-next/js-runner";
import {
  type ActiveTabMetadata,
  type InjectionStep,
  type SiteScriptInstaller,
  type SiteSkillAction,
  SiteSkillRegistry,
  SiteSkillRuntime,
  buildInjectionPlan,
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
  };
}

function createDomSandbox() {
  const dispatchLog: Array<{ target: string; type: string; key?: string }> = [];

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

  const activeElement = createTarget("activeElement");
  const body = createTarget("body");
  const documentElement = createTarget("documentElement");
  const document = {
    activeElement,
    body,
    documentElement,
    dispatchEvent: createTarget("document").dispatchEvent,
    __dispatchLog: dispatchLog,
  };

  return {
    document,
    KeyboardEvent,
  };
}

function createScriptingChromeHarness() {
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
      ...createDomSandbox(),
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
                const source = readFileSync(
                  resolve(testDir, "../../../apps/mv3-shell", file),
                  "utf8",
                );
                runInNewContext(source, context, {
                  filename: file,
                });
              }
            }

            if (request.func) {
              context.__bblArgs = request.args ?? [];
              const result = await Promise.resolve(
                runInNewContext(`(${request.func.toString()})(...globalThis.__bblArgs)`, context, {
                  filename: "executeScript.js",
                }),
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

    it("returns a takeover intervention request instead of throwing when verify failure is marked for handoff", async () => {
      const registry = new SiteSkillRegistry([
        {
          skillId: "github.login",
          matches: ["https://github.com/*"],
          actions: [
            {
              name: "complete_login",
              worlds: ["content"],
              verifier: "login_complete",
              intervention: {
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
        intervention: {
          kind: "takeover",
          trigger: "verify_failed",
          status: "requested",
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
          "intervention:takeover:verify_failed",
        ],
      });
      expect(result.intervention?.id).toMatch(
        /^ivr:github\.login:complete_login:verify_failed:5:login_complete$/,
      );
    });

    it("returns an input intervention request when runtime blocking errors are marked for handoff", async () => {
      const registry = new SiteSkillRegistry([
        {
          skillId: "twitter.login",
          matches: ["https://x.com/*"],
          actions: [
            {
              name: "submit_2fa",
              intervention: {
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
        intervention: {
          kind: "input",
          trigger: "runtime_blocked",
          status: "requested",
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
        trace: ["match:twitter.login", "intervention:input:runtime_blocked"],
      });
      expect(result.intervention?.id).toMatch(
        /^ivr:twitter\.login:submit_2fa:runtime_blocked:6:request$/,
      );
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
