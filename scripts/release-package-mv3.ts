#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type ChromeManifest = {
  manifest_version?: number;
  name?: string;
  version?: string;
  background?: {
    service_worker?: string;
  };
};

type CommandResult = {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
};

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const extensionDir = resolve(repoRoot, "apps/mv3-shell/dist");
const manifestPath = resolve(extensionDir, "manifest.json");
const defaultArtifactDir = resolve(repoRoot, ".ml-cache/release-artifacts");
const requiredEntries = [
  "manifest.json",
  "src/background.js",
  "src/offscreen.html",
  "src/offscreen.js",
  "src/runner-sandbox.html",
  "src/runner-sandbox.js",
  "src/sidepanel.html",
  "src/sidepanel.js",
  "src/page-hook.js",
];

function run(command: string, args: string[], cwd = repoRoot): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function assertCommand(command: string, args: string[], cwd = repoRoot): CommandResult {
  const result = run(command, args, cwd);
  if (!result.ok) {
    const output = `${result.stdout}\n${result.stderr}`.trim();
    const tail = output.split(/\r?\n/).filter(Boolean).slice(-24).join("\n");
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}${
        tail ? `\n${tail}` : ""
      }`,
    );
  }
  return result;
}

function parseOutputPath(): string | null {
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex === -1) {
    return null;
  }
  const output = process.argv[outputIndex + 1];
  if (!output) {
    throw new Error("--output requires a path");
  }
  return resolve(repoRoot, output);
}

function currentShortHead(): string {
  return assertCommand("git", ["rev-parse", "--short=7", "HEAD"]).stdout.trim();
}

function readManifest(): ChromeManifest {
  if (!existsSync(manifestPath)) {
    throw new Error(`Built extension is missing manifest: ${relative(repoRoot, manifestPath)}`);
  }
  return JSON.parse(readFileSync(manifestPath, "utf8")) as ChromeManifest;
}

function validateManifest(manifest: ChromeManifest): string[] {
  const errors: string[] = [];
  if (manifest.manifest_version !== 3) {
    errors.push(`manifest_version must be 3, got ${manifest.manifest_version ?? "(missing)"}`);
  }
  if (!manifest.name) {
    errors.push("manifest.name is missing");
  }
  if (!manifest.version) {
    errors.push("manifest.version is missing");
  }
  if (!manifest.background?.service_worker) {
    errors.push("manifest.background.service_worker is missing");
  }
  for (const entry of requiredEntries) {
    if (!existsSync(resolve(extensionDir, entry))) {
      errors.push(`required artifact entry is missing: ${entry}`);
    }
  }
  return errors;
}

function listFiles(dir: string, root = dir): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listFiles(fullPath, root));
    } else if (stat.isFile()) {
      files.push(relative(root, fullPath));
    }
  }
  return files.sort();
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const startedAt = Date.now();
const outputPath =
  parseOutputPath() ??
  resolve(defaultArtifactDir, `browser-brain-loop-next-mv3-${currentShortHead()}.zip`);

mkdirSync(resolve(outputPath, ".."), { recursive: true });
rmSync(outputPath, { force: true });

assertCommand("bun", ["run", "build"]);

const manifest = readManifest();
const manifestErrors = validateManifest(manifest);
if (manifestErrors.length > 0) {
  throw new Error(manifestErrors.join("; "));
}

assertCommand("zip", ["-qry", outputPath, "."], extensionDir);

const output = {
  ok: true,
  generatedAt: new Date().toISOString(),
  durationMs: Date.now() - startedAt,
  command: "bun scripts/release-package-mv3.ts",
  artifact: relative(repoRoot, outputPath),
  sha256: sha256(outputPath),
  manifest: {
    name: manifest.name,
    version: manifest.version,
    manifest_version: manifest.manifest_version,
    service_worker: manifest.background?.service_worker,
  },
  files: listFiles(extensionDir),
};

console.log(JSON.stringify(output, null, 2));
