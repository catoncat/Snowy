#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultExtensionDir = resolve(repoRoot, "apps/mv3-shell/dist");
export const defaultExternalSubmissionArtifact = resolve(
  repoRoot,
  ".ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.zip",
);
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

type ChromeRuntimeGlobal = typeof globalThis & {
  chrome?: {
    runtime?: {
      sendMessage: (
        extensionId: string,
        message: Record<string, unknown>,
      ) => Promise<RuntimeResponse>;
    };
  };
};

export type ReleaseSmokeOptions = {
  artifact?: string;
  extensionDir?: string;
  keepProfile?: boolean;
  scenario?: string;
  userDataDir?: string;
};

type PreparedExtension = {
  cleanupDir?: string;
  dir: string;
  source: {
    kind: "artifact" | "directory";
    path: string;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function resolveFromRepo(path: string): string {
  return resolve(repoRoot, path);
}

function readArgValue(argv: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
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

export function parseReleaseSmokeCliOptions(argv: string[]): ReleaseSmokeOptions {
  return {
    artifact: readArgValue(argv, "--artifact"),
    extensionDir: readArgValue(argv, "--extension-dir"),
    keepProfile: argv.includes("--keep-profile"),
    scenario: readArgValue(argv, "--scenario"),
    userDataDir: readArgValue(argv, "--user-data-dir"),
  };
}

function requireBuiltExtension(extensionDir: string): void {
  const manifestPath = resolve(extensionDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Built extension is missing at ${manifestPath}. Run bun run build first.`);
  }
}

function extractArtifact(artifactPath: string): PreparedExtension {
  const resolvedArtifactPath = resolveFromRepo(artifactPath);
  if (!existsSync(resolvedArtifactPath)) {
    throw new Error(`Release artifact is missing at ${resolvedArtifactPath}`);
  }
  const extractDir = mkdtempSync(resolve(tmpdir(), "bbl-next-mv3-artifact-"));
  const result = spawnSync("unzip", ["-q", resolvedArtifactPath, "-d", extractDir], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    rmSync(extractDir, { recursive: true, force: true });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(
      `unzip ${resolvedArtifactPath} failed with status ${result.status ?? "unknown"}${
        output ? `\n${output}` : ""
      }`,
    );
  }
  return {
    cleanupDir: extractDir,
    dir: extractDir,
    source: {
      kind: "artifact",
      path: resolvedArtifactPath,
    },
  };
}

function prepareExtension(options: ReleaseSmokeOptions): PreparedExtension {
  if (options.artifact) {
    return extractArtifact(options.artifact);
  }
  const extensionDir = resolveFromRepo(options.extensionDir ?? defaultExtensionDir);
  return {
    dir: extensionDir,
    source: {
      kind: "directory",
      path: extensionDir,
    },
  };
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

export async function runReleaseSmoke(options: ReleaseSmokeOptions = {}) {
  const preparedExtension = prepareExtension(options);
  requireBuiltExtension(preparedExtension.dir);

  const userDataDir = options.userDataDir
    ? resolveFromRepo(options.userDataDir)
    : mkdtempSync(resolve(tmpdir(), "bbl-next-mv3-smoke-"));
  const shouldCleanupUserDataDir = !options.userDataDir && !options.keepProfile;
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${preparedExtension.dir}`,
      `--load-extension=${preparedExtension.dir}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  try {
    const worker = await waitForExtensionWorker(context);
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel.html`);
    await page.waitForFunction(() => Boolean((globalThis as ChromeRuntimeGlobal).chrome?.runtime));

    const send = async (message: Record<string, unknown>): Promise<RuntimeResponse> =>
      page.evaluate(
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

    return {
      ok: true,
      extensionId,
      extensionSource: preparedExtension.source,
      profileMode: options.userDataDir ? "provided" : "temporary",
      scenario: options.scenario ?? "release-smoke",
      skillId,
      userDataDir,
      dispatchedCount: dispatch.data.dispatchedCount,
    };
  } finally {
    await context.close();
    if (shouldCleanupUserDataDir) {
      rmSync(userDataDir, { recursive: true, force: true });
    }
    if (preparedExtension.cleanupDir) {
      rmSync(preparedExtension.cleanupDir, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runReleaseSmoke(parseReleaseSmokeCliOptions(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
