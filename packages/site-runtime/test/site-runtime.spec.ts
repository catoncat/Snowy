import { JsRunnerHost } from "@bbl-next/js-runner";
import {
  SiteSkillRegistry,
  SiteSkillRuntime,
  type ActiveTabMetadata
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
    const installs: string[] = [];
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
        install: async (_skillId, world) => {
          installs.push(world);
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

    expect(installs).toEqual(["content", "main"]);
    expect(verifies).toEqual(["search_posts"]);
    expect(result).toMatchObject({
      verified: true,
      result: {
        url: "https://x.com/home",
        query: "browser brain loop"
      },
      trace: [
        "match:twitter.search",
        "install:content",
        "install:main",
        "invoke:search_posts",
        "verify:results_visible"
      ]
    });
  });
});
