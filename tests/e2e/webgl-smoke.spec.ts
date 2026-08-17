import { expect, test } from "@playwright/test";
import { installCloudSaveApi } from "./cloudHarness";

test("boots with a WebGL canvas without runtime errors", async ({ page }) => {
  await installCloudSaveApi(page);
  const uncaughtErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedUrls: string[] = [];
  page.on("pageerror", (error) => uncaughtErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failedUrls.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  // This is deliberately a renderer boot test. Cloud-save creation and its
  // revision-conflict recovery have dedicated end-to-end coverage; combining
  // them here made a renderer failure indistinguishable from an in-flight
  // autosave during the test's teardown.
  await page.waitForTimeout(750);

  const contextType = await page.locator("canvas").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    if (canvas.getContext("webgl2")) return "webgl2";
    if (canvas.getContext("webgl")) return "webgl";
    return null;
  });

  expect(contextType).toMatch(/^webgl2?$/);
  expect(uncaughtErrors).toEqual([]);
  expect(consoleErrors, failedUrls.join("\n")).toEqual([]);
});
