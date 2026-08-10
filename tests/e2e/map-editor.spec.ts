import { expect, test } from "@playwright/test";
import { installCloudSaveApi, launchSeededCloudSave } from "./cloudHarness";

test("development map editor opens on the live map and supports reversible object authoring", async ({ page }) => {
  const saves = await installCloudSaveApi(page);
  await launchSeededCloudSave(page, saves, () => undefined);

  await page.keyboard.press("F7");
  const editor = page.getByRole("dialog", { name: "Developer map editor" });
  await expect(editor).toBeVisible();
  await expect(editor).toContainText("neighborhood · grid-16");
  await expect(editor.getByRole("button", { name: "Save" })).toBeDisabled();

  await editor.getByRole("button", { name: "poi", exact: true }).click();
  await page.mouse.click(340, 260);
  await expect(editor).toContainText("Selected · interactions");
  await expect(editor.getByLabel("Name", { exact: true })).toHaveValue(/poi_/);
  await expect(editor.getByRole("button", { name: "Save" })).toBeEnabled();

  await editor.getByRole("button", { name: "Undo" }).click();
  await expect(editor.getByRole("button", { name: "Save" })).toBeDisabled();
  await page.keyboard.press("F7");
  await expect(editor).toBeHidden();
});
