import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../dist/sw.js", import.meta.url), "utf8");
const match = source.match(/CACHE_NAME = `\$\{CACHE_PREFIX\}([a-f0-9]{16})`/);
if (!match || source.includes("__MILTON_BUILD_ID__")) {
  throw new Error("dist/sw.js does not contain a generated 16-character build cache ID");
}
if (!source.includes(".filter((key") || !source.includes("caches.delete")) {
  throw new Error("dist/sw.js must prune prior cache generations during activation");
}

const listeners = new Map();
const deleted = [];
const context = {
  self: {
    addEventListener: (type, callback) => listeners.set(type, callback),
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
    location: { origin: "https://example.test" },
    registration: { scope: "https://example.test/" },
  },
  caches: {
    keys: async () => ["milton-estates-shell-old", match[1] && `milton-estates-shell-${match[1]}`],
    delete: async (key) => { deleted.push(key); return true; },
    open: async () => ({ addAll: async () => undefined, put: async () => undefined }),
  },
  URL,
  Response,
};
runInNewContext(source, context);
let activation;
listeners.get("activate")({ waitUntil: (promise) => { activation = promise; } });
await activation;
if (!deleted.includes("milton-estates-shell-old")) throw new Error("service worker did not prune the prior cache generation");
console.log(`Service worker cache ID validated: ${match[1]}`);
