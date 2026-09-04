const CACHE_PREFIX = "milton-estates-shell-";
// Vite replaces this marker with a fingerprint of the complete output,
// including copied public files. Activation removes prior generations.
const CACHE_NAME = `${CACHE_PREFIX}__MILTON_BUILD_ID__`;
const SHELL_URLS = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
    self.clients.claim(),
  ]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;
  if (!["document", "script", "style", "image", "font"].includes(request.destination)) return;

  // Deployment assets include stable-name character PNGs, so cache-first can
  // pin both old art and an old index/bundle forever. Prefer the network and
  // retain the last successful response strictly as an offline fallback.
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
  );
});
