import { describe, expect, it } from "vitest";

import {
  defaultExternalSubmissionArtifact,
  parseReleaseSmokeCliOptions,
} from "../../../scripts/release-smoke-mv3-real-browser";

describe("release smoke CLI options", () => {
  it("parses artifact and user profile arguments", () => {
    expect(
      parseReleaseSmokeCliOptions([
        "--artifact",
        ".ml-cache/release-artifacts/submission.zip",
        "--user-data-dir=/tmp/bbl-profile",
        "--keep-profile",
        "--scenario",
        "real-profile-uat",
      ]),
    ).toEqual({
      artifact: ".ml-cache/release-artifacts/submission.zip",
      extensionDir: undefined,
      keepProfile: true,
      scenario: "real-profile-uat",
      userDataDir: "/tmp/bbl-profile",
    });
  });

  it("keeps the external submission artifact path stable", () => {
    expect(defaultExternalSubmissionArtifact).toContain(
      ".ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.zip",
    );
  });
});
