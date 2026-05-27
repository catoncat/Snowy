import { describe, expect, it } from "vitest";

import {
  buildReadyNextActions,
  parseReleaseDecisionState,
} from "../../../scripts/release-cutover-status";

const acceptedPacket = [
  "# Release Cutover Decision Packet",
  "- accepted_at: 2026-05-27T01:08:27Z",
  "- accepted_by: human merge of PR #2",
  "- merged_pr: https://github.com/catoncat/Snowy/pull/2",
  "- merge_commit: `89034b63b5be03fd2965af3e44a41e6eb6c7be17`",
  "- decision: accept the repo-side Level 2 evidence pack as the release / old-mainline cutover basis",
  "- old_mainline_switch_pr: https://github.com/catoncat/browsir/pull/3",
  "- old_mainline_switch_commit: `a2a0164c965361b546a00defb28cf0cb4a9e8d18`",
  "- old_mainline_status: maintenance / reference mode; replacement work defaults to `catoncat/Snowy`",
  "- remaining_boundary: external store/deployment submission or exactly one human-defined real-profile UAT, if required",
  "- current accepted main commit: `afeb54e2430df0ecdf9cf47fecb8d8697987e2c2`",
].join("\n");

describe("release cutover status next actions", () => {
  it("moves past already-recorded acceptance and old-mainline switch work", () => {
    const state = parseReleaseDecisionState("packet.md", acceptedPacket);

    expect(state.recorded).toBe(true);
    expect(state.oldMainlineSwitched).toBe(true);
    expect(state.mergeCommit).toBe("89034b63b5be03fd2965af3e44a41e6eb6c7be17");

    expect(buildReadyNextActions(state)).toEqual([
      "continue only through external store/deployment submission, or define exactly one human real-profile UAT if required",
      "keep bun run release:acceptance and bun run release:cutover:status as the pre-submission gates",
      "do not create default deferred implementation issues while the repo-side gate stays green",
    ]);
  });

  it("keeps old-mainline switch as next action when the decision is accepted but not switched", () => {
    const state = parseReleaseDecisionState(
      "packet.md",
      acceptedPacket.replace(
        "- old_mainline_status: maintenance / reference mode; replacement work defaults to `catoncat/Snowy`",
        "- old_mainline_status: pending",
      ),
    );

    expect(state.recorded).toBe(true);
    expect(state.oldMainlineSwitched).toBe(false);
    expect(buildReadyNextActions(state)[0]).toBe(
      "use the accepted branch/PR/release process to switch the old browser plugin mainline",
    );
  });
});
