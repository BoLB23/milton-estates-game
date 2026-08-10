import { expect, test, type Page } from "@playwright/test";
import { installCloudSaveApi, launchSeededCloudSave, readCloudData, type MockCloudSave } from "./cloudHarness";

const allMaps = ["neighborhood", "creek", "stonehenge", "reidenbaugh", "fruitville_pike", "bent_creek"];
const mushroomSpawns = Array.from({ length: 10 }, (_, index) => ({
  id: `qa-mushroom-${index}`,
  map: index < 5 ? "neighborhood" : "creek",
  x: 208 + index * 32,
  y: 528,
}));

function configureRegionalSave(save: Record<string, unknown>, map: string): void {
  save.activeQuestId = "catch_ryan";
  save.completedQuestIds = ["missing_controller", "andrew_mushroom_hunt", "three_player_sports", "catch_ryan"];
  save.questProgress = {
    ...(save.questProgress as Record<string, unknown>),
    missingControllerStage: "complete",
    mushrooms: { stage: "complete", spawns: mushroomSpawns, collectedIds: mushroomSpawns.map(({ id }) => id) },
    sports: { stage: "complete" },
    ryanRide: { stage: "complete", selectedDestination: "reidenbaugh", routeSeed: 42 },
    exploreBentCreek: { stage: "open_gate" },
  };
  save.questHistory = [
    "missing_controller.started", "missing_controller.andrew_consulted", "missing_controller.creek_clue_found",
    "missing_controller.controller_recovered", "missing_controller.controller_returned",
    "andrew_mushroom_hunt.started", "andrew_mushroom_hunt.all_collected", "andrew_mushroom_hunt.jeremy_fed",
    "andrew_mushroom_hunt.billy_supplied", "andrew_mushroom_hunt.andrew_supplied",
    "three_player_sports.started", "three_player_sports.skateboarded", "three_player_sports.played_baseball",
    "three_player_sports.played_basketball", "catch_ryan.started", "catch_ryan.destination_selected",
    "catch_ryan.neighborhood_departed", "catch_ryan.reidenbaugh_reached", "catch_ryan.ryan_caught",
  ];
  save.inventory = [{ itemId: "bicycle", quantity: 1 }];
  save.currentMap = map;
  save.lastKnownLocation = { map, x: 0.5, y: 0.5 };
  save.discoveredMaps = allMaps;
  save.unlockedMaps = allMaps;
}

let cloudSaves: Map<string, MockCloudSave>;
test.beforeEach(async ({ page }) => { cloudSaves = await installCloudSaveApi(page); });

async function launchMap(page: Page, map: string, saves = cloudSaves): Promise<void> {
  await launchSeededCloudSave(page, saves, (save) => configureRegionalSave(save, map));
  await expect(page.locator("canvas")).toBeVisible();
}

async function readStableSave(page: Page): Promise<string | null> {
  const save = await readCloudData(page);
  if (!save) return null;
  const stable = { ...save } as { lastSavedAt?: unknown; lastKnownLocation?: unknown };
  delete stable.lastSavedAt;
  delete stable.lastKnownLocation;
  return JSON.stringify(stable);
}

async function launchBentCreek(page: Page): Promise<void> {
  await launchMap(page, "bent_creek");
}

async function openGatePrompt(page: Page): Promise<void> {
  const nativeInput = page.locator('input[aria-label="Text entry"]');
  // On-demand scene starts are queued. Retry the idempotent debug relocation
  // until clicking the field proves the real modal is mounted.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press("F4");
    await page.waitForTimeout(500);
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(250);
    await page.mouse.click(480, 277);
    if (await nativeInput.count()) return;
  }
  await expect(nativeInput).toBeAttached();
}

async function pressTouchAction(page: Page, action: "menu" | "interact"): Promise<void> {
  await page.evaluate((semanticAction) => {
    const element = document.querySelector<HTMLElement>(`[data-game-action="${semanticAction}"]`);
    if (!element) throw new Error(`Missing touch action: ${semanticAction}`);
    // Synthetic pointer events are not registered with the browser's native
    // capture table, so keep this test focused on the game's touch listeners.
    Object.defineProperty(element, "setPointerCapture", { configurable: true, value: () => {} });
    element.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 91,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 1,
    }));
    element.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerId: 91,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 0,
    }));
  }, action);
  await page.waitForTimeout(180);
}

test("loads Bent Creek on demand and checkpoints the unlocked gate", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await launchBentCreek(page);

  await openGatePrompt(page);
  await page.keyboard.type("  Votilla  ");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);

  // F4 now targets the clubhouse, proving the accepted answer removed the
  // dynamic barrier instead of merely dismissing the modal.
  await page.keyboard.press("F4");
  await page.waitForTimeout(250);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(150);
  expect(pageErrors).toEqual([]);
  await expect.poll(async () => (await readCloudData(page))?.activeQuestId)
    .toBe("explore_bent_creek");
  await expect.poll(async () => ((await readCloudData(page))?.questProgress as Record<string, { stage?: string }> | undefined)?.exploreBentCreek?.stage)
    .toBe("meet_schwartz");
  await expect.poll(async () => (await readCloudData(page))?.currentMap)
    .toBe("bent_creek");
});

test("removes direct bicycle touch control and exposes Backpack item actions", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(900);
  await expect(page.locator('[data-game-action="toggleBicycle"]')).toHaveCount(0);

  await launchMap(page, "neighborhood");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(160);
  await page.mouse.click(430, 115); // Items tab.
  await page.waitForTimeout(160);
  await page.mouse.click(730, 242); // RIDE BIKE.
  await expect.poll(async () => ((await readCloudData(page))?.equipment as { transport?: string | null } | undefined)?.transport)
    .toBe("bicycle");
  await page.waitForTimeout(160);
  await page.mouse.click(730, 242); // PUT BIKE AWAY.
  await expect.poll(async () => ((await readCloudData(page))?.equipment as { transport?: string | null } | undefined)?.transport)
    .toBe(null);
});

test("the gate rejects an invalid answer without touching SaveData", async ({ page }) => {
  await launchBentCreek(page);
  await openGatePrompt(page);
  // Starting Bent Creek claims the regional quest asynchronously; capture the
  // baseline only once that legitimate scene initialization has settled.
  await page.waitForTimeout(300);
  const before = await readStableSave(page);
  await page.keyboard.type("someone");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
  expect(await readStableSave(page)).toBe(before);
});

test("a touch Backpack press cancels the gate prompt without opening the Backpack", async ({ page }) => {
  await launchBentCreek(page);
  await openGatePrompt(page);
  await page.waitForTimeout(300);
  const before = await readStableSave(page);

  await pressTouchAction(page, "menu");
  await page.mouse.click(760, 115); // Would select Settings if Backpack leaked open.
  await page.mouse.click(190, 335); // Would toggle sound on that page.
  expect(await readStableSave(page)).toBe(before);

  // A fresh back press must still open the Backpack after the cancellation.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // Five destinations: Status → Games → Backpack → Map → Settings.
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(60);
  }
  await page.keyboard.press("Space");
  await expect.poll(async () => ((await readCloudData(page))?.settings as { muted?: boolean } | undefined)?.muted).toBe(true);
});

test("renders Fruitville Pike as a separate on-demand regional scene", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await launchMap(page, "fruitville_pike");
  await page.keyboard.press("F4");
  await page.waitForTimeout(250);
  expect(pageErrors).toEqual([]);
  await expect.poll(async () => (await readCloudData(page))?.currentMap)
    .toBe("fruitville_pike");
});

test("captures independent QA evidence for every regional map", async ({ page }) => {
  test.skip(process.env.CAPTURE_MAP_QA !== "1", "set CAPTURE_MAP_QA=1 to capture map evidence");
  for (const map of allMaps) {
    // Use a fresh document for each plate so an on-demand scene from the
    // previous capture cannot remain active while the new v7 save boots.
    const mapPage = await page.context().newPage();
    const mapCloudSaves = await installCloudSaveApi(mapPage);
    const pageErrors: string[] = [];
    mapPage.on("pageerror", (error) => pageErrors.push(error.message));
    await launchMap(mapPage, map, mapCloudSaves);
    console.log(`QA map ${map}: ${(await readCloudData(mapPage))?.currentMap}`);
    await mapPage.screenshot({ path: `docs/assets/map-expansion/qa/${map}.png` });
    if (map !== "creek") {
      await mapPage.keyboard.press("F2");
      await mapPage.waitForTimeout(250);
      await mapPage.screenshot({ path: `docs/assets/map-expansion/qa/${map}-geometry.png` });
    }
    expect(pageErrors).toEqual([]);
    await mapPage.close();
  }
});
