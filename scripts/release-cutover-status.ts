#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type CommandResult = {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
};

type AcceptanceResult = {
  ok?: boolean;
  generatedAt?: string;
  scope?: string;
  nextDecisionBoundary?: string[];
};

type QueueState = {
  entries?: unknown[];
};

type LeaseState = {
  leases_by_session?: Record<string, unknown>;
  leases_by_issue?: Record<string, unknown>;
};

type ReleaseDecisionState = {
  packet: string;
  recorded: boolean;
  oldMainlineSwitched: boolean;
  acceptedAt: string | null;
  acceptedBy: string | null;
  mergedPr: string | null;
  mergeCommit: string | null;
  oldMainlineSwitchPr: string | null;
  oldMainlineSwitchCommit: string | null;
  oldMainlineStatus: string | null;
  remainingBoundary: string | null;
  currentAcceptedMainCommit: string | null;
  missingReason?: string;
};

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const leasePath = resolve(homedir(), ".codex/workflow-leases/browser-brain-loop-next.json");
const releaseDecisionPacket = "docs/release-cutover-decision-packet-2026-05-27.md";

function run(command: string, args: string[]): CommandResult {
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

function runGit(args: string[]): CommandResult {
  return run("git", args);
}

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/)[0] ?? "";
}

function parseJson<T>(text: string): T {
  return JSON.parse(text.trim()) as T;
}

function readJsonFile<T>(relativeOrAbsolutePath: string): T {
  return parseJson<T>(readTextFile(relativeOrAbsolutePath));
}

function readTextFile(relativeOrAbsolutePath: string): string {
  const fullPath = relativeOrAbsolutePath.startsWith("/")
    ? relativeOrAbsolutePath
    : resolve(repoRoot, relativeOrAbsolutePath);
  return readFileSync(fullPath, "utf8");
}

function extractBulletValue(text: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^- ${escapedKey}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function stripInlineCode(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.replace(/^`|`$/g, "");
}

export function parseReleaseDecisionState(
  packet: string,
  packetText: string,
): ReleaseDecisionState {
  const acceptedAt = extractBulletValue(packetText, "accepted_at");
  const acceptedBy = extractBulletValue(packetText, "accepted_by");
  const decision = extractBulletValue(packetText, "decision");
  const oldMainlineStatus = extractBulletValue(packetText, "old_mainline_status");
  const oldMainlineStatusText = oldMainlineStatus ?? "";
  const recorded =
    acceptedAt !== null &&
    decision !== null &&
    decision.includes("accept the repo-side Level 2 evidence pack");
  const oldMainlineSwitched =
    oldMainlineStatusText.includes("maintenance") && oldMainlineStatusText.includes("reference");
  return {
    packet,
    recorded,
    oldMainlineSwitched,
    acceptedAt,
    acceptedBy,
    mergedPr: extractBulletValue(packetText, "merged_pr"),
    mergeCommit: stripInlineCode(extractBulletValue(packetText, "merge_commit")),
    oldMainlineSwitchPr: extractBulletValue(packetText, "old_mainline_switch_pr"),
    oldMainlineSwitchCommit: stripInlineCode(
      extractBulletValue(packetText, "old_mainline_switch_commit"),
    ),
    oldMainlineStatus,
    remainingBoundary: extractBulletValue(packetText, "remaining_boundary"),
    currentAcceptedMainCommit: stripInlineCode(
      extractBulletValue(packetText, "current accepted main commit"),
    ),
  };
}

function collectReleaseDecisionState(): ReleaseDecisionState {
  try {
    const packetText = readTextFile(releaseDecisionPacket);
    return parseReleaseDecisionState(releaseDecisionPacket, packetText);
  } catch (error) {
    return {
      packet: releaseDecisionPacket,
      recorded: false,
      oldMainlineSwitched: false,
      acceptedAt: null,
      acceptedBy: null,
      mergedPr: null,
      mergeCommit: null,
      oldMainlineSwitchPr: null,
      oldMainlineSwitchCommit: null,
      oldMainlineStatus: null,
      remainingBoundary: null,
      currentAcceptedMainCommit: null,
      missingReason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildReadyNextActions(releaseDecision: ReleaseDecisionState): string[] {
  if (!releaseDecision.recorded) {
    return [
      "record the external acceptance decision next to the release cutover packet",
      "use the accepted branch/PR/release process to switch the old browser plugin mainline",
    ];
  }
  if (!releaseDecision.oldMainlineSwitched) {
    return [
      "use the accepted branch/PR/release process to switch the old browser plugin mainline",
      "keep bun run release:acceptance as the pre-cutover repo-side evidence gate",
    ];
  }
  return [
    "continue only through external store/deployment submission, or define exactly one human real-profile UAT if required",
    "keep bun run release:acceptance and bun run release:cutover:status as the pre-submission gates",
    "do not create default deferred implementation issues while the repo-side gate stays green",
  ];
}

function collectAcceptance() {
  const command = run("bun", ["scripts/release-acceptance.ts"]);
  let data: AcceptanceResult | null = null;
  let parseError: string | null = null;
  if (command.stdout.trim()) {
    try {
      data = parseJson<AcceptanceResult>(command.stdout);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    ok: command.ok && data?.ok === true,
    command: "bun scripts/release-acceptance.ts",
    status: command.status,
    ...(data ? { data } : {}),
    ...(parseError ? { parseError } : {}),
    ...(command.stderr.trim()
      ? { stderrTail: command.stderr.trim().split(/\r?\n/).slice(-12) }
      : {}),
  };
}

function collectGitState() {
  const branch = firstLine(runGit(["rev-parse", "--abbrev-ref", "HEAD"]).stdout);
  const head = firstLine(runGit(["rev-parse", "HEAD"]).stdout);
  const originUrl = firstLine(runGit(["remote", "get-url", "origin"]).stdout);
  const status = runGit(["status", "--porcelain"]).stdout.trim();
  const upstreamResult = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  const upstream = upstreamResult.ok ? firstLine(upstreamResult.stdout) : null;
  let ahead = 0;
  let behind = 0;
  let upstreamHead: string | null = null;
  if (upstream) {
    const counts = firstLine(
      runGit(["rev-list", "--left-right", "--count", `${upstream}...HEAD`]).stdout,
    )
      .split(/\s+/)
      .map((item) => Number.parseInt(item, 10));
    behind = Number.isFinite(counts[0]) ? counts[0] : 0;
    ahead = Number.isFinite(counts[1]) ? counts[1] : 0;
    upstreamHead = firstLine(runGit(["rev-parse", upstream]).stdout);
  }
  return {
    branch,
    head,
    originUrl,
    upstream,
    upstreamHead,
    ahead,
    behind,
    clean: status.length === 0,
    statusLines: status ? status.split(/\r?\n/) : [],
  };
}

function collectWorkflowState() {
  const queue = readJsonFile<QueueState>("docs/workflow/live-queue.json");
  const lease = existsSync(leasePath) ? readJsonFile<LeaseState>(leasePath) : {};
  const queueEntries = queue.entries?.length ?? 0;
  const activeLeaseSessions = Object.keys(lease.leases_by_session ?? {});
  const activeLeaseIssues = Object.keys(lease.leases_by_issue ?? {});
  return {
    queueEntries,
    activeLeaseSessions,
    activeLeaseIssues,
    noActiveDispatchWork: queueEntries === 0 && activeLeaseSessions.length === 0,
  };
}

function main(): void {
  const acceptance = collectAcceptance();
  const git = collectGitState();
  const workflow = collectWorkflowState();
  const releaseDecision = collectReleaseDecisionState();
  const blockers: string[] = [];

  if (!acceptance.ok) {
    blockers.push("repo-side release acceptance evidence is not green");
  }
  if (!git.clean) {
    blockers.push("worktree has uncommitted changes");
  }
  if (!git.upstream) {
    blockers.push("current branch has no upstream");
  }
  if (git.behind > 0) {
    blockers.push(`current branch is behind upstream by ${git.behind} commit(s)`);
  }
  if (git.ahead > 0) {
    blockers.push(`current branch has ${git.ahead} local commit(s) not on upstream`);
  }
  if (git.branch === "main" && git.ahead > 0) {
    blockers.push(
      "local main is ahead of origin/main; choose a release branch/PR path or explicitly approve a main push before external cutover",
    );
  }
  if (workflow.queueEntries > 0) {
    blockers.push(`live queue still has ${workflow.queueEntries} entry/entries`);
  }
  if (workflow.activeLeaseSessions.length > 0) {
    blockers.push(`active workflow leases remain: ${workflow.activeLeaseSessions.join(", ")}`);
  }

  const readyForExternalCutover = blockers.length === 0;
  const nextActions = readyForExternalCutover
    ? buildReadyNextActions(releaseDecision)
    : [
        "do not create default deferred implementation issues while blockers are delivery/publication boundaries",
        "if the only blocker is unpublished commits, choose a release branch/PR path or get explicit approval for the release push",
        "if a human wants more evidence, define exactly one additional real browser/profile UAT scenario before opening work",
      ];

  const result = {
    ok: readyForExternalCutover,
    generatedAt: new Date().toISOString(),
    scope: "external release / old-mainline cutover status gate",
    acceptance,
    git,
    workflow,
    releaseDecision,
    blockers,
    nextActions,
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(readyForExternalCutover ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
