import { describe, expect, it } from "vitest";
// @ts-ignore JS config module has no declaration file yet
import viteConfig from "../vite.config.js";

describe("mv3-shell vite config", () => {
  it("builds sidepanel.html as a real Vite entry", () => {
    const resolved =
      typeof viteConfig === "function"
        ? viteConfig({ command: "build", mode: "test" })
        : viteConfig;
    const input = resolved.build?.rollupOptions?.input;

    expect(resolved.base).toBe("./");
    expect(input).toMatchObject({
      sidepanel: expect.stringMatching(/src\/sidepanel\.html$/),
    });
  });
});
