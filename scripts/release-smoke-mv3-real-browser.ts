#!/usr/bin/env bun

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright";

const repoRoot = resolve(import.meta.dir, "..");
const extensionDir = resolve(repoRoot, "apps/mv3-shell/dist");
const manifestPath = resolve(extensionDir, "manifest.json");
const target = "bbl-next.runner.background";

type RuntimeResponse =
  | {
      ok: true;
      data: any;
    }
  | {
      ok: false;
      error?: {
        code?: string;
        message?: string;
        details?: unknown;
      };
    };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function requireBuiltExtension() {
  if (!existsSync(manifestPath)) {
    throw new Error(`Built extension is missing at ${manifestPath}. Run bun run build first.`);
  }
}

function createSetupPlan() {
  const skillId = "skill.release.real-browser";
  const packageUri = `mem://skills/${skillId}`;
  return {
    skillId,
    setupPlan: {
      skillId,
      phase: "install",
      baseUri: packageUri,
      writes: [
        {
          uri: `${packageUri}/SKILL.md`,
          content: "# Real Browser Release Smoke\n",
        },
        {
          uri: `${packageUri}/skill.json`,
          content: JSON.stringify({
            id: skillId,
            version: 1,
            permissions: ["memfs.read"],
            description: "Real Chromium MV3 event replacement smoke",
            kind: "runtime",
            entry: "handler.js",
            eventSubscriptions: [
              {
                event: "runtime.route.after",
                action: "notify_success",
                description: "Emit release smoke evidence after a route succeeds",
              },
            ],
          }),
        },
        {
          uri: `${packageUri}/handler.js`,
          content: `
            exports.default = async ({ ctx, input }) => {
              if (input.action !== "notify_success") {
                throw new Error("Unsupported action: " + input.action);
              }
              const readme = await ctx.call("memfs.read", {
                uri: "${packageUri}/SKILL.md"
              });
              const event = input.args.event || {};
              const routeResult = event.result || {};
              if (event.type !== "brain.run.start" || routeResult.ok !== true) {
                return { action: "continue" };
              }
              return {
                kind: "success",
                message: "sent",
                readme,
                source: ctx.skillId,
                sessionId: routeResult.data && routeResult.data.sessionId
              };
            };
          `,
        },
      ],
    },
  };
}

async function waitForExtensionWorker(
  context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>,
) {
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

async function main() {
  requireBuiltExtension();
  const userDataDir = mkdtempSync(resolve(tmpdir(), "bbl-next-mv3-smoke-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  try {
    const worker = await waitForExtensionWorker(context);
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel.html`);
    await page.waitForFunction(() => typeof chrome !== "undefined" && Boolean(chrome.runtime));

    const send = async (message: Record<string, unknown>): Promise<RuntimeResponse> =>
      page.evaluate(
        async ({
          extensionId: evaluatedExtensionId,
          message: evaluatedMessage,
          target: evaluatedTarget,
        }) =>
          chrome.runtime.sendMessage(evaluatedExtensionId, {
            target: evaluatedTarget,
            ...evaluatedMessage,
          }),
        { extensionId, message, target },
      );

    const { skillId, setupPlan } = createSetupPlan();
    const install = await send({ kind: "skills.install", skillId, setupPlan });
    assert(install.ok, `skills.install failed: ${JSON.stringify(install)}`);

    const enable = await send({ kind: "skills.enable", skillId });
    assert(enable.ok, `skills.enable failed: ${JSON.stringify(enable)}`);

    const summary = await send({ kind: "resource.read", resourceId: "skills.summary" });
    assert(summary.ok, `skills.summary failed: ${JSON.stringify(summary)}`);
    assert(
      summary.data?.data?.items?.some(
        (item: { skillId?: string; eventSubscriptions?: Array<{ event?: string }> }) =>
          item.skillId === skillId &&
          item.eventSubscriptions?.some(
            (subscription) => subscription.event === "runtime.route.after",
          ),
      ),
      `skills.summary did not expose the event subscription: ${JSON.stringify(summary)}`,
    );

    const bootstrap = await send({ kind: "runtime.bootstrap" });
    assert(bootstrap.ok, `runtime.bootstrap failed: ${JSON.stringify(bootstrap)}`);

    const dispatch = await send({
      kind: "runtime.event.dispatch",
      event: {
        name: "runtime.route.after",
        type: "brain.run.start",
        result: {
          ok: true,
          data: {
            sessionId: "release-smoke-session",
          },
        },
      },
    });
    assert(dispatch.ok, `runtime.event.dispatch failed: ${JSON.stringify(dispatch)}`);
    assert(
      dispatch.data?.invocations?.[0]?.result?.kind === "success" &&
        dispatch.data?.invocations?.[0]?.result?.readme === "# Real Browser Release Smoke\n",
      `runtime.event.dispatch did not execute the package handler: ${JSON.stringify(dispatch)}`,
    );

    const audit = await send({ kind: "resource.read", resourceId: "audit.tail" });
    assert(audit.ok, `audit.tail failed: ${JSON.stringify(audit)}`);
    assert(
      audit.data?.data?.entries?.some(
        (entry: { kind?: string; capabilityId?: string; status?: string }) =>
          entry.kind === "loop.step" &&
          entry.capabilityId === "skills.invoke" &&
          entry.status === "executed",
      ),
      `audit.tail did not record the skill invocation: ${JSON.stringify(audit)}`,
    );
    assert(
      audit.data?.data?.entries?.some(
        (entry: { kind?: string; capabilityId?: string; status?: string }) =>
          entry.kind === "loop.step" &&
          entry.capabilityId === "memfs.read" &&
          entry.status === "executed",
      ),
      `audit.tail did not record the sandbox capability call: ${JSON.stringify(audit)}`,
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          extensionId,
          skillId,
          dispatchedCount: dispatch.data.dispatchedCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
