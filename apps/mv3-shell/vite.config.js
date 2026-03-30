import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const staticFiles = [
  ["manifest.json", "manifest.json"],
  ["src/offscreen.html", "src/offscreen.html"],
  ["src/sidepanel.html", "src/sidepanel.html"],
  ["src/page-hook.js", "src/page-hook.js"],
];

function copyStaticExtensionFiles() {
  let outDir = resolve(appRoot, "dist");

  return {
    name: "copy-static-extension-files",
    apply: "build",
    configResolved(config) {
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

export default defineConfig({
  root: appRoot,
  plugins: [copyStaticExtensionFiles()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome116",
    rollupOptions: {
      input: {
        background: resolve(appRoot, "src/background.js"),
        offscreen: resolve(appRoot, "src/offscreen.js"),
      },
      output: {
        entryFileNames: "src/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
