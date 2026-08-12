const STANDALONE_MEDIA_QUERY = "(display-mode: standalone)";
type StandaloneWindow = {
  matchMedia: (query: string) => Pick<MediaQueryList, "matches">;
  navigator: object;
};

export function isStandaloneMode(
  windowLike: StandaloneWindow,
): boolean {
  const iosStandalone = "standalone" in windowLike.navigator
    && (windowLike.navigator as { standalone?: boolean }).standalone === true;
  return windowLike.matchMedia(STANDALONE_MEDIA_QUERY).matches || iosStandalone;
}

export function getCatalogUrl(
  env: Pick<ImportMetaEnv, "VITE_CATALOG_URL"> = import.meta.env,
  currentUrl = window.location.href,
): string {
  const configuredUrl = env.VITE_CATALOG_URL?.trim();
  return configuredUrl ? new URL(configuredUrl, currentUrl).href : new URL("../", currentUrl).href;
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  const serviceWorkerUrl = new URL("sw.js", document.baseURI);
  void navigator.serviceWorker.register(serviceWorkerUrl.href, { scope: serviceWorkerUrl.pathname.replace(/sw\.js$/, "") })
    .catch((error: unknown) => {
      console.error("Milton Estates service worker registration failed.", error);
    });
}

export function setupPwaNavigation(): void {
  const exitLink = document.querySelector<HTMLAnchorElement>("[data-exit-to-catalog]");
  if (!exitLink) return;

  exitLink.href = getCatalogUrl();
  const updateViewport = (): void => {
    // Mobile browsers can report a layout viewport taller than the actually
    // visible area during PWA launch and orientation changes. Phaser FITs to
    // #game, so size that parent from the visual viewport whenever possible.
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty("--viewport-width", `${Math.round(width)}px`);
    document.documentElement.style.setProperty("--viewport-height", `${Math.round(height)}px`);
    document.documentElement.classList.toggle("standalone", isStandaloneMode(window));
  };
  updateViewport();
  window.addEventListener("resize", updateViewport, { passive: true });
  window.addEventListener("orientationchange", updateViewport, { passive: true });
  window.visualViewport?.addEventListener("resize", updateViewport, { passive: true });
  window.matchMedia(STANDALONE_MEDIA_QUERY).addEventListener?.("change", updateViewport);
}
