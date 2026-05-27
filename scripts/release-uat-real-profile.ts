#!/usr/bin/env bun

import {
  defaultExternalSubmissionArtifact,
  parseReleaseSmokeCliOptions,
  runReleaseSmoke,
} from "./release-smoke-mv3-real-browser";

const options = parseReleaseSmokeCliOptions(process.argv.slice(2));

if (!options.userDataDir) {
  console.error(
    "release:uat:real-profile requires --user-data-dir <path-to-human-selected-chrome-profile>",
  );
  process.exit(1);
}

runReleaseSmoke({
  ...options,
  artifact: options.artifact ?? defaultExternalSubmissionArtifact,
  keepProfile: true,
  scenario: "real-profile-uat",
})
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
