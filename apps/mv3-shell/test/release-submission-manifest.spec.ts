import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildReleaseSubmissionManifest } from "../../../scripts/release-submission-manifest";

function writeZipFixture(root: string): string {
  const payloadDir = join(root, "payload");
  mkdirSync(join(payloadDir, "src"), { recursive: true });
  writeFileSync(
    join(payloadDir, "manifest.json"),
    JSON.stringify(
      {
        manifest_version: 3,
        name: "白雪 Snowy - AI 浏览器助手",
        version: "0.0.1",
        description:
          "用自然语言操控网页的 AI 助手。填表、点击、提取数据、后台自动化——装上就能用，开源免费。",
        minimum_chrome_version: "116",
        permissions: ["storage", "tabs"],
        background: { service_worker: "src/background.js" },
        side_panel: { default_path: "src/sidepanel.html" },
        sandbox: { pages: ["src/runner-sandbox.html"] },
        action: {
          default_title: "白雪 Snowy",
          default_icon: {
            "16": "icon-16.png",
            "48": "icon-48.png",
            "128": "icon-128.png",
          },
        },
      },
      null,
      2,
    ),
  );
  for (const file of ["background.js", "runner-sandbox.html", "sidepanel.html"]) {
    writeFileSync(join(payloadDir, "src", file), "");
  }
  for (const icon of ["icon-16.png", "icon-48.png", "icon-128.png"]) {
    writeFileSync(join(payloadDir, icon), icon);
  }

  const artifactPath = join(root, "submission.zip");
  const zip = spawnSync("zip", ["-X", "-qry", artifactPath, "."], {
    cwd: payloadDir,
    encoding: "utf8",
  });
  expect(zip.status).toBe(0);
  return artifactPath;
}

describe("release submission manifest", () => {
  it("builds a store handoff manifest from the packaged extension zip", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "bbl-submission-manifest-"));
    const artifactPath = writeZipFixture(repoRoot);
    const sha256 = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");

    const manifest = buildReleaseSubmissionManifest({
      artifactPath,
      channel: "chrome-web-store",
      repoRoot,
      sourceCommit: "abc1234",
      sourcePr: "https://github.com/catoncat/Snowy/pull/11",
    });

    expect(manifest).toMatchObject({
      schema_version: 1,
      scope: "Browser Brain Loop Next MV3 extension external submission",
      source: {
        commit: "abc1234",
        pr: "https://github.com/catoncat/Snowy/pull/11",
      },
      submission: {
        channel: "chrome-web-store",
        review_status: "ready_for_upload",
      },
      artifact: {
        path: "submission.zip",
        sha256,
      },
      extension: {
        manifest_version: 3,
        name: "白雪 Snowy - AI 浏览器助手",
        version: "0.0.1",
        description:
          "用自然语言操控网页的 AI 助手。填表、点击、提取数据、后台自动化——装上就能用，开源免费。",
        minimum_chrome_version: "116",
        permissions: ["storage", "tabs"],
        service_worker: "src/background.js",
        sandbox_pages: ["src/runner-sandbox.html"],
        side_panel: "src/sidepanel.html",
        action: {
          default_title: "白雪 Snowy",
          default_icon: {
            "16": "icon-16.png",
            "48": "icon-48.png",
            "128": "icon-128.png",
          },
        },
      },
      packaged_files: [
        "icon-128.png",
        "icon-16.png",
        "icon-48.png",
        "manifest.json",
        "src/background.js",
        "src/runner-sandbox.html",
        "src/sidepanel.html",
      ],
    });
    expect(manifest.generated_at).toEqual(expect.any(String));
  });
});
