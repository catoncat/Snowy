import { describe, expect, it } from "vitest";

import {
  type CommandResult,
  buildReleaseSubmissionPrepareCommands,
  parseReleaseSubmissionPrepareCliOptions,
  prepareReleaseSubmission,
} from "../../../scripts/release-submission-prepare";

describe("release submission prepare", () => {
  it("builds the pre-submission command plan in gate/package/manifest order", () => {
    const options = parseReleaseSubmissionPrepareCliOptions([
      "--artifact",
      ".ml-cache/release-artifacts/submission.zip",
      "--manifest",
      ".ml-cache/release-artifacts/submission.manifest.json",
      "--channel",
      "chrome-web-store",
      "--source-pr",
      "https://github.com/catoncat/Snowy/pull/14",
    ]);

    expect(buildReleaseSubmissionPrepareCommands(options)).toEqual([
      {
        label: "cutover_status",
        command: "bun",
        args: ["run", "release:cutover:status"],
      },
      {
        label: "package_mv3",
        command: "bun",
        args: [
          "run",
          "release:package:mv3",
          "--",
          "--output",
          ".ml-cache/release-artifacts/submission.zip",
        ],
      },
      {
        label: "submission_manifest",
        command: "bun",
        args: [
          "run",
          "release:submission:manifest",
          "--",
          "--artifact",
          ".ml-cache/release-artifacts/submission.zip",
          "--channel",
          "chrome-web-store",
          "--output",
          ".ml-cache/release-artifacts/submission.manifest.json",
          "--source-pr",
          "https://github.com/catoncat/Snowy/pull/14",
        ],
      },
    ]);
  });

  it("stops before packaging when the cutover gate is not green", () => {
    const calls: string[] = [];
    const result = prepareReleaseSubmission(
      {
        artifactPath: ".ml-cache/release-artifacts/submission.zip",
        manifestPath: ".ml-cache/release-artifacts/submission.manifest.json",
        channel: "chrome-web-store",
      },
      {
        runCommand: (command, args): CommandResult => {
          calls.push([command, ...args].join(" "));
          return {
            ok: false,
            status: 1,
            stdout: JSON.stringify({
              ok: false,
              blockers: ["live queue still has 1 entry"],
            }),
            stderr: "",
          };
        },
        readTextFile: () => {
          throw new Error("manifest should not be read when gate fails");
        },
        now: () => new Date("2026-05-27T04:00:00.000Z"),
      },
    );

    expect(calls).toEqual(["bun run release:cutover:status"]);
    expect(result).toMatchObject({
      ok: false,
      failedStep: "cutover_status",
      blockers: ["live queue still has 1 entry"],
    });
  });

  it("returns an upload-ready bundle after gate, package, and manifest complete", () => {
    const calls: string[] = [];
    const manifestJson = JSON.stringify({
      generated_at: "2026-05-27T04:01:00.000Z",
      submission: {
        channel: "chrome-web-store",
        review_status: "ready_for_upload",
      },
      artifact: {
        path: ".ml-cache/release-artifacts/submission.zip",
        sha256: "abc123",
      },
    });

    const result = prepareReleaseSubmission(
      {
        artifactPath: ".ml-cache/release-artifacts/submission.zip",
        manifestPath: ".ml-cache/release-artifacts/submission.manifest.json",
        channel: "chrome-web-store",
        sourcePr: "https://github.com/catoncat/Snowy/pull/14",
      },
      {
        runCommand: (command, args): CommandResult => {
          calls.push([command, ...args].join(" "));
          if (args.includes("release:cutover:status")) {
            return {
              ok: true,
              status: 0,
              stdout: JSON.stringify({
                ok: true,
                generatedAt: "2026-05-27T04:00:30.000Z",
                blockers: [],
              }),
              stderr: "",
            };
          }
          if (args.includes("release:package:mv3")) {
            return {
              ok: true,
              status: 0,
              stdout: JSON.stringify({
                ok: true,
                artifact: ".ml-cache/release-artifacts/submission.zip",
                sha256: "abc123",
              }),
              stderr: "",
            };
          }
          return { ok: true, status: 0, stdout: "", stderr: "" };
        },
        readTextFile: () => manifestJson,
        now: () => new Date("2026-05-27T04:02:00.000Z"),
      },
    );

    expect(calls).toEqual([
      "bun run release:cutover:status",
      "bun run release:package:mv3 -- --output .ml-cache/release-artifacts/submission.zip",
      "bun run release:submission:manifest -- --artifact .ml-cache/release-artifacts/submission.zip --channel chrome-web-store --output .ml-cache/release-artifacts/submission.manifest.json --source-pr https://github.com/catoncat/Snowy/pull/14",
    ]);
    expect(result).toMatchObject({
      ok: true,
      generatedAt: "2026-05-27T04:02:00.000Z",
      channel: "chrome-web-store",
      artifact: {
        path: ".ml-cache/release-artifacts/submission.zip",
        sha256: "abc123",
      },
      manifest: {
        path: ".ml-cache/release-artifacts/submission.manifest.json",
        generatedAt: "2026-05-27T04:01:00.000Z",
        reviewStatus: "ready_for_upload",
      },
      nextActions: [
        "upload artifact.path and manifest.path to the selected external store/deployment channel",
        "record the external submission result in docs/external-release-submission-packet-2026-05-27.md",
      ],
    });
  });
});
