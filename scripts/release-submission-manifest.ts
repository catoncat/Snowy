#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type ChromeManifest = {
  background?: {
    service_worker?: string;
  };
  manifest_version?: number;
  minimum_chrome_version?: string;
  name?: string;
  permissions?: string[];
  sandbox?: {
    pages?: string[];
  };
  side_panel?: {
    default_path?: string;
  };
  version?: string;
};

export type ReleaseSubmissionManifestOptions = {
  artifactPath: string;
  channel?: string;
  repoRoot?: string;
  sourceCommit?: string;
  sourcePr?: string;
};

export type ReleaseSubmissionManifest = {
  schema_version: 1;
  generated_at: string;
  scope: "Browser Brain Loop Next MV3 extension external submission";
  source: {
    commit: string;
    pr: string | null;
  };
  submission: {
    channel: string;
    review_status: "ready_for_upload";
  };
  artifact: {
    path: string;
    sha256: string;
  };
  extension: {
    manifest_version?: number;
    name?: string;
    version?: string;
    minimum_chrome_version?: string;
    permissions: string[];
    service_worker?: string;
    sandbox_pages: string[];
    side_panel?: string;
  };
  packaged_files: string[];
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultArtifactPath = resolve(
  repoRoot,
  ".ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.zip",
);

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}${
        output ? `\n${output}` : ""
      }`,
    );
  }
  return result.stdout ?? "";
}

function git(args: string[], root: string): string {
  return run("git", args, root).trim();
}

function listZipEntries(artifactPath: string, root: string): string[] {
  return run("unzip", ["-Z1", artifactPath], root)
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry && !entry.endsWith("/"))
    .sort();
}

function readZipManifest(artifactPath: string, root: string): ChromeManifest {
  return JSON.parse(run("unzip", ["-p", artifactPath, "manifest.json"], root)) as ChromeManifest;
}

function resolveFromRoot(root: string, path: string): string {
  return resolve(root, path);
}

function relativeFromRoot(root: string, path: string): string {
  return relative(root, path) || ".";
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

export function parseReleaseSubmissionManifestCliOptions(
  argv: string[],
): ReleaseSubmissionManifestOptions & { output?: string } {
  return {
    artifactPath: readArgValue(argv, "--artifact") ?? defaultArtifactPath,
    channel: readArgValue(argv, "--channel"),
    output: readArgValue(argv, "--output"),
    sourcePr: readArgValue(argv, "--source-pr"),
  };
}

export function buildReleaseSubmissionManifest(
  options: ReleaseSubmissionManifestOptions,
): ReleaseSubmissionManifest {
  const root = options.repoRoot ?? repoRoot;
  const artifactPath = resolveFromRoot(root, options.artifactPath);
  if (!existsSync(artifactPath)) {
    throw new Error(`Release artifact is missing at ${artifactPath}`);
  }

  const manifest = readZipManifest(artifactPath, root);
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    scope: "Browser Brain Loop Next MV3 extension external submission",
    source: {
      commit: options.sourceCommit ?? git(["rev-parse", "HEAD"], root),
      pr: options.sourcePr ?? null,
    },
    submission: {
      channel: options.channel ?? "external-store-or-deployment",
      review_status: "ready_for_upload",
    },
    artifact: {
      path: relativeFromRoot(root, artifactPath),
      sha256: sha256(artifactPath),
    },
    extension: {
      manifest_version: manifest.manifest_version,
      name: manifest.name,
      version: manifest.version,
      minimum_chrome_version: manifest.minimum_chrome_version,
      permissions: manifest.permissions ?? [],
      service_worker: manifest.background?.service_worker,
      sandbox_pages: manifest.sandbox?.pages ?? [],
      side_panel: manifest.side_panel?.default_path,
    },
    packaged_files: listZipEntries(artifactPath, root),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseReleaseSubmissionManifestCliOptions(process.argv.slice(2));
    const manifest = buildReleaseSubmissionManifest(options);
    const json = `${JSON.stringify(manifest, null, 2)}\n`;
    if (options.output) {
      const outputPath = resolveFromRoot(repoRoot, options.output);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, json);
    } else {
      process.stdout.write(json);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
