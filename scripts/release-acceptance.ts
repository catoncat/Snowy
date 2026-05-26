#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type DocumentCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

type CommandCheck = {
  name: string;
  command: string;
  ok: boolean;
  status: number | null;
  durationMs: number;
  detail: string;
  outputTail?: string;
  skipped?: boolean;
};

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function readText(relativePath: string): string {
  const fullPath = resolve(repoRoot, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
  return readFileSync(fullPath, "utf8");
}

function checkIncludes(
  name: string,
  relativePath: string,
  expectedSnippets: string[],
): DocumentCheck {
  try {
    const text = readText(relativePath);
    const missing = expectedSnippets.filter((snippet) => !text.includes(snippet));
    return {
      name,
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? `${relativePath} contains the expected release acceptance evidence`
          : `${relativePath} is missing: ${missing.join("; ")}`,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkModuleLedger(): DocumentCheck {
  try {
    const ledger = JSON.parse(readText("docs/module-tracking-ledger.json")) as {
      modules?: Array<{
        module_id?: string;
        stage?: string;
        status?: string;
        shipped_scope?: string[];
      }>;
    };
    const modules = ledger.modules ?? [];
    const activeModules = modules.filter((module) => module.stage !== "deferred");
    const nonShipped = activeModules
      .filter((module) => module.status !== "shipped")
      .map((module) => `${module.module_id ?? "(unknown)"}=${module.status ?? "(missing)"}`);
    const oldProductLoop = modules.find(
      (module) => module.module_id === "old-product-replacement-loop",
    );
    const oldProductScope = oldProductLoop?.shipped_scope ?? [];
    const hasIssue184 = oldProductScope.some((item) => item.includes("ISSUE-184"));
    const failures = [
      ...nonShipped.map((item) => `non-deferred module is not shipped: ${item}`),
      ...(oldProductLoop?.stage === "mainline"
        ? []
        : ["old-product-replacement-loop is not mainline"]),
      ...(oldProductLoop?.status === "shipped"
        ? []
        : ["old-product-replacement-loop is not shipped"]),
      ...(hasIssue184
        ? []
        : ["old-product-replacement-loop shipped_scope does not mention ISSUE-184"]),
    ];
    return {
      name: "module ledger",
      ok: failures.length === 0,
      detail:
        failures.length === 0
          ? "non-deferred modules are shipped and old-product-replacement-loop includes the real MV3 proof"
          : failures.join("; "),
    };
  } catch (error) {
    return {
      name: "module ledger",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function tailOutput(stdout: string, stderr: string): string {
  const lines = `${stdout}\n${stderr}`.trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(-24).join("\n");
}

function runCommand(name: string, args: string[]): CommandCheck {
  const startedAt = Date.now();
  const command = `bun ${args.join(" ")}`;
  const result = spawnSync("bun", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const durationMs = Date.now() - startedAt;
  const ok = result.status === 0;
  const outputTail = tailOutput(result.stdout ?? "", result.stderr ?? "");
  return {
    name,
    command,
    ok,
    status: result.status,
    durationMs,
    detail: ok ? "passed" : `failed with status ${result.status ?? "unknown"}`,
    ...(outputTail ? { outputTail } : {}),
  };
}

function skippedCommand(name: string, args: string[], detail: string): CommandCheck {
  return {
    name,
    command: `bun ${args.join(" ")}`,
    ok: false,
    status: null,
    durationMs: 0,
    detail,
    skipped: true,
  };
}

const documentChecks: DocumentCheck[] = [
  checkIncludes("cutover acceptance pack", "docs/level-2-cutover-acceptance-2026-05-27.md", [
    "> status: repo-side gate evidence complete; external release acceptance pending",
    "release-facing real Chromium MV3 proof",
    "sandboxed JS Runner package handler under MV3 CSP",
    "## Next Decision Boundary",
  ]),
  checkIncludes(
    "release cutover decision packet",
    "docs/release-cutover-decision-packet-2026-05-27.md",
    [
      "> status: ready for external release acceptance",
      "Accept the current repo-side Level 2 evidence pack",
      "## Allowed Decision Options",
      "## Post-Decision Actions",
    ],
  ),
  checkIncludes("level 2 uat scenario", "docs/level-2-uat-scenario-2026-05-27.md", [
    "> status: executed against current repo state and real Chromium MV3 extension",
    "Real Chromium MV3 release smoke",
    "bun run release:smoke:mv3",
    'package handler ctx.call("memfs.read")',
  ]),
  checkIncludes("cutover readiness criteria", "docs/cutover-readiness-criteria.md", [
    "Level 2 gate evidence 已经完整",
    "ISSUE-184",
    "外部 release / product acceptance",
  ]),
  checkIncludes("source of truth map", "docs/source-of-truth-map.md", [
    "外部 release acceptance、一个明确 UAT 场景，或显式提升某个 deferred breadth",
    "不为了让 queue 有活而继续把 review finding 切成细小 follow-up",
  ]),
  checkModuleLedger(),
];

const commandChecks: CommandCheck[] = [];
const buildCheck = runCommand("extension build", ["run", "build"]);
commandChecks.push(buildCheck);

if (buildCheck.ok) {
  commandChecks.push(runCommand("real Chromium MV3 smoke", ["run", "release:smoke:mv3"]));
} else {
  commandChecks.push(
    skippedCommand(
      "real Chromium MV3 smoke",
      ["run", "release:smoke:mv3"],
      "skipped because extension build failed",
    ),
  );
}

commandChecks.push(runCommand("repository gate", ["run", "check"]));

const ok = documentChecks.every((check) => check.ok) && commandChecks.every((check) => check.ok);
const result = {
  ok,
  generatedAt: new Date().toISOString(),
  scope: "repo-side Level 2 release acceptance evidence refresh",
  documentChecks,
  commandChecks,
  nextDecisionBoundary: [
    "accept current evidence pack and move to product release / old-mainline cutover",
    "request one additional human-defined real browser/profile UAT scenario",
    "promote one named deferred breadth item to mainline with a product reason",
  ],
};

console.log(JSON.stringify(result, null, 2));
process.exit(ok ? 0 : 1);
