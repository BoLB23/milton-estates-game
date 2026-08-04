import { expect, test, type Page } from "@playwright/test";

type BrowserSave = {
  version: number;
  activeQuestId: string;
  questStage: string;
  currentMap: string;
  inventory: Array<{ itemId: string; quantity: number }>;
  questHistory: string[];
  completedQuestIds: string[];
  questProgress: {
    missingControllerStage: string;
    mushrooms: { stage: string; collectedIds: string[] };
    sports: { stage: string };
    ryanRide: { stage: string; selectedDestination: "reidenbaugh" | null; routeSeed: number | null };
    exploreBentCreek: { stage: string };
  };
  settings: { muted: boolean };
};

async function readSave(page: Page): Promise<BrowserSave | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("milton-estates-save");
    if (!raw) return null;

    const save = JSON.parse(raw) as BrowserSave;
    const questStage = save.activeQuestId === "andrew_mushroom_hunt"
      ? save.questProgress.mushrooms.stage
      : save.activeQuestId === "three_player_sports"
        ? save.questProgress.sports.stage
        : save.activeQuestId === "catch_ryan"
          ? save.questProgress.ryanRide.stage
          : save.activeQuestId === "explore_bent_creek"
            ? save.questProgress.exploreBentCreek.stage
          : save.questProgress.missingControllerStage;
    return { ...save, questStage };
  });
}

async function readSerializedSave(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem("milton-estates-save"));
}

async function waitForSave(page: Page, expected: Partial<BrowserSave>): Promise<void> {
  await expect.poll(() => readSave(page), { timeout: 15_000 }).toMatchObject(expected);
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

async function teleportAndInteract(page: Page, viaPointer = false): Promise<void> {
  await page.waitForTimeout(500);
  await page.keyboard.press("F4");
  // A reloaded map needs its artwork, collision, and interaction registry
  // rebuilt before the prompted action is activated.
  await page.waitForTimeout(500);
  // Scene starts are queued. A second idempotent relocation ensures the hook
  // is received even when the first key lands on the final create frame.
  await page.keyboard.press("F4");
  await page.waitForTimeout(500);
  if (viaPointer) await clickInteractionPrompt(page);
  else {
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(80);
  }
}

async function startNewGame(page: Page): Promise<void> {
  await page.waitForTimeout(250);
  // A browser with no prior save receives the skippable scrapbook opening.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(260);
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
  await page.waitForTimeout(340);
}

async function continueGame(page: Page): Promise<void> {
  await page.waitForTimeout(250);
  await page.keyboard.press("Space");
}

async function startQuestFromJournal(page: Page, stepsFromFirstQuest: number): Promise<void> {
  // Scene starts are queued by Phaser. Wait for the continued world and menu
  // scenes to finish their create cycle before opening the backpack.
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.mouse.click(325, 115); // Quests tab.
  await page.waitForTimeout(250);
  await page.mouse.click(150, 247 + stepsFromFirstQuest * 40); // Authored quest row.
  await page.waitForTimeout(250);
  await page.mouse.click(710, 452); // Start / continue / replay action.
  await page.waitForTimeout(300);
}

async function toggleSoundFromBackpack(page: Page, key: "Escape" | "KeyB"): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(160);
  await page.mouse.click(760, 115); // Settings tab.
  await page.waitForTimeout(100);
  await page.mouse.click(190, 335); // Sound toggle.
  await page.waitForTimeout(100);
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
  await page.mouse.click(540, 115);
  await page.screenshot({ path: "docs/checkpoint-5-backpack-map.png" });
  await page.keyboard.press("Escape");
}

test("completes the rendered quest, reloads in the creek, and records history", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("milton-estates-save"));
  await page.reload();
  await startNewGame(page);
  await waitForSave(page, { version: 8, questStage: "talk_to_jeremy", currentMap: "neighborhood" });
  await captureCheckpoint(page, "checkpoint-4-neighborhood.png");
  await captureBackpackMap(page);

  await teleportAndInteract(page, true); // Keep one rendered pointer-prompt regression.
  await advanceDialogue(page, 3);
  await waitForSave(page, { questStage: "talk_to_andrew" });

  await teleportAndInteract(page);
  await advanceDialogue(page, 4);
  await waitForSave(page, { questStage: "search_creek" });

  await teleportAndInteract(page);
  await waitForSave(page, { currentMap: "creek" });
  await captureCheckpoint(page, "checkpoint-4-creek.png");

  await page.waitForTimeout(220);
  await page.keyboard.press("F4");
  await page.waitForTimeout(850);
  // Regress the physical keyboard path: the E that opens dialogue must not
  // also consume its first line.
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(120);
  await page.keyboard.press("Space");
  await page.waitForTimeout(120);
  await waitForSave(page, { questStage: "search_creek" });
  await page.keyboard.press("KeyE");
  await waitForSave(page, {
    questStage: "return_to_jeremy",
    inventory: [{ itemId: "xbox_controller", quantity: 1 }],
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
  await page.waitForTimeout(160);
  // A second Escape resumes the exact dialogue line; it must not advance it.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(160);
  await advanceDialogue(page, 3);
  await waitForSave(page, { questStage: "talk_to_andrew" });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(160);
  await page.mouse.click(650, 115); // Save tab.
  await page.waitForTimeout(100);
  await page.mouse.click(200, 355); // Arm restart once.
  await page.waitForTimeout(100);
  await page.keyboard.press("Escape");
  await waitForSave(page, { questStage: "talk_to_andrew" });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(160);
  await page.mouse.click(650, 115);
  await page.waitForTimeout(100);
  await page.mouse.click(200, 355);
  await page.waitForTimeout(100);
  await page.mouse.click(200, 355);
  await waitForSave(page, { questStage: "talk_to_jeremy", currentMap: "neighborhood" });
});

test("replay mutations never overwrite canonical completion", async ({ page }) => {
  await page.goto("/");
  // Let Boot finish its initial autosave before replacing it with the fixture.
  await waitForSave(page, { version: 8 });
  await page.evaluate(() => localStorage.setItem("milton-estates-save", JSON.stringify({
    version: 4,
    activeChapterId: "chapter_1",
    activeQuestId: "missing_controller",
    completedChapterIds: [],
    completedQuestIds: ["missing_controller"],
    questStage: "complete",
    questProgress: {
      missingControllerStage: "complete",
      mushrooms: { stage: "talk_to_andrew_for_mushrooms", spawns: [], collectedIds: [] },
      sports: { stage: "meet_jeremy_to_skateboard" },
    },
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
  await waitForSave(page, { questStage: "complete", inventory: [{ itemId: "xbox_controller", quantity: 1 }] });

  await teleportAndInteract(page);
  await advanceDialogue(page, 3);
  expect(await readSerializedSave(page)).toBe(canonical);

  await page.reload();
  await waitForSave(page, { questStage: "complete", inventory: [{ itemId: "xbox_controller", quantity: 1 }] });
});

test("portrait phones show the landscape orientation message", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const message = page.locator(".portrait-message");
  await expect(message).toBeVisible();
  await expect(message).toContainText("Turn your device sideways");
  if (process.env.CAPTURE_DOCS === "1") await page.screenshot({ path: "docs/checkpoint-7-portrait.png" });
});

test("a creek reload keeps Escape, B, and the return interaction responsive", async ({ page }) => {
  await page.goto("/");
  await waitForSave(page, { version: 8 });

  const installCreekSave = async () => {
    await page.evaluate(() => localStorage.setItem("milton-estates-save", JSON.stringify({
      version: 4,
      activeChapterId: "chapter_1",
      activeQuestId: "andrew_mushroom_hunt",
      completedChapterIds: [],
      completedQuestIds: ["missing_controller"],
      questStage: "feed_mushroom_to_jeremy",
      questProgress: {
        missingControllerStage: "complete",
        mushrooms: {
          stage: "feed_mushroom_to_jeremy",
          spawns: Array.from({ length: 10 }, (_, index) => ({
            id: `test-mushroom-${index}`,
            map: index < 5 ? "neighborhood" : "creek",
            x: 200 + index * 30,
            y: 300 + index * 20,
          })),
          collectedIds: Array.from({ length: 10 }, (_, index) => `test-mushroom-${index}`),
        },
        sports: { stage: "meet_jeremy_to_skateboard" },
      },
      questHistory: [
        "missing_controller.started",
        "missing_controller.andrew_consulted",
        "missing_controller.creek_clue_found",
        "missing_controller.controller_recovered",
        "missing_controller.controller_returned",
        "andrew_mushroom_hunt.started",
        "andrew_mushroom_hunt.all_collected",
      ],
      inventory: ["xbox_controller"],
      secrets: [],
      currentMap: "creek",
      discoveredMaps: ["neighborhood", "creek"],
      settings: { masterVolume: 1, muted: false, textSize: "medium", reducedMotion: false },
      lastSavedAt: "2026-07-16T12:00:00.000Z",
    })));
    await page.reload();
    await waitForSave(page, { version: 8, currentMap: "creek", questStage: "feed_mushroom_to_jeremy" });
    await continueGame(page);
    await page.waitForTimeout(850);
    await waitForSave(page, { currentMap: "creek", questStage: "feed_mushroom_to_jeremy" });
  };

  await installCreekSave();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(160);
  await page.keyboard.press("Space"); // Activate RESUME; do not trigger the world interaction.
  await page.waitForTimeout(150);
  expect((await readSave(page))?.currentMap).toBe("creek");
  await page.keyboard.press("KeyE");
  await waitForSave(page, { currentMap: "neighborhood" });

  await installCreekSave();
  await page.keyboard.press("KeyB");
  await page.waitForTimeout(160);
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  expect((await readSave(page))?.currentMap).toBe("creek");
  await page.keyboard.press("KeyE");
  await waitForSave(page, { currentMap: "neighborhood" });
});

test("the mushroom finale leaves the backpack responsive", async ({ page }) => {
  await page.goto("/");
  await waitForSave(page, { version: 8 });
  await page.evaluate(() => localStorage.setItem("milton-estates-save", JSON.stringify({
    version: 4,
    activeChapterId: "chapter_1",
    activeQuestId: "andrew_mushroom_hunt",
    completedChapterIds: [],
    completedQuestIds: ["missing_controller"],
    questStage: "give_mushrooms_to_andrew",
    questProgress: {
      missingControllerStage: "complete",
      mushrooms: {
        stage: "give_mushrooms_to_andrew",
        spawns: Array.from({ length: 10 }, (_, index) => ({
          id: `finale-mushroom-${index}`,
          map: index < 5 ? "neighborhood" : "creek",
          x: 200 + index * 30,
          y: 300 + index * 20,
        })),
        collectedIds: Array.from({ length: 10 }, (_, index) => `finale-mushroom-${index}`),
      },
      sports: { stage: "meet_jeremy_to_skateboard" },
    },
    questHistory: [
      "missing_controller.started",
      "missing_controller.andrew_consulted",
      "missing_controller.creek_clue_found",
      "missing_controller.controller_recovered",
      "missing_controller.controller_returned",
      "andrew_mushroom_hunt.started",
      "andrew_mushroom_hunt.all_collected",
      "andrew_mushroom_hunt.jeremy_fed",
      "andrew_mushroom_hunt.billy_supplied",
    ],
    inventory: ["xbox_controller"],
    secrets: [],
    currentMap: "neighborhood",
    discoveredMaps: ["neighborhood", "creek"],
    settings: { masterVolume: 1, muted: false, textSize: "medium", reducedMotion: false },
    lastSavedAt: "2026-07-16T12:00:00.000Z",
  })));
  await page.reload();
  await continueGame(page);
  await teleportAndInteract(page);
  await advanceDialogue(page, 3);
  await waitForSave(page, {
    activeQuestId: "andrew_mushroom_hunt",
    questStage: "complete",
    completedQuestIds: ["missing_controller", "andrew_mushroom_hunt"],
  });

  await toggleSoundFromBackpack(page, "Escape");
  await expect.poll(() => readSave(page)).toMatchObject({ settings: { muted: true } });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(160);

  await toggleSoundFromBackpack(page, "KeyB");
  await expect.poll(() => readSave(page)).toMatchObject({ settings: { muted: false } });
});

test("starts and completes the rendered mushroom quest without losing menu input", async ({ page }) => {
  test.slow();
  await page.goto("/");
  await waitForSave(page, { version: 8 });
  await page.evaluate(() => localStorage.setItem("milton-estates-save", JSON.stringify({
    version: 4,
    activeChapterId: "chapter_1",
    activeQuestId: "missing_controller",
    completedChapterIds: [],
    completedQuestIds: ["missing_controller"],
    questStage: "complete",
    questProgress: {
      missingControllerStage: "complete",
      mushrooms: {
        stage: "talk_to_andrew_for_mushrooms",
        spawns: Array.from({ length: 10 }, (_, index) => ({
          id: `rendered-mushroom-${index}`,
          map: index < 5 ? "neighborhood" : "creek",
          x: 330 + (index % 5) * 250,
          y: 410 + (index % 5) * 160,
        })),
        collectedIds: [],
      },
      sports: { stage: "meet_jeremy_to_skateboard" },
    },
    questHistory: [
      "missing_controller.started",
      "missing_controller.andrew_consulted",
      "missing_controller.creek_clue_found",
      "missing_controller.controller_recovered",
      "missing_controller.controller_returned",
    ],
      inventory: ["xbox_controller"],
    secrets: [],
    currentMap: "neighborhood",
    discoveredMaps: ["neighborhood", "creek"],
    settings: { masterVolume: 1, muted: false, textSize: "medium", reducedMotion: false },
    lastSavedAt: "2026-07-16T12:00:00.000Z",
  })));
  await page.reload();
  await continueGame(page);

  await startQuestFromJournal(page, 1); // Mushrooms for Andrew.
  await waitForSave(page, { activeQuestId: "andrew_mushroom_hunt", questStage: "talk_to_andrew_for_mushrooms" });

  // The menu must still be alive immediately after it launched the world.
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(120);
  await page.mouse.click(760, 115);
  await page.waitForTimeout(100);
  await page.mouse.click(190, 335);
  await expect.poll(() => readSave(page)).toMatchObject({ settings: { muted: true } });
  await page.keyboard.press("Escape");

  await teleportAndInteract(page);
  await advanceDialogue(page, 4);
  await waitForSave(page, { questStage: "search_mushrooms" });

  for (let expected = 1; expected <= 5; expected += 1) {
    await teleportAndInteract(page);
    await expect.poll(async () => (await readSave(page))?.questProgress.mushrooms.collectedIds.length).toBe(expected);
    await advanceDialogue(page, 1);
  }

  await teleportAndInteract(page); // Enter Creek Woods after the neighborhood is clear.
  await waitForSave(page, { currentMap: "creek" });
  for (let expected = 6; expected <= 10; expected += 1) {
    await teleportAndInteract(page);
    await expect.poll(async () => (await readSave(page))?.questProgress.mushrooms.collectedIds.length).toBe(expected);
    await advanceDialogue(page, 1);
  }
  await waitForSave(page, { questStage: "feed_mushroom_to_jeremy" });

  await teleportAndInteract(page); // Return to Wheatfield Drive.
  await waitForSave(page, { currentMap: "neighborhood" });
  await teleportAndInteract(page);
  await advanceDialogue(page, 3);
  await waitForSave(page, { questStage: "place_mushroom_at_billy" });
  await teleportAndInteract(page);
  await advanceDialogue(page, 2);
  await waitForSave(page, { questStage: "give_mushrooms_to_andrew" });
  await teleportAndInteract(page);
  await advanceDialogue(page, 3);
  await waitForSave(page, {
    questStage: "complete",
    completedQuestIds: ["missing_controller", "andrew_mushroom_hunt"],
  });

  await page.keyboard.press("KeyB");
  await page.waitForTimeout(120);
  await page.mouse.click(760, 115);
  await page.waitForTimeout(100);
  await page.mouse.click(190, 335);
  await expect.poll(() => readSave(page)).toMatchObject({ settings: { muted: false } });
});

test("starts and completes the rendered Three-Player Sports quest", async ({ page }) => {
  await page.goto("/");
  await waitForSave(page, { version: 8 });
  await page.evaluate(() => localStorage.setItem("milton-estates-save", JSON.stringify({
    version: 4,
    activeChapterId: "chapter_1",
    activeQuestId: "missing_controller",
    completedChapterIds: [],
    completedQuestIds: ["missing_controller", "andrew_mushroom_hunt"],
    questStage: "complete",
    questProgress: {
      missingControllerStage: "complete",
      mushrooms: {
        stage: "complete",
        spawns: Array.from({ length: 10 }, (_, index) => ({
          id: `sports-mushroom-${index}`,
          map: index < 5 ? "neighborhood" : "creek",
          x: 200 + index * 30,
          y: 300 + index * 20,
        })),
        collectedIds: Array.from({ length: 10 }, (_, index) => `sports-mushroom-${index}`),
      },
      sports: { stage: "meet_jeremy_to_skateboard" },
    },
    questHistory: [
      "missing_controller.started",
      "missing_controller.andrew_consulted",
      "missing_controller.creek_clue_found",
      "missing_controller.controller_recovered",
      "missing_controller.controller_returned",
      "andrew_mushroom_hunt.started",
      "andrew_mushroom_hunt.all_collected",
      "andrew_mushroom_hunt.jeremy_fed",
      "andrew_mushroom_hunt.billy_supplied",
      "andrew_mushroom_hunt.andrew_supplied",
    ],
    inventory: ["xbox_controller"],
    secrets: [],
    currentMap: "neighborhood",
    discoveredMaps: ["neighborhood", "creek"],
    settings: { masterVolume: 1, muted: false, textSize: "medium", reducedMotion: false },
    lastSavedAt: "2026-07-16T12:00:00.000Z",
  })));
  await page.reload();
  await continueGame(page);

  // Start the optional quest through its actual journal card rather than
  // injecting the active quest. This proves prerequisite unlock + MenuScene
  // launch work together in the rendered game.
  await startQuestFromJournal(page, 2); // Three-Player Sports Day.
  await waitForSave(page, {
    activeQuestId: "three_player_sports",
    questStage: "meet_jeremy_to_skateboard",
  });

  await teleportAndInteract(page);
  await advanceDialogue(page, 3);
  await waitForSave(page, { questStage: "meet_billy_to_play_baseball" });

  await teleportAndInteract(page);
  await advanceDialogue(page, 3);
  await waitForSave(page, { questStage: "meet_andrew_to_play_basketball" });

  await teleportAndInteract(page);
  await advanceDialogue(page, 3);
  await waitForSave(page, {
    activeQuestId: "catch_ryan",
    questStage: "invite",
    completedQuestIds: ["missing_controller", "andrew_mushroom_hunt", "three_player_sports"],
  });
  expect((await readSave(page))?.questHistory).toEqual(expect.arrayContaining([
    "three_player_sports.started",
    "three_player_sports.skateboarded",
    "three_player_sports.played_baseball",
    "three_player_sports.played_basketball",
  ]));

  // The completed scene is still usable after its sports meet-up props are
  // replaced by the ordinary neighborhood cast.
  await page.waitForTimeout(200);
  await page.keyboard.press("KeyB");
  await page.waitForTimeout(120);
  await page.mouse.click(760, 115); // Settings tab.
  await page.waitForTimeout(100);
  await page.mouse.click(190, 335);
  await expect.poll(() => readSave(page)).toMatchObject({ settings: { muted: true } });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(180);

  // Follow Ryan through both automatic scene handoffs. The debug relocation
  // keeps this focused on the boundary contract rather than catch-up pacing.
  await teleportAndInteract(page);
  await advanceDialogue(page, 1);
  await page.keyboard.press("Space"); // Accept Ryan's invitation.
  await page.waitForTimeout(100);
  await advanceDialogue(page, 1);
  await page.keyboard.press("Space"); // Choose Reidenbaugh.
  await page.waitForTimeout(100);
  await advanceDialogue(page, 1);
  await page.waitForTimeout(160);
  await page.keyboard.press("F4");
  await waitForSave(page, { currentMap: "stonehenge", questStage: "ride_stonehenge" });
  await page.waitForTimeout(500);
  await page.keyboard.press("F4");
  await page.waitForTimeout(500);
  await page.keyboard.press("F4");
  await waitForSave(page, { currentMap: "reidenbaugh", questStage: "chase_reidenbaugh" });
});
