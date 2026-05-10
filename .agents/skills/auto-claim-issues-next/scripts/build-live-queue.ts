#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type IssueFile,
  type Priority,
  dependenciesSatisfied,
  issueModuleId,
  issueModuleStage,
  issuePriority,
  loadAllIssues,
  readString,
  toIssueSummary,
} from "./claim-issue";
import {
  type ModuleLedger,
  getModuleRecord,
  loadModuleLedger,
  moduleStageRank,
} from "./module-ledger";
import { type LiveQueue, type QueueEntry, liveQueuePath } from "./ticket-machine";

const SCRIPT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
const BIOME_CONFIG_PATH = path.join(SCRIPT_REPO_ROOT, "biome.json");
const BIOME_EXECUTABLE_WRAPPER_PATH = path.join(
  SCRIPT_REPO_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "biome.cmd" : "biome",
);
const BIOME_FORMAT_TIMEOUT_MS = 5000;
const requireFromScript = createRequire(import.meta.url);

const BIOME_NATIVE_EXECUTABLES: Record<string, string> = {
  "darwin-arm64": "@biomejs/cli-darwin-arm64/biome",
  "darwin-x64": "@biomejs/cli-darwin-x64/biome",
  "linux-arm64": "@biomejs/cli-linux-arm64/biome",
  "linux-x64": "@biomejs/cli-linux-x64/biome",
  "win32-arm64": "@biomejs/cli-win32-arm64/biome.exe",
  "win32-x64": "@biomejs/cli-win32-x64/biome.exe",
};

export interface BuildLiveQueueArgs {
  repoRoot: string;
  dryRun: boolean;
  json: boolean;
}

export interface BuildLiveQueueResult {
  kind: "preview" | "built";
  outputPath: string;
  entryCount: number;
  queue: LiveQueue;
}

function priorityRank(priority: Priority): number {
  if (priority === "p0") {
    return 0;
  }
  if (priority === "p1") {
    return 1;
  }
  return 2;
}

function compareQueueOrder(left: IssueFile, right: IssueFile, moduleLedger: ModuleLedger): number {
  const leftModule = getModuleRecord(moduleLedger, issueModuleId(left));
  const rightModule = getModuleRecord(moduleLedger, issueModuleId(right));
  const stageDelta =
    moduleStageRank(issueModuleStage(left)) - moduleStageRank(issueModuleStage(right));
  if (stageDelta !== 0) {
    return stageDelta;
  }

  const leftOrder = leftModule?.tracking_order ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = rightModule?.tracking_order ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const priorityDelta = priorityRank(issuePriority(left)) - priorityRank(issuePriority(right));
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const createdDelta = readString(left, "created").localeCompare(readString(right, "created"));
  if (createdDelta !== 0) {
    return createdDelta;
  }

  return readString(left, "id").localeCompare(readString(right, "id"));
}

function queueEntryFromIssue(repoRoot: string, issue: IssueFile): QueueEntry {
  const summary = toIssueSummary(issue);
  return {
    issue_id: summary.id,
    issue_path: path.relative(repoRoot, issue.path),
    title: summary.title,
    parallel_group: summary.parallel_group,
    module_id: summary.module_id,
    module_stage: summary.module_stage,
    tracking_kind: summary.tracking_kind,
    check_cmd: summary.check_cmd,
    depends_on: summary.depends_on,
    write_scope: summary.write_scope,
  };
}

export function resolveBiomeExecutablePath(): string {
  const nativePackage = BIOME_NATIVE_EXECUTABLES[`${process.platform}-${process.arch}`];
  if (nativePackage) {
    try {
      return requireFromScript.resolve(nativePackage);
    } catch {
      // Fall back to the package wrapper below. The formatter call is still
      // time-bounded so a broken wrapper cannot hang queue rebuild forever.
    }
  }

  return BIOME_EXECUTABLE_WRAPPER_PATH;
}

function resolveCanonicalRepoRoot(repoRoot: string): string {
  const gitPath = path.join(repoRoot, ".git");
  try {
    const stats = statSync(gitPath);
    if (stats.isDirectory()) {
      return repoRoot;
    }
    if (stats.isFile()) {
      const match = readFileSync(gitPath, "utf8").match(/^gitdir:\s*(.+)\s*$/i);
      if (!match?.[1]) {
        return repoRoot;
      }
      const gitDir = path.resolve(repoRoot, match[1].trim());
      const parentDir = path.dirname(gitDir);
      if (path.basename(parentDir) === "worktrees") {
        return path.dirname(path.dirname(parentDir));
      }
    }
  } catch {}
  return repoRoot;
}

function formatQueueJson(outputPath: string, queue: LiveQueue, repoRoot: string): string {
  const relativeOutputPath = path.relative(repoRoot, outputPath) || path.basename(outputPath);
  const raw = `${JSON.stringify(queue, null, 2)}\n`;
  const biomeExecutable = resolveBiomeExecutablePath();
  try {
    return execFileSync(
      biomeExecutable,
      ["format", `--config-path=${BIOME_CONFIG_PATH}`, `--stdin-file-path=${relativeOutputPath}`],
      {
        cwd: repoRoot,
        encoding: "utf8",
        input: raw,
        timeout: BIOME_FORMAT_TIMEOUT_MS,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to format ${relativeOutputPath} with Biome: ${message}`);
  }
}

export function buildLiveQueue(args: BuildLiveQueueArgs): BuildLiveQueueResult {
  const moduleLedger = loadModuleLedger(args.repoRoot);
  const issues = loadAllIssues(args.repoRoot, {
    moduleLedger,
    validateModuleMetadata: true,
  });

  const readyIssues = issues
    .filter((issue) => readString(issue, "status") === "open")
    .filter((issue) => dependenciesSatisfied(issue, issues))
    .sort((left, right) => compareQueueOrder(left, right, moduleLedger));

  const entries = readyIssues.map((issue) => queueEntryFromIssue(args.repoRoot, issue));

  const queue: LiveQueue = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    repo_root: resolveCanonicalRepoRoot(args.repoRoot),
    entries,
  };

  const outputPath = liveQueuePath(args.repoRoot);
  if (!args.dryRun) {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, formatQueueJson(outputPath, queue, args.repoRoot), "utf8");
  }

  return {
    kind: args.dryRun ? "preview" : "built",
    outputPath: path.relative(args.repoRoot, outputPath),
    entryCount: queue.entries.length,
    queue,
  };
}

function parseArgs(argv: string[], cwd = process.cwd()): BuildLiveQueueArgs {
  const out: BuildLiveQueueArgs = {
    repoRoot: cwd,
    dryRun: false,
    json: false,
  };

  for (const item of argv) {
    if (item === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (item === "--json") {
      out.json = true;
    }
  }

  return out;
}

function printResult(result: BuildLiveQueueResult, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`result: ${result.kind}`);
  console.log(`outputPath: ${result.outputPath}`);
  console.log(`entryCount: ${result.entryCount}`);
  for (const entry of result.queue.entries) {
    console.log(`- ${entry.issue_id} ${entry.title}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = buildLiveQueue(args);
  printResult(result, args.json);
}

if (import.meta.main) {
  main();
}
