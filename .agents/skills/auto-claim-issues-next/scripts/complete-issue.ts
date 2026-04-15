import { execFileSync } from "node:child_process";

import { buildLiveQueue } from "./build-live-queue";
import {
  type IssueFile,
  findById,
  isNamedAgentAssignee,
  loadAllIssues,
  writeIssueFile,
} from "./claim-issue";
import { loadModuleLedger } from "./module-ledger";
import { type TicketLease, loadLeaseState, releaseTicket } from "./ticket-machine";

interface CommitRecord {
  hash: string;
  subject: string;
}

interface ParsedArgs {
  assignee: string;
  issueId?: string;
  commits: string[];
  implemented: string[];
  checks: string[];
  risks: string[];
  json: boolean;
}

interface CompleteIssueArgs {
  repoRoot: string;
  assignee: string;
  issueId?: string;
  commits: CommitRecord[];
  implemented: string[];
  checks: string[];
  risks: string[];
  leaseRootDir?: string;
}

interface CompleteIssueResult {
  issueId: string;
  issuePath: string;
  releasedLease: boolean;
  queueEntryCount: number;
}

function fail(message: string): never {
  console.error(`[workflow:done] ${message}`);
  process.exit(1);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    assignee: String(process.env.BBL_AGENT_NAME || "").trim(),
    commits: [],
    implemented: [],
    checks: [],
    risks: [],
    json: false,
  };

  for (const item of argv) {
    if (item === "--json") {
      out.json = true;
      continue;
    }
    if (!item.startsWith("--")) {
      continue;
    }
    const eq = item.indexOf("=");
    const key = eq >= 0 ? item.slice(2, eq) : item.slice(2);
    const value = eq >= 0 ? item.slice(eq + 1).trim() : "";
    if (!value) {
      continue;
    }
    if (key === "issue") out.issueId = value;
    if (key === "name" || key === "assignee") out.assignee = value;
    if (key === "commit") out.commits.push(value);
    if (key === "implemented") out.implemented.push(value);
    if (key === "check") out.checks.push(value);
    if (key === "risk") out.risks.push(value);
  }

  return out;
}

export function resolveCommitRefs(repoRoot: string, refs: string[]): CommitRecord[] {
  if (refs.length === 0) {
    throw new Error("workflow:done requires at least one --commit");
  }
  return refs.map((ref) => {
    const hash = execFileSync("git", ["rev-parse", "--short=12", ref], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    const subject = execFileSync("git", ["show", "-s", "--format=%s", ref], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    return { hash, subject };
  });
}

function sessionIdForAssignee(assignee: string): string {
  return `cli:${assignee}`;
}

function resolveLeaseForAssignee(
  leasesBySession: Record<string, TicketLease>,
  assignee: string,
  issueId?: string,
): { sessionId: string; lease: TicketLease } | null {
  const preferredSessionId = sessionIdForAssignee(assignee);
  const preferredLease = leasesBySession[preferredSessionId];

  if (preferredLease && (!issueId || preferredLease.issue_id === issueId)) {
    return {
      sessionId: preferredSessionId,
      lease: preferredLease,
    };
  }

  const matches = Object.entries(leasesBySession).filter(
    ([, lease]) => lease.agent_name === assignee && (!issueId || lease.issue_id === issueId),
  );

  if (matches.length === 1) {
    const [sessionId, lease] = matches[0];
    return { sessionId, lease };
  }

  return null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function upsertSection(body: string, heading: string, content: string): string {
  const cleanBody = body.replace(/\s*$/, "");
  const section = `## ${heading}\n\n${content.trim()}\n`;
  const pattern = new RegExp(
    `(?:^|\\n)## ${escapeRegExp(heading)}\\n[\\s\\S]*?(?=\\n## [^\\n]+\\n|$)`,
    "m",
  );

  if (pattern.test(cleanBody)) {
    return cleanBody.replace(pattern, `\n${section}`).replace(/^\n/, "");
  }

  return cleanBody ? `${cleanBody}\n\n${section}` : section;
}

function markdownList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function buildWorkSummary(implemented: string[], checks: string[], risks: string[]): string {
  return [
    "### 实现了什么",
    markdownList(implemented),
    "",
    "### 实际跑了什么检查",
    markdownList(checks),
    "",
    "### 残留风险",
    markdownList(risks.length > 0 ? risks : ["无"]),
  ].join("\n");
}

function buildCommitSection(commits: CommitRecord[]): string {
  return markdownList(commits.map((commit) => `\`${commit.hash}\` ${commit.subject}`));
}

function rewriteIssue(issue: IssueFile, args: CompleteIssueArgs): void {
  issue.frontmatter.data.status = "done";
  issue.frontmatter.data.assignee = args.assignee;
  issue.frontmatter.data.completed_at = new Date().toISOString();
  if (!issue.frontmatter.order.includes("completed_at")) {
    issue.frontmatter.order.push("completed_at");
  }

  issue.body = upsertSection(
    upsertSection(
      issue.body,
      "工作总结",
      buildWorkSummary(args.implemented, args.checks, args.risks),
    ),
    "相关 commits",
    buildCommitSection(args.commits),
  );
}

function writeIssue(issue: IssueFile): void {
  writeIssueFile(issue);
}

export async function completeIssue(args: CompleteIssueArgs): Promise<CompleteIssueResult> {
  if (!isNamedAgentAssignee(args.assignee)) {
    throw new Error("workflow:done requires --name=<agent-name> or BBL_AGENT_NAME");
  }
  if (args.commits.length === 0) {
    throw new Error("workflow:done requires at least one --commit");
  }
  if (args.implemented.length === 0) {
    throw new Error("workflow:done requires at least one --implemented");
  }
  if (args.checks.length === 0) {
    throw new Error("workflow:done requires at least one --check");
  }

  const state = loadLeaseState(
    args.repoRoot,
    args.leaseRootDir ? { leaseRootDir: args.leaseRootDir } : undefined,
  );
  const resolvedLease = resolveLeaseForAssignee(
    state.leases_by_session,
    args.assignee,
    args.issueId,
  );
  const sessionId = resolvedLease?.sessionId;
  const lease = resolvedLease?.lease;
  const targetIssueId = args.issueId ?? lease?.issue_id;
  if (!targetIssueId) {
    throw new Error(
      "workflow:done could not infer issue from current lease; pass --issue=ISSUE-xxx",
    );
  }
  if (lease && lease.issue_id !== targetIssueId) {
    throw new Error(
      `workflow:done issue mismatch: current lease owns ${lease.issue_id}, not ${targetIssueId}`,
    );
  }
  if (!lease || !sessionId) {
    throw new Error(`workflow:done found no active lease for ${args.assignee}`);
  }

  const moduleLedger = loadModuleLedger(args.repoRoot);
  const issues = loadAllIssues(args.repoRoot, {
    moduleLedger,
    validateModuleMetadata: true,
  });
  const issue = findById(issues, targetIssueId);
  if (!issue) {
    throw new Error(`workflow:done could not find issue file for ${targetIssueId}`);
  }

  rewriteIssue(issue, args);
  writeIssue(issue);

  const releasedLease = await releaseTicket(
    args.repoRoot,
    sessionId,
    args.leaseRootDir ? { leaseRootDir: args.leaseRootDir } : undefined,
  );
  const queue = buildLiveQueue({
    repoRoot: args.repoRoot,
    dryRun: false,
    json: false,
  });

  return {
    issueId: targetIssueId,
    issuePath: issue.path,
    releasedLease,
    queueEntryCount: queue.entryCount,
  };
}

function printResult(result: CompleteIssueResult, asJson: boolean) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("result: done");
  console.log(`issueId: ${result.issueId}`);
  console.log(`issuePath: ${result.issuePath}`);
  console.log(`releasedLease: ${result.releasedLease ? "yes" : "no"}`);
  console.log(`queueEntryCount: ${result.queueEntryCount}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const result = await completeIssue({
      repoRoot: process.cwd(),
      assignee: args.assignee,
      issueId: args.issueId,
      commits: resolveCommitRefs(process.cwd(), args.commits),
      implemented: args.implemented,
      checks: args.checks,
      risks: args.risks,
    });
    printResult(result, args.json);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

if (import.meta.main) {
  void main();
}
