import { expect, test } from "@playwright/test";

test("boots with a WebGL canvas without runtime errors", async ({ page }) => {
  const uncaughtErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => uncaughtErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await expect.poll(
    () => page.evaluate(() => localStorage.getItem("milton-estates-save")),
    { timeout: 15_000 },
  ).not.toBeNull();

  const contextType = await page.locator("canvas").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    if (canvas.getContext("webgl2")) return "webgl2";
    if (canvas.getContext("webgl")) return "webgl";
    return null;
  });

  expect(contextType).toMatch(/^webgl2?$/);
  expect(uncaughtErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
