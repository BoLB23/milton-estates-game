import { defineConfig } from "vite";
// This module is deliberately Node-only: it is mounted exclusively by Vite's
// development server and is not part of the browser bundle.
// @ts-expect-error JavaScript development-server helper has no declaration file.
import { mapEditorServerPlugin } from "./scripts/map-editor-server.mjs";

export default defineConfig({
  // Local development stays relative, while the production image declares
  // the catalog-owned public mount explicitly at build time.
  base: process.env.VITE_BASE_PATH?.trim() || "./",
  server: { port: 5173 },
  plugins: [mapEditorServerPlugin()],
});
