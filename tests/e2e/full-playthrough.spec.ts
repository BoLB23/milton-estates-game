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

type MockCloudSave = { data: unknown; revision: number; createdAt: string; updatedAt: string };
let e2eCloudSaves = new Map<string, MockCloudSave>();

async function readSave(page: Page): Promise<BrowserSave | null> {
  return page.evaluate(() => {
    const cacheKey = Object.keys(localStorage).find((key) => key.startsWith("@game-platform/cloud-save/milton-estates/"));
    const raw = cacheKey ? localStorage.getItem(cacheKey) : null;
    if (!raw) return null;

    const cached = JSON.parse(raw) as { data: BrowserSave };
    const save = cached.data;
    const questStage = save.activeQuestId === "andrew_mushroom_hunt"
      ? save.questProgress.mushrooms.stage
      : save.activeQuestId === "three_player_sports"
        ? save.questProgress.sports.stage
        : save.activeQuestId === "catch_ryan"
          ? save.questProgress.ryanRide.stage
          : save.activeQuestId === "explore_bent_creek"
            ? save.questProgress.exploreBentCreek.stage
          : save.questProgress.missingControllerStage;
    return { ...save, version: 8, questStage };
  });
}

async function seedPrimaryCloudSave(
  page: Page,
  configure: (save: Record<string, unknown>) => void,
): Promise<void> {
  // Start from the real new-save schema instead of maintaining a second,
  // browser-only test fixture. The next load retrieves this payload through
  // the mocked SDK endpoint exactly as a returning player would.
  e2eCloudSaves.clear();
  await page.goto("/");
  await startNewGame(page);
  const cloudData = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("@game-platform/cloud-save/milton-estates/"));
    return key ? (JSON.parse(localStorage.getItem(key)!) as { data: Record<string, unknown> }).data : undefined;
  });
  expect(cloudData).toBeDefined();
  const save = cloudData as Record<string, unknown>;
  configure(save);
  e2eCloudSaves.set("primary", {
    data: save,
    revision: 1,
    createdAt: "2026-08-06T12:00:00.000Z",
    updatedAt: "2026-08-06T12:00:00.000Z",
  });
  await page.reload();
  await continueGame(page);
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
  await page.waitForTimeout(550);
  // Required authentication resolves into the cloud-slot picker.
  if (process.env.CAPTURE_DOCS === "1") await page.screenshot({ path: "docs/checkpoint-3-title.png" });
  await page.mouse.click(230, 315); // New Game.
  await page.waitForTimeout(400);
  await advanceDialogue(page, 4); // Moving-in intro is skippable.
  await page.waitForTimeout(1_900);
  await waitForSave(page, { questStage: "talk_to_billy", currentMap: "neighborhood" });
  await teleportAndInteract(page); // Billy assigns the first controller quest.
  await advanceDialogue(page, 3);
  await waitForSave(page, {
    questStage: "talk_to_jeremy",
    questHistory: ["missing_controller.started"],
  });
}

async function continueGame(page: Page): Promise<void> {
  await page.waitForTimeout(550);
  await page.mouse.click(665, 230); // Continue the primary cloud slot.
  await page.waitForTimeout(550);
}

async function openBillyQuestJournal(page: Page): Promise<void> {
  // The full archive is intentionally a Billy conversation, not an ordinary
  // backpack tab. A second relocation makes this resilient when the first
  // debug key lands while the restored world is still creating its anchors.
  await page.waitForTimeout(700);
  await page.keyboard.press("F4");
  await page.waitForTimeout(500);
  await page.keyboard.press("F4");
  await page.waitForTimeout(500);
  await clickInteractionPrompt(page);
  await page.waitForTimeout(170);
  // Billy presents the journal as the first choice of his idle conversation.
  await page.mouse.click(480, 290);
  await page.waitForTimeout(250);
}

async function startQuestFromBillyArchive(page: Page, questIndex: number): Promise<void> {
  await openBillyQuestJournal(page);
  await page.mouse.click(150, 219 + questIndex * 42); // Authored quest row.
  await page.waitForTimeout(250);
  await page.keyboard.press("Space"); // Start / continue / replay action.
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

/** Browser tests use the real SDK request shapes against an in-page mock API. */
test.beforeEach(async ({ page }) => {
  e2eCloudSaves = new Map<string, MockCloudSave>();
  await page.route("**://localhost:8001/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const now = "2026-08-06T12:00:00.000Z";
    if (path.endsWith("/me/player")) {
      await route.fulfill({ json: { user_id: "e2e-player", nickname: "Molly", haircut: "short", hair_color: "brown", tshirt_color: "blue", pants_color: "denim", shoe_color: "white" } });
      return;
    }
    if (request.method() === "POST" && (path.endsWith("/games/milton-estates/sessions") || path.startsWith("/api/v1/game-sessions/"))) {
      await route.fulfill({ json: {
        id: "e2e-session", session_id: "e2e-session", user_id: "e2e-player", game_id: "milton-estates",
        game_slug: "milton-estates", started_at: now, last_heartbeat_at: now, ended_at: path.endsWith("/end") ? now : null,
        credited_playtime_seconds: 0,
      } });
      return;
    }
    const leaderboardSubmission = path.match(/\/games\/milton-estates\/leaderboards\/([^/]+)\/entries$/);
    if (leaderboardSubmission && request.method() === "POST") {
      const value = (request.postDataJSON() as { value: number }).value;
      await route.fulfill({ json: {
        entry: { user_id: "e2e-player", nickname: "Molly", display_name: "Molly", value, rank: 2 },
        rank: 2,
      } });
      return;
    }
    const leaderboardMatch = path.match(/\/leaderboards\/([^/]+)$/);
    if (leaderboardMatch && request.method() === "GET") {
      const survival = decodeURIComponent(leaderboardMatch[1]!).includes("longest-survival");
      const value = survival ? 850_000 : 12_000;
      await route.fulfill({ json: {
        definition: {},
        entries: [
          { user_id: "other-player", nickname: "June", display_name: "June", value, rank: 1 },
        ],
        current_user_entry: {
          user_id: "e2e-player", nickname: "Molly", display_name: "Molly",
          value: survival ? 855_000 : 12_300, rank: 2,
        },
        current_user_rank: 2,
      } });
      return;
    }
    const match = path.match(/\/games\/milton-estates\/saves(?:\/([^/]+))?$/);
    if (!match) { await route.fulfill({ status: 404, json: { detail: "not found" } }); return; }
    const slot = match[1] ? decodeURIComponent(match[1]) : undefined;
    const serialize = (slotKey: string, save: { data: unknown; revision: number; createdAt: string; updatedAt: string }) => ({
      id: `e2e-${slotKey}`, slot_key: slotKey, game_version: "2026.08", schema_version: 1, revision: save.revision,
      byte_size: JSON.stringify(save.data).length, created_at: save.createdAt, updated_at: save.updatedAt, data: save.data,
    });
    if (!slot && request.method() === "GET") {
      await route.fulfill({ json: [...e2eCloudSaves.entries()].map(([slotKey, save]) => {
        const { data: _data, ...metadata } = serialize(slotKey, save); return metadata;
      }) });
      return;
    }
    if (!slot) { await route.fulfill({ status: 404, json: { detail: "not found" } }); return; }
    if (request.method() === "GET") {
      const save = e2eCloudSaves.get(slot);
      await route.fulfill(save ? { json: serialize(slot, save) } : { status: 404, json: { detail: "missing" } });
      return;
    }
    if (request.method() === "PUT") {
      const input = request.postDataJSON() as { data: unknown; expected_revision: number | null };
      const previous = e2eCloudSaves.get(slot);
      if ((previous?.revision ?? null) !== input.expected_revision) {
        await route.fulfill({ status: 409, json: { detail: "revision conflict" } }); return;
      }
      const save = { data: input.data, revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
      e2eCloudSaves.set(slot, save);
      await route.fulfill({ json: serialize(slot, save) });
      return;
    }
    if (request.method() === "DELETE") { e2eCloudSaves.delete(slot); await route.fulfill({ status: 204 }); return; }
    await route.fulfill({ status: 405, json: { detail: "method" } });
  });
});

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
    inventory: [],
    questHistory: [
      "missing_controller.started",
      "missing_controller.andrew_consulted",
      "missing_controller.creek_clue_found",
      "missing_controller.controller_recovered",
      "missing_controller.controller_returned",
    ],
  });
});

test("preserves dialogue through pause", async ({ page }) => {
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

  await page.reload();
  await continueGame(page);
  await waitForSave(page, { questStage: "talk_to_andrew", currentMap: "neighborhood" });
});

test("cloud slots hydrate completed canonical progress without a returned controller", async ({ page }) => {
  await page.goto("/");
  await startNewGame(page);
  const cloudData = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("@game-platform/cloud-save/milton-estates/"));
    return key ? (JSON.parse(localStorage.getItem(key)!) as { data: Record<string, unknown> }).data : undefined;
  });
  expect(cloudData).toBeDefined();
  const seeded = cloudData as Record<string, unknown>;
  seeded.activeQuestId = "missing_controller";
  seeded.completedQuestIds = ["missing_controller"];
  (seeded.questProgress as Record<string, unknown>).missingControllerStage = "complete";
  seeded.inventory = [];
  e2eCloudSaves.set("primary", { data: seeded, revision: 1, createdAt: "2026-08-06T12:00:00.000Z", updatedAt: "2026-08-06T12:00:00.000Z" });
  await page.reload();
  await continueGame(page);
  await waitForSave(page, { questStage: "complete", inventory: [] });
});

test("Billy can reset an active controller quest and remove its temporary controller", async ({ page }) => {
  await page.goto("/");
  await seedPrimaryCloudSave(page, (save) => {
    save.activeQuestId = "missing_controller";
    save.completedQuestIds = [];
    (save.questProgress as Record<string, unknown>).missingControllerStage = "return_to_jeremy";
    save.questHistory = [
      "missing_controller.started",
      "missing_controller.andrew_consulted",
      "missing_controller.creek_clue_found",
      "missing_controller.controller_recovered",
    ];
    save.inventory = [
      { itemId: "xbox_controller", quantity: 1 },
      { itemId: "field_token", quantity: 1 },
    ];
    save.currentMap = "neighborhood";
    save.lastKnownLocation = { map: "neighborhood", x: 816 / 1440, y: 592 / 1088 };
  });
  await waitForSave(page, {
    questStage: "return_to_jeremy",
    inventory: [
      { itemId: "xbox_controller", quantity: 1 },
      { itemId: "field_token", quantity: 1 },
    ],
  });

  await clickInteractionPrompt(page); // Resume position is inside Billy's single interaction region.
  await page.waitForTimeout(170);
  await page.mouse.click(480, 290); // Open Billy's first-choice quest journal.
  await page.waitForTimeout(250);
  // Canvas coordinates can land outside a text button after accessibility
  // scaling; exercise the same focus path used by keyboard/gamepad players.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space"); // Arm RESET QUEST.
  await page.waitForTimeout(180);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space"); // Confirm the canonical reset.

  await waitForSave(page, {
    activeQuestId: "missing_controller",
    questStage: "talk_to_billy",
    questHistory: [],
    inventory: [{ itemId: "field_token", quantity: 1 }],
    currentMap: "neighborhood",
  });
});

test("Billy defaults a completed Controller save to Andrew's next quest without a row click", async ({ page }) => {
  await page.goto("/");
  await seedPrimaryCloudSave(page, (save) => {
    save.activeQuestId = "missing_controller";
    save.completedQuestIds = ["missing_controller"];
    (save.questProgress as Record<string, unknown>).missingControllerStage = "complete";
  });
  await openBillyQuestJournal(page);
  // The journal must select the next available quest itself. Clicking its
  // action immediately would restart Missing Controller if a completed
  // activeQuestId still won selection precedence.
  await page.keyboard.press("Space");
  await waitForSave(page, {
    activeQuestId: "andrew_mushroom_hunt",
    questStage: "talk_to_andrew_for_mushrooms",
  });

  // Opening the ordinary Backpack afterward must show Status, not Billy's
  // journal. Clicking the old archive row/action positions changes nothing.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.mouse.click(150, 240);
  await page.mouse.click(710, 418);
  await page.waitForTimeout(200);
  expect(await readSave(page)).toMatchObject({
    activeQuestId: "andrew_mushroom_hunt",
    questStage: "talk_to_andrew_for_mushrooms",
  });
});

test("Billy continues a replay without resetting it or persisting replay progress", async ({ page }) => {
  await page.goto("/");
  await seedPrimaryCloudSave(page, (save) => {
    save.activeQuestId = "missing_controller";
    save.completedQuestIds = ["missing_controller"];
    (save.questProgress as Record<string, unknown>).missingControllerStage = "complete";
    save.currentMap = "neighborhood";
    save.lastKnownLocation = { map: "neighborhood", x: 816 / 1440, y: 592 / 1088 };
  });

  await openBillyQuestJournal(page);
  // Missing Controller is immediately before the default Andrew row. Use the
  // journal's controller/keyboard navigation, rather than canvas hit testing,
  // to select the replay deterministically.
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  // A replay is runtime-only. Its first stage must never replace the
  // completed canonical payload that the browser will reload.
  await waitForSave(page, { activeQuestId: "missing_controller", questStage: "complete" });
  await page.keyboard.press("KeyE");
  await advanceDialogue(page, 3);

  // Reopen Billy during the replay. CONTINUE REPLAY closes the journal; it
  // must not call the replay initializer again and lose this first handoff.
  await openBillyQuestJournal(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);
  expect(await readSave(page)).toMatchObject({
    activeQuestId: "missing_controller",
    questStage: "complete",
  });

  // A later quest remains visible in the archive but its stale/click action
  // cannot replace the active replay.
  await openBillyQuestJournal(page);
  await page.keyboard.press("ArrowRight"); // Andrew's row.
  await page.keyboard.press("Space"); // Locked rows intentionally have no action.
  await page.waitForTimeout(250);
  expect(await readSave(page)).toMatchObject({
    activeQuestId: "missing_controller",
    questStage: "complete",
  });
});

test("Billy opens the shared leaderboard browser from his idle conversation", async ({ page }) => {
  await page.goto("/");
  await seedPrimaryCloudSave(page, (save) => {
    save.activeQuestId = "missing_controller";
    save.completedQuestIds = ["missing_controller"];
    (save.questProgress as Record<string, unknown>).missingControllerStage = "complete";
    save.currentMap = "neighborhood";
    save.lastKnownLocation = { map: "neighborhood", x: 816 / 1440, y: 592 / 1088 };
  });

  const leaderboardRequest = page.waitForRequest((request) =>
    request.method() === "GET" && new URL(request.url()).pathname.includes("/leaderboards/"));
  await clickInteractionPrompt(page);
  await page.keyboard.press("ArrowDown"); // Browse leaderboards.
  await page.keyboard.press("Space");

  const request = await leaderboardRequest;
  expect(new URL(request.url()).searchParams.get("game_slug")).toBe("milton-estates");
});

test("Billy confirms before resetting an in-progress quest", async ({ page }) => {
  await page.goto("/");
  await seedPrimaryCloudSave(page, (save) => {
    save.activeQuestId = "andrew_mushroom_hunt";
    save.completedQuestIds = ["missing_controller"];
    const progress = save.questProgress as Record<string, unknown>;
    progress.missingControllerStage = "complete";
    progress.mushrooms = {
      stage: "search_mushrooms",
      spawns: [],
      collectedIds: [],
    };
    save.currentMap = "neighborhood";
    save.lastKnownLocation = { map: "neighborhood", x: 816 / 1440, y: 592 / 1088 };
  });

  // Resume at Billy; F4 would correctly target a mushroom during this stage.
  await clickInteractionPrompt(page);
  await page.waitForTimeout(170);
  await page.mouse.click(480, 290); // Open Billy's first-choice quest journal.
  await page.waitForTimeout(250);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space"); // Arm Reset Quest.
  await page.waitForTimeout(150);
  expect(await readSave(page)).toMatchObject({
    activeQuestId: "andrew_mushroom_hunt",
    questStage: "search_mushrooms",
  });

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space"); // Confirm reset after the journal rebuilds.
  await waitForSave(page, {
    activeQuestId: "andrew_mushroom_hunt",
    questStage: "talk_to_andrew_for_mushrooms",
  });
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

  const installCreekSave = async () => {
    await seedPrimaryCloudSave(page, (save) => {
      save.activeQuestId = "andrew_mushroom_hunt";
      save.completedQuestIds = ["missing_controller"];
      const progress = save.questProgress as Record<string, unknown>;
      progress.missingControllerStage = "complete";
      progress.mushrooms = {
        stage: "feed_mushroom_to_jeremy",
        spawns: Array.from({ length: 10 }, (_, index) => ({
          id: `test-mushroom-${index}`,
          map: index < 5 ? "neighborhood" : "creek",
          x: 200 + index * 30,
          y: 300 + index * 20,
        })),
        collectedIds: Array.from({ length: 10 }, (_, index) => `test-mushroom-${index}`),
      };
      progress.sports = { stage: "meet_jeremy_to_skateboard" };
      save.questHistory = [
        "missing_controller.started",
        "missing_controller.andrew_consulted",
        "missing_controller.creek_clue_found",
        "missing_controller.controller_recovered",
        "missing_controller.controller_returned",
        "andrew_mushroom_hunt.started",
        "andrew_mushroom_hunt.all_collected",
      ];
      save.inventory = [{ itemId: "xbox_controller", quantity: 1 }];
      save.currentMap = "creek";
      save.discoveredMaps = ["neighborhood", "creek"];
    });
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
  await seedPrimaryCloudSave(page, (save) => {
    save.activeQuestId = "andrew_mushroom_hunt";
    save.completedQuestIds = ["missing_controller"];
    const progress = save.questProgress as Record<string, unknown>;
    progress.missingControllerStage = "complete";
    progress.mushrooms = {
      stage: "give_mushrooms_to_andrew",
      spawns: Array.from({ length: 10 }, (_, index) => ({
        id: `finale-mushroom-${index}`,
        map: index < 5 ? "neighborhood" : "creek",
        x: 200 + index * 30,
        y: 300 + index * 20,
      })),
      collectedIds: Array.from({ length: 10 }, (_, index) => `finale-mushroom-${index}`),
    };
    progress.sports = { stage: "meet_jeremy_to_skateboard" };
    save.questHistory = [
      "missing_controller.started",
      "missing_controller.andrew_consulted",
      "missing_controller.creek_clue_found",
      "missing_controller.controller_recovered",
      "missing_controller.controller_returned",
      "andrew_mushroom_hunt.started",
      "andrew_mushroom_hunt.all_collected",
      "andrew_mushroom_hunt.jeremy_fed",
      "andrew_mushroom_hunt.billy_supplied",
    ];
    save.inventory = [{ itemId: "xbox_controller", quantity: 1 }];
    save.currentMap = "neighborhood";
    save.discoveredMaps = ["neighborhood", "creek"];
  });
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
  await seedPrimaryCloudSave(page, (save) => {
    save.activeQuestId = "andrew_mushroom_hunt";
    save.completedQuestIds = ["missing_controller"];
    const progress = save.questProgress as Record<string, unknown>;
    progress.missingControllerStage = "complete";
    progress.mushrooms = {
      stage: "talk_to_andrew_for_mushrooms",
      spawns: Array.from({ length: 10 }, (_, index) => ({
        id: `rendered-mushroom-${index}`,
        map: index < 5 ? "neighborhood" : "creek",
        x: 330 + (index % 5) * 250,
        y: 410 + (index % 5) * 160,
      })),
      collectedIds: [],
    };
    progress.sports = { stage: "meet_jeremy_to_skateboard" };
    save.questHistory = [
      "missing_controller.started",
      "missing_controller.andrew_consulted",
      "missing_controller.creek_clue_found",
      "missing_controller.controller_recovered",
      "missing_controller.controller_returned",
    ];
    save.inventory = [{ itemId: "xbox_controller", quantity: 1 }];
    save.currentMap = "neighborhood";
    save.discoveredMaps = ["neighborhood", "creek"];
  });

  // The canonical menu now keeps this archive behind Billy's conversation;
  // this progression regression begins with the optional quest already active.
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
  await page.keyboard.press("Space"); // Choose the mushroom handoff; journal remains the second option.
  await page.waitForTimeout(80);
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
  await seedPrimaryCloudSave(page, (save) => {
    save.activeQuestId = "missing_controller";
    save.completedQuestIds = ["missing_controller", "andrew_mushroom_hunt"];
    const progress = save.questProgress as Record<string, unknown>;
    progress.missingControllerStage = "complete";
    progress.mushrooms = {
      stage: "complete",
      spawns: Array.from({ length: 10 }, (_, index) => ({
        id: `sports-mushroom-${index}`,
        map: index < 5 ? "neighborhood" : "creek",
        x: 200 + index * 30,
        y: 300 + index * 20,
      })),
      collectedIds: Array.from({ length: 10 }, (_, index) => `sports-mushroom-${index}`),
    };
    progress.sports = { stage: "meet_jeremy_to_skateboard" };
    save.questHistory = [
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
    ];
    save.inventory = [{ itemId: "xbox_controller", quantity: 1 }];
    save.currentMap = "neighborhood";
    save.discoveredMaps = ["neighborhood", "creek"];
  });

  // Start it through Billy's archive rather than injecting an active quest.
  await startQuestFromBillyArchive(page, 2); // Three-Player Sports Day.
  await waitForSave(page, {
    activeQuestId: "three_player_sports",
    questStage: "meet_jeremy_to_skateboard",
  });

  await teleportAndInteract(page);
  await advanceDialogue(page, 3);
  await waitForSave(page, { questStage: "meet_billy_to_play_baseball" });

  await teleportAndInteract(page);
  await page.keyboard.press("Space"); // Choose baseball; journal remains available in Billy's choice.
  await page.waitForTimeout(80);
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
