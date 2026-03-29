import manifest from "../manifest.json";
import { describe, expect, it } from "vitest";

describe("mv3-shell manifest", () => {
  it("declares the MV3 offscreen-ready shell", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toContain("offscreen");
    expect(manifest.background).toMatchObject({
      service_worker: "src/background.js",
      type: "module"
    });
    expect(manifest.side_panel).toMatchObject({
      default_path: "src/sidepanel.html"
    });
  });
});
