import { describe, expect, it } from "vitest";
import { getCatalogUrl, isStandaloneMode } from "./pwa";

describe("PWA platform helpers", () => {
  it("detects standalone display mode", () => {
    expect(isStandaloneMode({
      matchMedia: () => ({ matches: true }),
      navigator: {},
    })).toBe(true);
  });

  it("supports the iOS standalone fallback", () => {
    expect(isStandaloneMode({
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: true },
    })).toBe(true);
  });

  it("resolves the configured catalog URL without an environment hostname", () => {
    expect(getCatalogUrl({ VITE_CATALOG_URL: "../catalog/" }, "https://games.example/milton/")).toBe("https://games.example/catalog/");
  });

  it("falls back to the parent launch path", () => {
    expect(getCatalogUrl({}, "https://games.example/milton/")).toBe("https://games.example/");
  });
});
