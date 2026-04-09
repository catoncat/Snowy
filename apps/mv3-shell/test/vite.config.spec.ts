import { describe, expect, it } from "vitest";
import viteConfig from "../vite.config.js";

type ViteConfigLike = {
  base?: string;
  build?: {
    rollupOptions?: {
      input?: Record<string, string>;
      output?: unknown;
    };
  };
};

function resolveViteConfig(): ViteConfigLike {
  return typeof viteConfig === "function"
    ? (viteConfig as (env: { command: string; mode: string }) => ViteConfigLike)({
        command: "build",
        mode: "test",
      })
    : (viteConfig as ViteConfigLike);
}

describe("mv3-shell vite config", () => {
  it("maps ts source entries to js mv3 outputs", () => {
    const resolved = resolveViteConfig();
    const input = resolved.build?.rollupOptions?.input as Record<string, string>;
    const output = resolved.build?.rollupOptions?.output;

    expect(input.background).toMatch(/src\/background\.ts$/);
    expect(input.offscreen).toMatch(/src\/offscreen\.ts$/);
    expect(input["page-hook"]).toMatch(/src\/page-hook\.ts$/);
    expect(output).toMatchObject({
      entryFileNames: "src/[name].js",
    });
  });

  it("builds sidepanel.html as a real Vite entry", () => {
    const resolved = resolveViteConfig();
    const input = resolved.build?.rollupOptions?.input;

    expect(resolved.base).toBe("./");
    expect(input).toMatchObject({
      sidepanel: expect.stringMatching(/src\/sidepanel\.html$/),
    });
  });
});
