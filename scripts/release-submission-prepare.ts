#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ReleaseSubmissionPrepareOptions = {
  artifactPath: string;
  manifestPath: string;
  channel: string;
  sourcePr?: string;
};

export type PreparedCommand = {
  label: "cutover_status" | "package_mv3" | "submission_manifest";
  command: string;
  args: string[];
};

export type CommandResult = {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
};

export type PrepareEnvironment = {
  runCommand?: (command: string, args: string[]) => CommandResult;
  readTextFile?: (path: string) => string;
  now?: () => Date;
};

type JsonRecord = Record<string, unknown>;

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const defaultArtifactPath =
  ".ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.zip";
const defaultManifestPath =
  ".ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.manifest.json";
const defaultChannel = "external-store-or-deployment";

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

export function parseReleaseSubmissionPrepareCliOptions(
  argv: string[],
): ReleaseSubmissionPrepareOptions {
  return {
    artifactPath: readArgValue(argv, "--artifact") ?? defaultArtifactPath,
    manifestPath: readArgValue(argv, "--manifest") ?? defaultManifestPath,
    channel: readArgValue(argv, "--channel") ?? defaultChannel,
    sourcePr: readArgValue(argv, "--source-pr"),
  };
}

export function buildReleaseSubmissionPrepareCommands(
  options: ReleaseSubmissionPrepareOptions,
): PreparedCommand[] {
  const manifestArgs = [
    "run",
    "release:submission:manifest",
    "--",
    "--artifact",
    options.artifactPath,
    "--channel",
    options.channel,
    "--output",
    options.manifestPath,
  ];
  if (options.sourcePr) {
    manifestArgs.push("--source-pr", options.sourcePr);
  }
  return [
    {
      label: "cutover_status",
      command: "bun",
      args: ["run", "release:cutover:status"],
    },
    {
      label: "package_mv3",
      command: "bun",
      args: ["run", "release:package:mv3", "--", "--output", options.artifactPath],
    },
    {
      label: "submission_manifest",
      command: "bun",
      args: manifestArgs,
    },
  ];
}

function runCommand(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
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

function readTextFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function extractJson(text: string): JsonRecord | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return JSON.parse(text.slice(start, end + 1)) as JsonRecord;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function commandLine(command: PreparedCommand): string {
  return [command.command, ...command.args].join(" ");
}

function commandFailure(
  command: PreparedCommand,
  result: CommandResult,
  parsed: JsonRecord | null,
  generatedAt: string,
) {
  const blockers = stringArrayValue(parsed?.blockers);
  return {
    ok: false as const,
    generatedAt,
    scope: "Browser Brain Loop Next MV3 extension external submission prepare",
    failedStep: command.label,
    command: commandLine(command),
    status: result.status,
    blockers:
      blockers.length > 0
        ? blockers
        : [`${command.label} failed with status ${result.status ?? "unknown"}`],
    stdoutTail: result.stdout.trim().split(/\r?\n/).filter(Boolean).slice(-12),
    stderrTail: result.stderr.trim().split(/\r?\n/).filter(Boolean).slice(-12),
  };
}

export function prepareReleaseSubmission(
  options: ReleaseSubmissionPrepareOptions,
  env: PrepareEnvironment = {},
) {
  const runner = env.runCommand ?? runCommand;
  const reader = env.readTextFile ?? readTextFile;
  const generatedAt = (env.now ?? (() => new Date()))().toISOString();
  const commands = buildReleaseSubmissionPrepareCommands(options);
  const [gateCommand, packageCommand, manifestCommand] = commands;

  const gateResult = runner(gateCommand.command, gateCommand.args);
  const gate = extractJson(gateResult.stdout);
  if (!gateResult.ok || gate?.ok !== true) {
    return commandFailure(gateCommand, gateResult, gate, generatedAt);
  }

  const packageResult = runner(packageCommand.command, packageCommand.args);
  const packageData = extractJson(packageResult.stdout);
  if (!packageResult.ok || packageData?.ok !== true) {
    return commandFailure(packageCommand, packageResult, packageData, generatedAt);
  }

  const manifestResult = runner(manifestCommand.command, manifestCommand.args);
  const manifestCommandData = extractJson(manifestResult.stdout);
  if (!manifestResult.ok) {
    return commandFailure(manifestCommand, manifestResult, manifestCommandData, generatedAt);
  }

  const manifest = JSON.parse(reader(options.manifestPath)) as JsonRecord;
  const manifestArtifact = (manifest.artifact ?? {}) as JsonRecord;
  const manifestSubmission = (manifest.submission ?? {}) as JsonRecord;

  return {
    ok: true as const,
    generatedAt,
    scope: "Browser Brain Loop Next MV3 extension external submission prepare",
    channel: options.channel,
    gate: {
      generatedAt: stringValue(gate.generatedAt),
      blockers: stringArrayValue(gate.blockers),
    },
    artifact: {
      path:
        stringValue(packageData.artifact) ??
        stringValue(manifestArtifact.path) ??
        options.artifactPath,
      sha256: stringValue(packageData.sha256) ?? stringValue(manifestArtifact.sha256),
    },
    manifest: {
      path: options.manifestPath,
      generatedAt: stringValue(manifest.generated_at),
      reviewStatus: stringValue(manifestSubmission.review_status),
    },
    commands,
    nextActions: [
      "upload artifact.path and manifest.path to the selected external store/deployment channel",
      "record the external submission result in docs/external-release-submission-packet-2026-05-27.md",
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseReleaseSubmissionPrepareCliOptions(process.argv.slice(2));
    const result = prepareReleaseSubmission(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
