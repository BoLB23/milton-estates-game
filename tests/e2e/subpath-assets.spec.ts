import { expect, test } from "@playwright/test";
import { installCloudSaveApi, readCloudData } from "./cloudHarness";

test("boots under a Vite subpath and loads its initial artwork from that subpath", async ({ page }) => {
  await installCloudSaveApi(page);
  const failedAssetUrls: string[] = [];
  const loadedAssetUrls: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/games/milton-estates/assets/")) return;
    if (response.ok()) loadedAssetUrls.push(url);
    else failedAssetUrls.push(`${response.status()} ${url}`);
  });

  // A leading slash would discard the configured `/games/milton-estates/` base URL.
  await page.goto("./");
  await expect(page.locator("canvas")).toBeVisible();
  // Required authentication resolves to the cloud picker before a new slot is
  // created. This keeps the subpath smoke test on the real startup contract.
  await page.waitForTimeout(550);
  await page.mouse.click(230, 315);
  await page.waitForTimeout(400);
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  await page.keyboard.press("KeyE");
  await expect.poll(() => readCloudData(page), { timeout: 15_000 }).toBeDefined();

  expect(failedAssetUrls).toEqual([]);
  expect(loadedAssetUrls).toEqual(expect.arrayContaining([
    expect.stringContaining("/games/milton-estates/assets/characters/npcs/billy.png"),
    expect.stringContaining("/games/milton-estates/assets/characters/player/body.png"),
    expect.stringContaining("/games/milton-estates/assets/maps/creek-woods-master-v1.png"),
  ]));
});
