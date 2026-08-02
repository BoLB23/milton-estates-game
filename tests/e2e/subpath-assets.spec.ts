import { expect, test } from "@playwright/test";

test("boots under a Vite subpath and loads its initial artwork from that subpath", async ({ page }) => {
  const failedAssetUrls: string[] = [];
  const loadedAssetUrls: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/milton/assets/")) return;
    if (response.ok()) loadedAssetUrls.push(url);
    else failedAssetUrls.push(`${response.status()} ${url}`);
  });

  // A leading slash would discard the configured `/milton/` base URL.
  await page.goto("./");
  await expect(page.locator("canvas")).toBeVisible();
  // Initial artwork is several megabytes. When the root regression worker is
  // also starting Chromium, allow the same boot budget as gameplay save waits.
  await expect.poll(
    () => page.evaluate(() => localStorage.getItem("milton-estates-save")),
    { timeout: 15_000 },
  ).not.toBeNull();

  expect(failedAssetUrls).toEqual([]);
  expect(loadedAssetUrls).toEqual(expect.arrayContaining([
    expect.stringContaining("/milton/assets/characters/billy-hd-movement.png"),
    expect.stringContaining("/milton/assets/maps/expansion/neighborhood-master-v2.png"),
    expect.stringContaining("/milton/assets/maps/creek-woods-master-v1.png"),
  ]));
});
