import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
// This module is deliberately Node-only: it is mounted exclusively by Vite's
// development server and is not part of the browser bundle.
// @ts-expect-error JavaScript development-server helper has no declaration file.
import { mapEditorServerPlugin } from "./scripts/map-editor-server.mjs";

export default defineConfig({
  // Local development stays relative, while the production image declares
  // the catalog-owned public mount explicitly at build time.
  base: process.env.VITE_BASE_PATH?.trim() || "./",
  server: { port: 5173, ...(process.env.MILTON_MAP_EDITOR === "1" ? { host: "127.0.0.1" } : {}) },
  // The authoring API is opt-in even in development because it writes checked-in maps.
  plugins: [mapEditorServerPlugin({ enabled: process.env.MILTON_MAP_EDITOR === "1" }), {
    name: "milton-service-worker-build-cache",
    writeBundle(options) {
      const outputDir = options.dir ?? path.dirname(options.file ?? "dist/index.html");
      const outputFiles = (directory: string, prefix = ""): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filePath = path.join(directory, entry.name);
        const relative = path.join(prefix, entry.name);
        return entry.isDirectory() ? outputFiles(filePath, relative) : [relative];
      });
      const hash = createHash("sha256");
      for (const name of outputFiles(outputDir).filter((entry) => entry !== "sw.js").sort()) {
        hash.update(Buffer.from(name));
        hash.update(readFileSync(path.join(outputDir, name)));
      }
      hash.update(readFileSync(path.join(outputDir, "sw.js")));
      const buildId = hash.digest("hex").slice(0, 16);
      const serviceWorkerPath = path.resolve(outputDir, "sw.js");
      const source = readFileSync(serviceWorkerPath, "utf8");
      writeFileSync(serviceWorkerPath, source.split("__MILTON_BUILD_ID__").join(buildId));
    },
  }],
});
