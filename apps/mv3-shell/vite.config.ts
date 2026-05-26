import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const staticFiles = [
  ["manifest.json", "manifest.json"],
  ["src/offscreen.html", "src/offscreen.html"],
  ["src/runner-sandbox.html", "src/runner-sandbox.html"],
] as const;

function copyStaticExtensionFiles() {
  let outDir = resolve(appRoot, "dist");

  return {
    name: "copy-static-extension-files",
    apply: "build" as const,
    configResolved(config: { root: string; build: { outDir: string } }) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      for (const [from, to] of staticFiles) {
        const source = resolve(appRoot, from);
        const target = resolve(outDir, to);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(source, target, { force: true });
      }
    },
  };
}

const viteConfig = {
  base: "./",
  root: appRoot,
  plugins: [tailwindcss(), vue(), copyStaticExtensionFiles()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome116",
    rollupOptions: {
      input: {
        background: resolve(appRoot, "src/background.ts"),
        offscreen: resolve(appRoot, "src/offscreen.ts"),
        "page-hook": resolve(appRoot, "src/page-hook.ts"),
        "runner-sandbox": resolve(appRoot, "src/runner-sandbox.ts"),
        sidepanel: resolve(appRoot, "src/sidepanel.html"),
      },
      output: {
        entryFileNames: "src/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
};

export default viteConfig;
