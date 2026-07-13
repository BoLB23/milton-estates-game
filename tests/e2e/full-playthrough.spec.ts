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

async function readSerializedSave(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem("milton-estates-save"));
}

async function waitForSave(page: Page, expected: Partial<BrowserSave>): Promise<void> {
  await expect.poll(() => readSave(page)).toMatchObject(expected);
}

async function clickInteractionPrompt(page: Page): Promise<void> {
  // The game uses a fixed 960x540 canvas; the interaction prompt is centered
  // at (480, 505) and is intentionally pointer-accessible.
  await page.mouse.click(480, 505);
  // Phaser dispatches the pointer handler on its next update. Give the
  // dialogue event one rendered frame before sending keyboard advancement.
  await page.waitForTimeout(80);
}

async function advanceDialogue(page: Page, lineCount: number): Promise<void> {
  for (let index = 0; index < lineCount; index += 1) {
    await page.keyboard.press(index % 2 === 0 ? "Space" : "KeyE");
    // Allow one rendered frame plus key-up before the next dialogue action.
    await page.waitForTimeout(100);
  }
}

async function teleportAndInteract(page: Page): Promise<void> {
  await page.waitForTimeout(220);
  await page.keyboard.press("F4");
  // A reloaded map needs its artwork, collision, and interaction registry
  // rebuilt before the prompted action is activated.
  await page.waitForTimeout(850);
  await clickInteractionPrompt(page);
}

async function startNewGame(page: Page): Promise<void> {
  await page.waitForTimeout(250);
  // Let Phaser finish registering the first title-page hit areas before the
  // first synthetic input; this is also a real device's first display frame.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  if (process.env.CAPTURE_DOCS === "1") await page.screenshot({ path: "docs/checkpoint-3-title.png" });
  // Follow the same title -> scrapbook -> journal flow players use.
  await page.keyboard.press("ArrowDown"); // New Game.
  await page.waitForTimeout(100);
  await page.keyboard.press("Space"); // Arm New Game.
  await page.waitForTimeout(140);
  await page.keyboard.press("Space"); // Confirm New Game.
  await page.waitForTimeout(140);
  if (process.env.CAPTURE_DOCS === "1") await page.screenshot({ path: "docs/checkpoint-3-chapters.png" });
  await page.keyboard.press("Space"); // Open Quest Journal.
  await page.waitForTimeout(120);
  if (process.env.CAPTURE_DOCS === "1") await page.screenshot({ path: "docs/checkpoint-3-quests.png" });
  await page.keyboard.press("Space"); // Start Missing Controller.
  await page.waitForTimeout(120);
}

async function continueGame(page: Page): Promise<void> {
  await page.waitForTimeout(250);
  await page.keyboard.press("Space");
}

async function captureCheckpoint(page: Page, filename: string): Promise<void> {
  if (process.env.CAPTURE_DOCS !== "1") return;
  // Debug teleports intentionally toast; let visual snapshots show the map.
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: `docs/${filename}` });
}

async function captureBackpackMap(page: Page): Promise<void> {
  if (process.env.CAPTURE_DOCS !== "1") return;
  await page.keyboard.press("Escape");
  await page.mouse.click(450, 115);
  await page.screenshot({ path: "docs/checkpoint-5-backpack-map.png" });
  await page.keyboard.press("Escape");
}

test("completes the rendered quest, reloads in the creek, and records history", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("milton-estates-save"));
  await page.reload();
  await startNewGame(page);
  await waitForSave(page, { version: 3, questStage: "talk_to_jeremy", currentMap: "neighborhood" });
  await captureCheckpoint(page, "checkpoint-4-neighborhood.png");
  await captureBackpackMap(page);

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
  await captureCheckpoint(page, "checkpoint-4-creek.png");

  await teleportAndInteract(page);
  await advanceDialogue(page, 2);
  await waitForSave(page, {
    questStage: "return_to_jeremy",
    inventory: ["xbox_controller"],
  });

  await page.reload();
  await waitForSave(page, { currentMap: "creek", questStage: "return_to_jeremy" });
  await continueGame(page);

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
  await startNewGame(page);
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

test("replay mutations never overwrite canonical completion", async ({ page }) => {
  await page.goto("/");
  // Let Boot finish its initial autosave before replacing it with the fixture.
  await waitForSave(page, { version: 3 });
  await page.evaluate(() => localStorage.setItem("milton-estates-save", JSON.stringify({
    version: 3,
    activeChapterId: "chapter_1",
    activeQuestId: "missing_controller",
    completedChapterIds: [],
    completedQuestIds: ["missing_controller"],
    questStage: "complete",
    questHistory: [
      "missing_controller.started",
      "missing_controller.andrew_consulted",
      "missing_controller.creek_clue_found",
      "missing_controller.controller_recovered",
      "missing_controller.controller_returned",
    ],
    inventory: ["xbox_controller"],
    secrets: ["creek_token"],
    currentMap: "neighborhood",
    discoveredMaps: ["neighborhood", "creek"],
    settings: { masterVolume: 0.5, muted: true, textSize: "medium", reducedMotion: true },
    lastSavedAt: "2026-07-13T12:00:00.000Z",
  })));
  await page.reload();
  await page.waitForTimeout(250);
  const canonical = await readSerializedSave(page);

  await page.mouse.click(260, 392); // Chapter Select.
  await page.mouse.click(630, 398); // Open Quest Journal.
  await page.mouse.click(630, 418); // Replay completed Missing Controller.
  await waitForSave(page, { questStage: "complete", inventory: ["xbox_controller"] });

  await teleportAndInteract(page);
  await advanceDialogue(page, 3);
  expect(await readSerializedSave(page)).toBe(canonical);

  await page.reload();
  await waitForSave(page, { questStage: "complete", inventory: ["xbox_controller"] });
});

test("portrait phones show the landscape orientation message", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const message = page.locator(".portrait-message");
  await expect(message).toBeVisible();
  await expect(message).toContainText("Turn your device sideways");
  if (process.env.CAPTURE_DOCS === "1") await page.screenshot({ path: "docs/checkpoint-7-portrait.png" });
});
