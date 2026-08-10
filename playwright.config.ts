import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  // The projects boot Phaser instances and load multi-megabyte
  // art plates. Keep them serial so asset-loader timing does not make the
  // gameplay suite depend on local machine contention.
  workers: 1,
  reporter: "line",
  use: { headless: true, viewport: { width: 960, height: 540 } },
  projects: [
    {
      name: "root",
      testIgnore: ["**/subpath-assets.spec.ts", "**/webgl-smoke.spec.ts"],
      use: { baseURL: "http://127.0.0.1:4183" },
    },
    {
      name: "subpath",
      testMatch: "**/subpath-assets.spec.ts",
      use: { baseURL: "http://127.0.0.1:4184/games/milton-estates/" },
    },
    {
      name: "webgl-smoke",
      testMatch: "**/webgl-smoke.spec.ts",
      use: { baseURL: "http://127.0.0.1:4185" },
    },
  ],
  webServer: [
    {
      command: "VITE_E2E_RENDERER=canvas npm run dev -- --host 127.0.0.1 --port 4183",
      url: "http://127.0.0.1:4183",
      reuseExistingServer: false,
    },
    {
      command: "VITE_E2E_RENDERER=canvas npm run dev -- --host 127.0.0.1 --port 4184 --base=/games/milton-estates/",
      url: "http://127.0.0.1:4184/games/milton-estates/",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4185",
      url: "http://127.0.0.1:4185",
      reuseExistingServer: false,
    },
  ],
});
