import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { JsRunnerHost } from "@bbl-next/js-runner";
import {
  SiteSkillRegistry,
  SiteSkillRuntime,
  buildInjectionPlan,
  type ActiveTabMetadata,
  type InjectionPlan,
  type InjectionStep,
  type SiteSkillAction,
  type SiteScriptInstaller,
  type SiteActionVerifier
} from "@bbl-next/site-runtime";
import { describe, expect, it, vi } from "vitest";

const tab: ActiveTabMetadata = {
  tabId: 7,
  url: "https://x.com/home",
  active: true,
  title: "Home"
};

interface PageHookFixtureHandle {
  installed: {
    world: string;
    scriptId: string;
    runAt: string | null;
    tabId: number | null;
    url: string;
  };
  run(action: string, input: unknown, ctx: Record<string, unknown>): unknown;
  verify(action: string, result: unknown): boolean;
}

interface PageHookFixtureApi {
  version: string;
  state: {
    installs: Array<PageHookFixtureHandle["installed"]>;
    invocations: Array<Record<string, unknown>>;
    verifications: Array<{ action: string; verified: boolean }>;
  };
  install(step: InjectionStep, tab: ActiveTabMetadata): PageHookFixtureHandle;
}

function loadPageHookFixture(): PageHookFixtureApi {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(testDir, "../../../apps/mv3-shell/src/page-hook.js"), "utf8");
  const sandbox: {
    console: Console;
    globalThis?: unknown;
    __BBL_NEXT_PAGE_HOOK__?: PageHookFixtureApi;
  } = {
    console
  };
  sandbox.globalThis = sandbox;
  runInNewContext(source, sandbox, {
    filename: "page-hook.js"
  });
  if (!sandbox.__BBL_NEXT_PAGE_HOOK__) {
    throw new Error("page hook fixture did not register");
  }
  return sandbox.__BBL_NEXT_PAGE_HOOK__;
}

describe("site-runtime", () => {
  it("matches site skills only on the active tab", () => {
    const registry = new SiteSkillRegistry([
      {
        skillId: "twitter.search",
        matches: ["https://x.com/*"],
        actions: []
      }
    ]);

    expect(registry.matchActiveTab(tab)).toHaveLength(1);
    expect(
      registry.matchActiveTab({
        ...tab,
        active: false
      })
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
                "exports.default = async ({ ctx, input }) => ({ url: ctx.tab.url, query: input.query });"
            }
          }
        ]
      }
    ]);
    const runtime = new SiteSkillRuntime({
      registry,
      runnerHost: new JsRunnerHost(),
      installer: {
        install: async (step) => {
          installs.push(step);
        }
      },
      verifier: {
        verify: async ({ action }) => {
          verifies.push(action);
          return true;
        }
      }
    });

    const result = await runtime.invoke({
      skillId: "twitter.search",
      action: "search_posts",
      tab,
      input: {
        query: "browser brain loop"
      }
    });

    expect(installs.map((s) => s.world)).toEqual(["content", "main"]);
    expect(verifies).toEqual(["search_posts"]);
    expect(result).toMatchObject({
      verified: true,
      result: {
        url: "https://x.com/home",
        query: "browser brain loop"
      },
      trace: [
        "match:twitter.search",
        "plan:2_steps",
        "install:content:twitter.search:search_posts:content",
        "install:main:twitter.search:search_posts:main",
        "invoke:search_posts",
        "verify:results_visible"
      ]
    });
  });

  it("rejects invoke when the active tab does not match the skill", async () => {
    const installer = {
      install: vi.fn(async () => undefined)
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
              source: "exports.default = async () => ({ ok: true });"
            }
          }
        ]
      }
    ]);
    const runtime = new SiteSkillRuntime({
      registry,
      runnerHost: new JsRunnerHost(),
      installer
    });

    await expect(
      runtime.invoke({
        skillId: "twitter.search",
        action: "search_posts",
        tab: {
          ...tab,
          url: "https://example.com/outside"
        }
      })
    ).rejects.toMatchObject({
      code: "E_BAD_INPUT",
      message: "Active tab does not match twitter.search"
    });
    expect(installer.install).not.toHaveBeenCalled();
  });

  it("rejects invoke when the tab is inactive even if the URL matches", async () => {
    const installer = {
      install: vi.fn(async () => undefined)
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
              source: "exports.default = async () => ({ ok: true });"
            }
          }
        ]
      }
    ]);
    const runtime = new SiteSkillRuntime({
      registry,
      runnerHost: new JsRunnerHost(),
      installer
    });

    await expect(
      runtime.invoke({
        skillId: "twitter.search",
        action: "search_posts",
        tab: {
          ...tab,
          active: false
        }
      })
    ).rejects.toMatchObject({
      code: "E_BAD_INPUT",
      message: "Active tab does not match twitter.search"
    });
    expect(installer.install).not.toHaveBeenCalled();
  });

  it("does not install hooks before an explicit action invoke", () => {
    const installer = {
      install: vi.fn(async () => undefined)
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
              source: "exports.default = async () => ({ ok: true });"
            }
          }
        ]
      }
    ]);

    new SiteSkillRuntime({
      registry,
      runnerHost: new JsRunnerHost(),
      installer
    });

    expect(registry.matchActiveTab(tab).map((skill) => skill.skillId)).toEqual([
      "twitter.search"
    ]);
    expect(installer.install).not.toHaveBeenCalled();
  });

  it("runs a real page-hook fixture from action to verifier", async () => {
    const pageHook = loadPageHookFixture();
    const registry = new SiteSkillRegistry([
      {
        skillId: "fixture.page",
        matches: ["https://fixture.test/*"],
        actions: [
          {
            name: "execute_fixture",
            injectionSteps: [
              { world: "main", scriptId: "bbl-next.page-hook.fixture", runAt: "document_idle" }
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
                  return installation.result.run("execute_fixture", input, ctx);
                };
              `
            }
          }
        ]
      }
    ]);
    const runtime = new SiteSkillRuntime({
      registry,
      runnerHost: new JsRunnerHost(),
      installer: {
        install: async (step, currentTab) => {
          if (step.scriptId === "bbl-next.page-hook.fixture") {
            return pageHook.install(step, currentTab);
          }
          return undefined;
        }
      },
      verifier: {
        verify: async ({ action, result, site }) => {
          const installation = site.installations.find(
            (entry) => entry.step.scriptId === "bbl-next.page-hook.fixture"
          );
          if (!installation || !installation.result) {
            return false;
          }
          return (installation.result as PageHookFixtureHandle).verify(action, result);
        }
      }
    });

    const result = await runtime.invoke({
      skillId: "fixture.page",
      action: "execute_fixture",
      tab: {
        tabId: 11,
        url: "https://fixture.test/demo",
        active: true
      },
      input: {
        query: "hello fixture"
      }
    });

    expect(pageHook.version).toBe("fixture-v1");
    expect(pageHook.state.installs).toEqual([
      {
        world: "main",
        scriptId: "bbl-next.page-hook.fixture",
        runAt: "document_idle",
        tabId: 11,
        url: "https://fixture.test/demo"
      }
    ]);
    expect(pageHook.state.invocations).toEqual([
      expect.objectContaining({
        ok: true,
        action: "execute_fixture",
        installedScriptId: "bbl-next.page-hook.fixture",
        tabUrl: "https://fixture.test/demo",
        installCount: 1
      })
    ]);
    expect(pageHook.state.verifications).toEqual([
      {
        action: "execute_fixture",
        verified: true
      }
    ]);
    expect(result).toMatchObject({
      verified: true,
      result: {
        ok: true,
        action: "execute_fixture",
        input: {
          query: "hello fixture"
        },
        installedScriptId: "bbl-next.page-hook.fixture",
        tabUrl: "https://fixture.test/demo",
        installCount: 1
      },
      trace: [
        "match:fixture.page",
        "plan:1_steps",
        "install:main:bbl-next.page-hook.fixture",
        "invoke:execute_fixture",
        "verify:page_hook_ok"
      ]
    });
  });

  describe("InjectionPlan", () => {
    const actionWithWorlds: SiteSkillAction = {
      name: "search_posts",
      worlds: ["content", "main"],
      module: { id: "twitter.search", source: "exports.default = async () => ({});" }
    };

    const actionWithScripts: SiteSkillAction = {
      name: "like_post",
      injectionSteps: [
        { world: "content", scriptId: "twitter.dom-helper" },
        { world: "main", scriptId: "twitter.api-bridge", runAt: "document_idle" }
      ],
      module: { id: "twitter.like", source: "exports.default = async () => ({});" }
    };

    const actionNoInjection: SiteSkillAction = {
      name: "get_timeline",
      module: { id: "twitter.timeline", source: "exports.default = async () => ({});" }
    };

    it("builds plan from injectionSteps when provided", () => {
      const plan = buildInjectionPlan("twitter.like", actionWithScripts);
      expect(plan).toEqual({
        skillId: "twitter.like",
        action: "like_post",
        steps: [
          { world: "content", scriptId: "twitter.dom-helper" },
          { world: "main", scriptId: "twitter.api-bridge", runAt: "document_idle" }
        ]
      });
    });

    it("falls back to worlds for legacy actions without injectionSteps", () => {
      const plan = buildInjectionPlan("twitter.search", actionWithWorlds);
      expect(plan).toEqual({
        skillId: "twitter.search",
        action: "search_posts",
        steps: [
          { world: "content", scriptId: "twitter.search:search_posts:content" },
          { world: "main", scriptId: "twitter.search:search_posts:main" }
        ]
      });
    });

    it("returns empty steps when no worlds or injectionSteps", () => {
      const plan = buildInjectionPlan("twitter.timeline", actionNoInjection);
      expect(plan).toEqual({
        skillId: "twitter.timeline",
        action: "get_timeline",
        steps: []
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
                { world: "content", scriptId: "gh.dom-helper" },
                { world: "main", scriptId: "gh.api-hook", runAt: "document_idle" }
              ],
              module: {
                id: "gh.merge",
                source: "exports.default = async ({ ctx }) => ({ tab: ctx.tab.tabId });"
              }
            }
          ]
        }
      ]);
      const installer: SiteScriptInstaller = {
        install: async (step, _tab) => {
          installedSteps.push(step);
        }
      };
      const runtime = new SiteSkillRuntime({
        registry,
        runnerHost: new JsRunnerHost(),
        installer
      });

      await runtime.invoke({
        skillId: "github.pr",
        action: "merge",
        tab: { tabId: 1, url: "https://github.com/foo/bar/pull/1", active: true }
      });

      expect(installedSteps).toEqual([
        { world: "content", scriptId: "gh.dom-helper" },
        { world: "main", scriptId: "gh.api-hook", runAt: "document_idle" }
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
                source: "exports.default = async () => ({ ok: true });"
              }
            }
          ]
        }
      ]);
      const runtime = new SiteSkillRuntime({
        registry,
        runnerHost: new JsRunnerHost(),
        installer: {
          install: async (step) => {
            installs.push(step.scriptId);
          }
        },
        verifier: {
          verify: async () => false
        }
      });

      await expect(
        runtime.invoke({
          skillId: "gh.check",
          action: "status",
          tab: { tabId: 2, url: "https://github.com/a/b", active: true }
        })
      ).rejects.toThrow(/Verifier failed/);

      // installer still ran before verifier
      expect(installs).toEqual(["gh.check:status:content"]);
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
                source: "exports.default = async () => ({ pong: true });"
              }
            }
          ]
        }
      ]);
      const runtime = new SiteSkillRuntime({
        registry,
        runnerHost: new JsRunnerHost()
        // no installer, no verifier
      });

      const result = await runtime.invoke({
        skillId: "simple.skill",
        action: "ping",
        tab: { tabId: 3, url: "https://example.com/test", active: true }
      });

      expect(result.result).toEqual({ pong: true });
      expect(result.verified).toBe(true);
      expect(result.trace).toEqual([
        "match:simple.skill",
        "invoke:ping"
      ]);
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
                { world: "main", scriptId: "full.main-hook" }
              ],
              verifier: "post_check",
              module: {
                id: "full.exec",
                source: "exports.default = async () => ({ done: true });"
              }
            }
          ]
        }
      ]);
      const runtime = new SiteSkillRuntime({
        registry,
        runnerHost: new JsRunnerHost(),
        installer: { install: async () => {} },
        verifier: { verify: async () => true }
      });

      const result = await runtime.invoke({
        skillId: "full.flow",
        action: "execute",
        tab: { tabId: 4, url: "https://full.test/page", active: true }
      });

      expect(result.trace).toEqual([
        "match:full.flow",
        "plan:2_steps",
        "install:content:full.content-hook",
        "install:main:full.main-hook",
        "invoke:execute",
        "verify:post_check"
      ]);
    });
  });
});
