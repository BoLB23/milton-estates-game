import { expect, test, type Page } from "@playwright/test";

type BrowserSave = {
  version: number;
  questStage: string;
  currentMap: string;
  inventory: string[];
  questHistory: string[];
};

async function readSave(page: Page): Promise<BrowserSave | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("milton-estates-save");
    return raw ? JSON.parse(raw) as BrowserSave : null;
  });
}

async function waitForSave(page: Page, expected: Partial<BrowserSave>): Promise<void> {
  await expect.poll(() => readSave(page)).toMatchObject(expected);
}

async function clickInteractionPrompt(page: Page): Promise<void> {
  // The game uses a fixed 960x540 canvas; the interaction prompt is centered
  // at (480, 505) and is intentionally pointer-accessible.
  await page.mouse.click(480, 505);
}

async function advanceDialogue(page: Page, lineCount: number): Promise<void> {
  for (let index = 0; index < lineCount; index += 1) {
    await page.keyboard.press(index % 2 === 0 ? "Space" : "KeyE");
    await page.waitForTimeout(40);
  }
}

async function teleportAndInteract(page: Page): Promise<void> {
  await page.waitForTimeout(220);
  await page.keyboard.press("F4");
  await page.waitForTimeout(40);
  await clickInteractionPrompt(page);
}

test("completes the rendered quest, reloads in the creek, and records history", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("milton-estates-save"));
  await page.reload();
  await waitForSave(page, { version: 2, questStage: "talk_to_jeremy", currentMap: "neighborhood" });

  await teleportAndInteract(page);
  await advanceDialogue(page, 3);
  await waitForSave(page, { questStage: "talk_to_andrew" });

  await teleportAndInteract(page);
  await advanceDialogue(page, 4);
  await waitForSave(page, { questStage: "search_yards" });

  await teleportAndInteract(page);
  await advanceDialogue(page, 2);
  await waitForSave(page, { questStage: "search_creek" });

  await teleportAndInteract(page);
  await waitForSave(page, { currentMap: "creek" });

  await teleportAndInteract(page);
  await advanceDialogue(page, 2);
  await waitForSave(page, {
    questStage: "return_to_jeremy",
    inventory: ["xbox_controller"],
  });

  await page.reload();
  await waitForSave(page, { currentMap: "creek", questStage: "return_to_jeremy" });

  await teleportAndInteract(page);
  await waitForSave(page, { currentMap: "neighborhood" });

  await teleportAndInteract(page);
  await advanceDialogue(page, 6);
  await waitForSave(page, {
    questStage: "complete",
    questHistory: [
      "missing_controller.started",
      "missing_controller.andrew_consulted",
      "missing_controller.creek_clue_found",
      "missing_controller.controller_recovered",
      "missing_controller.controller_returned",
    ],
  });
});

test("preserves dialogue through pause and requires restart confirmation", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("milton-estates-save"));
  await page.reload();
  await waitForSave(page, { questStage: "talk_to_jeremy" });

  await teleportAndInteract(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  // A second Escape resumes the exact dialogue line; it must not advance it.
  await page.keyboard.press("Escape");
  await advanceDialogue(page, 3);
  await waitForSave(page, { questStage: "talk_to_andrew" });

  await page.keyboard.press("Escape");
  await page.mouse.click(620, 115); // Save tab.
  await page.mouse.click(200, 355); // Arm restart once.
  await page.keyboard.press("Escape");
  await waitForSave(page, { questStage: "talk_to_andrew" });

  await page.keyboard.press("Escape");
  await page.mouse.click(620, 115);
  await page.mouse.click(200, 355);
  await page.mouse.click(200, 355);
  await waitForSave(page, { questStage: "talk_to_jeremy", currentMap: "neighborhood" });
});
