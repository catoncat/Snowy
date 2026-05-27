# External Release Submission Packet

> date: 2026-05-27
> status: ready for external store/deployment submission
> scope: Browser Brain Loop Next MV3 extension

## Decision State

The repo-side Level 2 evidence pack has been accepted and the old repository is recorded as maintenance / reference mode. This packet is the handoff for the remaining external action: submit the current MV3 release artifact to the selected browser extension deployment channel, or run one real-profile UAT if a human decision maker requests it before submission.

Do not use this packet as a reason to reopen deferred product breadth. If the gate below stays green, the next step is external submission or the one UAT scenario in this document.

## Pre-Submission Gate

Run these immediately before uploading or handing off the artifact:

```bash
git fetch origin --prune
git switch codex/verify-origin-main
git merge --ff-only origin/main
bun run release:cutover:status
```

Required result:

- `ok: true`
- `blockers: []`
- `workflow.queueEntries: 0`
- `workflow.activeLeaseSessions: []`
- `releaseDecision.recorded: true`
- `releaseDecision.oldMainlineSwitched: true`
- `nextActions` points to external store/deployment submission or one real-profile UAT

The latest observed run on `origin/main@a0d7781530ed6547fc77a4a52066d0bc39d36292` passed with those properties at 2026-05-27T03:50:31.200Z.

## Release Artifact

Generate the artifact from the accepted release source with:

```bash
bun scripts/release-package-mv3.ts --output .ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.zip
```

The package command normalizes ZIP metadata so repeated runs with the same extension contents produce the same SHA256.

Latest generated artifact:

- source_commit: `a0d7781530ed6547fc77a4a52066d0bc39d36292`
- source_pr: https://github.com/catoncat/Snowy/pull/13
- artifact: `.ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.zip`
- sha256: `556cbe724265a42e31233663cc064887363045cec1ade3cdf6048ff914ddb988`
- generated_at: 2026-05-27T03:50:02.307Z
- command: `bun scripts/release-package-mv3.ts --output .ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.zip`
- deterministic_rerun_sha256: `556cbe724265a42e31233663cc064887363045cec1ade3cdf6048ff914ddb988`
- deterministic_rerun_generated_at: 2026-05-27T03:50:40.506Z

Latest generated handoff manifest:

- source_commit: `a0d7781530ed6547fc77a4a52066d0bc39d36292`
- source_pr: https://github.com/catoncat/Snowy/pull/13
- manifest: `.ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.manifest.json`
- generated_at: 2026-05-27T03:50:44.821Z
- channel: `external-store-or-deployment`
- artifact_sha256: `556cbe724265a42e31233663cc064887363045cec1ade3cdf6048ff914ddb988`
- review_status: `ready_for_upload`

Manifest summary:

- name: `Browser Brain Loop Next`
- version: `0.0.1`
- manifest_version: `3`
- minimum_chrome_version: `116`
- service_worker: `src/background.js`
- permissions: `storage`, `tabs`, `activeTab`, `scripting`, `offscreen`
- sandbox page: `src/runner-sandbox.html`
- side panel: `src/sidepanel.html`

Packaged files:

- `manifest.json`
- `assets/sidepanel-management-contract-B-Hywnxw.js`
- `assets/sidepanel.css`
- `src/background.js`
- `src/offscreen.html`
- `src/offscreen.js`
- `src/page-hook.js`
- `src/runner-sandbox.html`
- `src/runner-sandbox.js`
- `src/sidepanel.html`
- `src/sidepanel.js`

## External Submission Steps

1. Prepare the upload bundle in one command:

```bash
bun run release:submission:prepare -- \
  --channel <store-or-deployment-channel> \
  --source-pr https://github.com/catoncat/Snowy/pull/13
```

The prepare command runs the cutover status gate, regenerates the MV3 zip, writes the machine-readable handoff manifest, and prints the artifact / manifest paths to upload.

2. If you need to run the lower-level commands manually, confirm `bun run release:cutover:status` still returns `ok: true`, then regenerate the handoff manifest:

```bash
bun run release:submission:manifest -- \
  --artifact .ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.zip \
  --channel <store-or-deployment-channel> \
  --output .ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.manifest.json
```

3. Upload `.ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.zip` and `.ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.manifest.json` to the chosen extension store or deployment channel.
4. Record the external submission result next to this packet:
   - submitted_at
   - submitted_by
   - channel
   - uploaded_artifact
   - uploaded_sha256
   - uploaded_manifest
   - store_item_or_release_url
   - review_status
5. If the store requires metadata that is not in this repository, treat that as external listing data. Do not add implementation backlog unless the store rejects the artifact for a concrete product/runtime reason.

## One Real-Profile UAT If Requested

If a human decision maker requests one extra UAT before submission, run exactly this scenario and record the result here instead of opening broad deferred scope.

Command:

```bash
bun run release:uat:real-profile -- --user-data-dir <path-to-human-selected-chrome-profile>
```

By default this command loads `.ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.zip`, extracts it to a temporary unpacked extension directory, runs the release smoke flow against the selected profile, and preserves the profile directory. To test a different candidate artifact, pass `--artifact <zip-path>`.

1. Use a real Chrome or Chromium profile selected by the decision maker.
2. Load the release artifact as the candidate MV3 extension build.
3. Open the side panel.
4. Install and enable the release smoke Skill package.
5. Dispatch the representative runtime event used by `bun run release:smoke:mv3`.
6. Verify that `audit.tail` contains both the Skill invocation and the shared capability call evidence.

Pass condition: the real profile produces the same replacement-loop evidence as the automated real Chromium MV3 smoke.

Fail condition: a concrete runtime, packaging, permission, profile, or store-policy failure blocks that exact path. In that case, fix the reported blocker. Do not reopen unrelated deferred breadth.

Latest command verification:

- checked_at: 2026-05-27T03:30:33Z
- command: `bun run release:uat:real-profile -- --user-data-dir /tmp/bbl-real-profile-uat-main-jwZQWp`
- artifact: `.ml-cache/release-artifacts/browser-brain-loop-next-mv3-external-submission-2026-05-27.zip`
- result: `ok: true`
- profile_mode: `provided`
- scenario: `real-profile-uat`
- dispatched_count: 1
