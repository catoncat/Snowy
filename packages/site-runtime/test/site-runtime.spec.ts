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
import { describe, expect, it } from "vitest";

const tab: ActiveTabMetadata = {
  tabId: 7,
  url: "https://x.com/home",
  active: true,
  title: "Home"
};

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
