import { afterEach, describe, expect, it, vi } from "vitest";

import { isAuthoredMushroomSpawnPosition } from "../content/mushrooms";
import { EVENT, gameEvents } from "./events";
import { CONTROLLER_ITEM, GameStore } from "./GameStore";
import legacyMushroomLayout from "./persistence/fixtures/legacy-mushroom-layout.json";
import realisticV6Save from "./persistence/fixtures/v6-realistic-save.json";
import { validateSaveInvariants } from "./persistence/questState";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  public get length(): number { return this.values.size; }
  public clear(): void { this.values.clear(); }
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  public removeItem(key: string): void { this.values.delete(key); }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
}

const savedAt = new Date("2026-07-12T18:30:00.000Z");
const makeStore = (storage = new MemoryStorage()) => new GameStore(storage, () => savedAt);

function completeCatchRyan(store: GameStore): void {
  store.setActiveQuest("chapter_1", "catch_ryan");
  store.acceptRyanRide();
  store.selectRyanRideDestination("reidenbaugh", 42);
  store.departNeighborhoodRide();
  store.reachReidenbaugh();
  store.catchRyan();
}

afterEach(() => gameEvents.removeAllListeners());

describe("GameStore save v8", () => {
  it("identifies whether this browser had a save before the initial autosave", () => {
    const freshStorage = new MemoryStorage();
    const returningStorage = new MemoryStorage();
    returningStorage.setItem("milton-estates-save", "not json");

    expect(makeStore(freshStorage).isFirstVisit()).toBe(true);
    expect(makeStore(returningStorage).isFirstVisit()).toBe(false);
  });

  it("starts with trustworthy mission and menu defaults", () => {
    expect(makeStore().getState()).toMatchObject({
      version: 8,
      activeChapterId: "chapter_1",
      activeQuestId: "missing_controller",
      completedChapterIds: [],
      completedQuestIds: [],
      questStage: "talk_to_jeremy",
      questHistory: [],
      inventory: [],
      secrets: [],
      currentMap: "neighborhood",
      discoveredMaps: ["neighborhood"],
      unlockedMaps: ["neighborhood", "creek"],
      settings: { masterVolume: 1, muted: false, textSize: "medium", reducedMotion: false },
      lastSavedAt: null,
    });
  });

  it("migrates a realistic v6 playthrough without losing player or quest state", () => {
    const storage = new MemoryStorage();
    storage.setItem("milton-estates-save", JSON.stringify(realisticV6Save));

    const state = makeStore(storage).getState();
    expect(state).toMatchObject({
      version: 8,
      activeQuestId: "catch_ryan",
      completedQuestIds: ["missing_controller", "andrew_mushroom_hunt", "three_player_sports"],
      currentMap: "stonehenge",
      discoveredMaps: ["neighborhood", "stonehenge", "creek"],
      unlockedMaps: ["neighborhood", "creek", "stonehenge", "reidenbaugh", "fruitville_pike", "bent_creek"],
      questStage: "ride_stonehenge",
      inventory: [{ itemId: CONTROLLER_ITEM, quantity: 1 }],
      secrets: ["creek_token", "andrew_note"],
      settings: { masterVolume: 0.35, muted: true, textSize: "large", reducedMotion: true },
      lastSavedAt: "2026-07-31T22:14:09.000Z",
    });
    expect(state.questProgress.ryanRide).toEqual({
      stage: "ride_stonehenge",
      selectedDestination: "reidenbaugh",
      routeSeed: 20070818,
    });
    expect(state.questHistory).toEqual(realisticV6Save.questHistory);
    expect(state.questProgress.mushrooms.collectedIds).toEqual(
      realisticV6Save.questProgress.mushrooms.collectedIds,
    );
    expect(state.questProgress.mushrooms.spawns.map(({ id }) => id)).toEqual(
      realisticV6Save.questProgress.mushrooms.spawns.map(({ id }) => id),
    );
    expect(state.questProgress.mushrooms.spawns.every(isAuthoredMushroomSpawnPosition)).toBe(true);
    expect(validateSaveInvariants(state)).toEqual([]);

    const persisted = JSON.parse(storage.getItem("milton-estates-save") ?? "null");
    expect(persisted).toMatchObject({ version: 8, currentMap: "stonehenge" });
    expect(JSON.stringify(persisted)).not.toContain("reidenbaugh_road");
    expect(persisted.questProgress.mushrooms.spawns).toEqual(state.questProgress.mushrooms.spawns);
  });

  it("decodes valid v7 state and rejects a current map that is not unlocked", () => {
    const storage = new MemoryStorage();
    const writer = makeStore(storage);
    writer.setCurrentMap("creek");
    const valid = makeStore(storage).getState();
    expect(valid.version).toBe(8);
    expect(validateSaveInvariants(valid)).toEqual([]);

    const invalid = JSON.parse(storage.getItem("milton-estates-save") ?? "null");
    invalid.currentMap = "stonehenge";
    invalid.discoveredMaps = ["neighborhood", "stonehenge"];
    invalid.unlockedMaps = ["neighborhood", "creek"];
    storage.setItem("milton-estates-save", JSON.stringify(invalid));

    expect(makeStore(storage).getState()).toMatchObject({
      version: 8,
      currentMap: "neighborhood",
      discoveredMaps: ["neighborhood"],
      unlockedMaps: ["neighborhood", "creek"],
    });
  });

  it.each([
    "not json",
    JSON.stringify({ version: 3, questStage: "complete" }),
    JSON.stringify({ version: 1, questStage: "unknown", inventory: [], secrets: [], currentMap: "creek" }),
    JSON.stringify({ version: 2, questStage: "complete", questHistory: ["made_up"], inventory: [], secrets: [], currentMap: "creek", discoveredMaps: ["creek"], settings: {}, lastSavedAt: null }),
  ])("ignores a corrupt or invalid save: %s", (savedValue) => {
    const storage = new MemoryStorage();
    storage.setItem("milton-estates-save", savedValue);
    expect(makeStore(storage).getState().questStage).toBe("talk_to_jeremy");
  });

  it("records semantic history, map discovery, settings, and a successful-save timestamp", () => {
    const storage = new MemoryStorage();
    const listener = vi.fn();
    gameEvents.on(EVENT.stateChanged, listener);
    const store = makeStore(storage);

    store.setQuestStage("search_creek");
    store.addInventoryItem(CONTROLLER_ITEM);
    store.addInventoryItem(CONTROLLER_ITEM);
    store.addSecret("creek_token");
    store.setCurrentMap("creek");
    store.updateSettings({ textSize: "large", reducedMotion: true });

    expect(store.getState()).toMatchObject({
      version: 8,
      activeChapterId: "chapter_1",
      activeQuestId: "missing_controller",
      completedChapterIds: [],
      completedQuestIds: [],
      questStage: "search_creek",
      questHistory: ["missing_controller.started", "missing_controller.andrew_consulted", "missing_controller.creek_clue_found"],
      inventory: [{ itemId: CONTROLLER_ITEM, quantity: 1 }],
      secrets: ["creek_token"],
      currentMap: "creek",
      discoveredMaps: ["neighborhood", "creek"],
      settings: { masterVolume: 1, muted: false, textSize: "large", reducedMotion: true },
      lastSavedAt: savedAt.toISOString(),
    });
    expect(listener).toHaveBeenCalledTimes(5);
    expect(listener).toHaveBeenLastCalledWith(store.getState());
    expect(makeStore(storage).getState()).toEqual(store.getState());
    expect(JSON.parse(storage.getItem("milton-estates-save") ?? "null")).not.toHaveProperty("questStage");
  });

  it.each(["xbox-controller", "xbox controller", CONTROLLER_ITEM])(
    "migrates v1 controller alias %s and reconstructs semantic progress",
    (controllerAlias) => {
      const storage = new MemoryStorage();
      storage.setItem("milton-estates-save", JSON.stringify({
        version: 1,
        questStage: "return_to_jeremy",
        inventory: [controllerAlias, CONTROLLER_ITEM],
        secrets: ["creek_token"],
        currentMap: "creek",
      }));

      const state = makeStore(storage).getState();
      expect(state).toMatchObject({
      version: 8,
        questStage: "return_to_jeremy",
        questHistory: ["missing_controller.started", "missing_controller.andrew_consulted", "missing_controller.creek_clue_found", "missing_controller.controller_recovered"],
        inventory: [{ itemId: CONTROLLER_ITEM, quantity: 1 }],
        discoveredMaps: ["neighborhood", "creek"],
        lastSavedAt: null,
      });
      const persisted = JSON.parse(storage.getItem("milton-estates-save") ?? "null");
      expect(persisted.version).toBe(8);
      expect(persisted).not.toHaveProperty("questStage");
    },
  );

  it("normalizes aliases and missing current-map discovery in an existing v2 save", () => {
    const storage = new MemoryStorage();
    storage.setItem("milton-estates-save", JSON.stringify({
      version: 2,
      questStage: "complete",
      questHistory: ["missing_controller.controller_returned", "missing_controller.controller_returned"],
      inventory: ["xbox-controller"],
      secrets: [],
      currentMap: "creek",
      discoveredMaps: [],
      settings: { masterVolume: 0.5, muted: true, textSize: "small", reducedMotion: true },
      lastSavedAt: "2026-07-01T12:00:00.000Z",
    }));

    const state = makeStore(storage).getState();
    expect(state.inventory).toEqual([{ itemId: CONTROLLER_ITEM, quantity: 1 }]);
    expect(state.questHistory).toEqual(["missing_controller.controller_returned"]);
    expect(state.discoveredMaps).toEqual(["neighborhood", "creek"]);
    expect(state.completedQuestIds).toEqual(["missing_controller"]);
    expect(JSON.parse(storage.getItem("milton-estates-save") ?? "null").version).toBe(8);
  });

  it("isolates replay inventory, secrets, history, completion, saves, and map discovery", () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);
    store.setQuestStage("complete");
    store.addInventoryItem(CONTROLLER_ITEM);
    store.addSecret("creek_token");
    const canonical = store.getCanonicalState();
    const persisted = storage.getItem("milton-estates-save");
    const writeSpy = vi.spyOn(storage, "setItem");

    store.startQuestReplay("missing_controller");
    expect(store.isReplaying()).toBe(true);
    expect(store.getState()).toMatchObject({
      questStage: "talk_to_jeremy",
      questHistory: [],
      inventory: [],
      secrets: [],
      currentMap: "neighborhood",
      completedQuestIds: ["missing_controller"],
    });
    store.setQuestStage("search_creek");
    store.addInventoryItem(CONTROLLER_ITEM);
    store.addSecret("replay-only-secret");
    store.setCurrentMap("creek");
    store.saveNow();

    expect(writeSpy).not.toHaveBeenCalled();
    expect(storage.getItem("milton-estates-save")).toBe(persisted);
    expect(store.getCanonicalState()).toEqual(canonical);

    expect(store.endQuestReplay()).toBe(true);
    expect(store.isReplaying()).toBe(false);
    expect(store.getState()).toEqual(canonical);
    expect(store.endQuestReplay()).toBe(false);

  });

  it("rejects replay for incomplete or unimplemented quests", () => {
    const store = makeStore();
    expect(() => store.startQuestReplay("missing_controller")).toThrow(RangeError);
    store.setQuestStage("complete");
    expect(() => store.startQuestReplay("storm_drain_detectives")).toThrow(RangeError);
  });

  it("saveNow refreshes lastSavedAt without changing mission progress", () => {
    const store = makeStore();
    const before = store.getState();
    store.saveNow();
    expect(store.getState()).toEqual({ ...before, lastSavedAt: savedAt.toISOString() });
  });

  it("retains the previous saved timestamp when persistence fails", () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);
    store.saveNow();
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    store.setQuestStage("talk_to_andrew");
    expect(store.getState().lastSavedAt).toBe(savedAt.toISOString());
    expect(store.getState().questStage).toBe("talk_to_andrew");
  });

  it("does not expose mutable nested state", () => {
    const store = makeStore();
    const snapshot = store.getState();
    snapshot.inventory.push({ itemId: "field_token", quantity: 1 });
    snapshot.questHistory.push("missing_controller.controller_returned");
    snapshot.discoveredMaps.push("creek");
    snapshot.settings.muted = true;
    expect(store.getState()).not.toEqual(snapshot);
  });

  it("offers cheap gameplay selectors without exposing mutable save state", () => {
    const store = makeStore();
    expect(store.isQuestActive("missing_controller")).toBe(true);
    expect(store.isQuestAt("missing_controller", "talk_to_jeremy")).toBe(true);
    expect(store.isAtStage("search_creek")).toBe(false);

    store.setQuestStage("search_creek");
    expect(store.isAtStage("search_creek")).toBe(true);
    expect(store.isQuestAt("missing_controller", "search_creek")).toBe(true);

    const mushroom = store.getMushroomSpawns()[0]!;
    expect(store.isMushroomCollectible(mushroom.id)).toBe(false);
  });

  it("rejects invalid settings instead of persisting unusable menu state", () => {
    const store = makeStore();
    expect(() => store.updateSettings({ masterVolume: 2 })).toThrow(RangeError);
    expect(store.getState().settings.masterVolume).toBe(1);
  });

  it("preserves player settings when resetting the current mission", () => {
    const store = makeStore();
    store.updateSettings({ masterVolume: 0.2, muted: true, textSize: "large", reducedMotion: true });
    store.setQuestStage("search_creek");
    store.addInventoryItem(CONTROLLER_ITEM);
    store.setCurrentMap("creek");

    store.reset();

    expect(store.getState()).toMatchObject({
      activeQuestId: "missing_controller",
      questStage: "talk_to_jeremy",
      inventory: [],
      currentMap: "neighborhood",
      settings: { masterVolume: 0.2, muted: true, textSize: "large", reducedMotion: true },
    });
  });

  it("persists the mushroom handoffs and the three-stop sports quest independently", () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);

    store.setQuestStage("complete");
    store.setActiveQuest("chapter_1", "andrew_mushroom_hunt");
    store.setQuestStage("search_mushrooms");
    for (const spawn of store.getMushroomSpawns()) expect(store.collectMushroom(spawn.id)).toBe(true);

    expect(store.getState().questStage).toBe("feed_mushroom_to_jeremy");
    expect(store.getState().questProgress.mushrooms.collectedIds).toHaveLength(10);
    store.setQuestStage("place_mushroom_at_billy");
    store.setQuestStage("give_mushrooms_to_andrew");
    store.setQuestStage("complete");

    store.setActiveQuest("chapter_1", "three_player_sports");
    expect(store.getState().questStage).toBe("meet_jeremy_to_skateboard");
    store.setQuestStage("meet_billy_to_play_baseball");
    store.setQuestStage("meet_andrew_to_play_basketball");
    store.setQuestStage("complete");

    const reloaded = makeStore(storage).getState();
    expect(reloaded.completedQuestIds).toEqual([
      "missing_controller", "andrew_mushroom_hunt", "three_player_sports",
    ]);
    expect(reloaded.questProgress.mushrooms.collectedIds).toHaveLength(10);
    expect(reloaded.questProgress.sports.stage).toBe("complete");
    expect(reloaded.questHistory).toContain("three_player_sports.played_basketball");
  });

  it("hands off canonical sports completion to Catch Ryan and checkpoints the selected ride", () => {
    const store = makeStore();
    store.setQuestStage("complete");
    store.setActiveQuest("chapter_1", "andrew_mushroom_hunt");
    store.setQuestStage("search_mushrooms");
    for (const spawn of store.getMushroomSpawns()) store.collectMushroom(spawn.id);
    store.setQuestStage("place_mushroom_at_billy");
    store.setQuestStage("give_mushrooms_to_andrew");
    store.setQuestStage("complete");
    store.setActiveQuest("chapter_1", "three_player_sports");
    store.setQuestStage("meet_billy_to_play_baseball");
    store.setQuestStage("meet_andrew_to_play_basketball");
    store.setQuestStage("complete");
    expect(store.getState()).toMatchObject({ activeQuestId: "catch_ryan", questStage: "invite" });
    store.acceptRyanRide();
    store.returnToRyanRideInvitation();
    expect(store.getState()).toMatchObject({ questStage: "invite", unlockedMaps: ["neighborhood", "creek"] });
    store.acceptRyanRide();
    store.selectRyanRideDestination("reidenbaugh", 42);
    expect(store.getState()).toMatchObject({
      questStage: "depart_neighborhood",
      currentMap: "neighborhood",
      discoveredMaps: ["neighborhood"],
      unlockedMaps: ["neighborhood", "creek", "stonehenge", "reidenbaugh", "fruitville_pike", "bent_creek"],
    });
    store.departNeighborhoodRide();
    expect(store.getState()).toMatchObject({ currentMap: "stonehenge", questStage: "ride_stonehenge", discoveredMaps: ["neighborhood", "stonehenge"] });
  });

  it("atomically unlocks the full regional set without marking it discovered", () => {
    const store = makeStore();
    store.setActiveQuest("chapter_1", "catch_ryan");
    expect(() => store.setCurrentMap("stonehenge")).toThrow(RangeError);

    store.acceptRyanRide();
    store.selectRyanRideDestination("reidenbaugh", 42);

    expect(store.getState()).toMatchObject({
      currentMap: "neighborhood",
      discoveredMaps: ["neighborhood"],
      unlockedMaps: ["neighborhood", "creek", "stonehenge", "reidenbaugh", "fruitville_pike", "bent_creek"],
    });
    expect(store.isMapUnlocked("stonehenge")).toBe(true);
    expect(store.isMapUnlocked("reidenbaugh")).toBe(true);
    expect(store.isMapUnlocked("fruitville_pike")).toBe(true);
    expect(store.isMapUnlocked("bent_creek")).toBe(true);
  });

  it("progresses Catch Ryan through Stonehenge with the existing milestone history", () => {
    const store = makeStore();
    store.setActiveQuest("chapter_1", "catch_ryan");

    expect(store.getState().questStage).toBe("invite");
    store.acceptRyanRide();
    expect(store.getState().questStage).toBe("choose_destination");
    store.departNeighborhoodRide();
    store.reachReidenbaugh();
    store.catchRyan();
    expect(store.getState().questStage).toBe("choose_destination");
    store.selectRyanRideDestination("reidenbaugh", 42);
    expect(store.getState().questStage).toBe("depart_neighborhood");
    store.departNeighborhoodRide();
    expect(store.getState()).toMatchObject({ currentMap: "stonehenge", questStage: "ride_stonehenge" });
    store.reachReidenbaugh();
    expect(store.getState()).toMatchObject({ currentMap: "reidenbaugh", questStage: "chase_reidenbaugh" });
    store.catchRyan();

    expect(store.getState()).toMatchObject({
      activeQuestId: "explore_bent_creek",
      questStage: "open_gate",
      completedQuestIds: ["catch_ryan"],
      unlockedMaps: ["neighborhood", "creek", "stonehenge", "reidenbaugh", "fruitville_pike", "bent_creek"],
      questHistory: [
        "catch_ryan.started",
        "catch_ryan.destination_selected",
        "catch_ryan.neighborhood_departed",
        "catch_ryan.reidenbaugh_reached",
        "catch_ryan.ryan_caught",
      ],
    });
    store.openBentCreekGate();
    expect(store.getState()).toMatchObject({
      activeQuestId: "explore_bent_creek",
      questStage: "complete",
      completedQuestIds: ["catch_ryan", "explore_bent_creek"],
      questHistory: [
        "catch_ryan.started",
        "catch_ryan.destination_selected",
        "catch_ryan.neighborhood_departed",
        "catch_ryan.reidenbaugh_reached",
        "catch_ryan.ryan_caught",
        "explore_bent_creek.started",
        "explore_bent_creek.gate_opened",
      ],
    });
  });

  it("isolates Catch Ryan replay progress and regional unlocks from canonical state", () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);
    completeCatchRyan(store);
    const canonical = store.getCanonicalState();
    const persisted = storage.getItem("milton-estates-save");

    store.startQuestReplay("catch_ryan");
    expect(store.getState()).toMatchObject({
      questStage: "invite",
      currentMap: "neighborhood",
      discoveredMaps: ["neighborhood"],
      unlockedMaps: ["neighborhood", "creek"],
    });
    store.acceptRyanRide();
    store.selectRyanRideDestination("reidenbaugh", 99);
    store.departNeighborhoodRide();
    store.reachReidenbaugh();
    store.catchRyan();

    expect(store.getState()).toMatchObject({
      questStage: "complete",
      currentMap: "reidenbaugh",
      unlockedMaps: ["neighborhood", "creek", "stonehenge", "reidenbaugh", "fruitville_pike", "bent_creek"],
    });
    expect(store.getCanonicalState()).toEqual(canonical);
    expect(storage.getItem("milton-estates-save")).toBe(persisted);
  });

  it("keeps Mickey's race unlock and fastest time inside the existing save", () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);
    expect(store.getMickeyDragRaceRecord()).toEqual({ unlocked: false, introSeen: false, beaten: false, bestTimeMs: undefined });

    completeCatchRyan(store);
    store.openBentCreekGate();
    store.markMickeyDragRaceIntroSeen();
    store.recordMickeyDragRace(24_860, false);
    store.recordMickeyDragRace(23_120, true);
    store.recordMickeyDragRace(25_000, true);

    expect(store.getMickeyDragRaceRecord()).toEqual({ unlocked: true, introSeen: true, beaten: true, bestTimeMs: 23_120 });
    expect(makeStore(storage).getMickeyDragRaceRecord()).toEqual({ unlocked: true, introSeen: true, beaten: true, bestTimeMs: 23_120 });
  });

  it("repairs a saved Sports completion that predates the Catch Ryan handoff", () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);
    store.setQuestStage("complete");
    store.setActiveQuest("chapter_1", "andrew_mushroom_hunt");
    store.setQuestStage("search_mushrooms");
    for (const spawn of store.getMushroomSpawns()) store.collectMushroom(spawn.id);
    store.setQuestStage("place_mushroom_at_billy");
    store.setQuestStage("give_mushrooms_to_andrew");
    store.setQuestStage("complete");
    store.setActiveQuest("chapter_1", "three_player_sports");
    store.setQuestStage("meet_billy_to_play_baseball");
    store.setQuestStage("meet_andrew_to_play_basketball");
    store.setQuestStage("complete");

    const staleSave = JSON.parse(storage.getItem("milton-estates-save") ?? "null");
    staleSave.activeQuestId = "three_player_sports";
    storage.setItem("milton-estates-save", JSON.stringify(staleSave));

    expect(makeStore(storage).getState()).toMatchObject({
      activeQuestId: "catch_ryan",
      questStage: "invite",
      completedQuestIds: ["missing_controller", "andrew_mushroom_hunt", "three_player_sports"],
    });
  });

  it("migrates v7 inventory strings and awards the permanent bicycle after Catch Ryan", () => {
    const storage = new MemoryStorage();
    const writer = makeStore(storage);
    completeCatchRyan(writer);
    const legacy = JSON.parse(storage.getItem("milton-estates-save") ?? "null") as Record<string, unknown>;
    legacy.version = 7;
    legacy.inventory = [CONTROLLER_ITEM];
    delete legacy.equipment;
    delete legacy.collectedPickupIds;
    delete legacy.lastKnownLocation;
    storage.setItem("milton-estates-save", JSON.stringify(legacy));

    const migrated = makeStore(storage).getState();
    expect(migrated.version).toBe(8);
    expect(migrated.inventory).toEqual([
      { itemId: CONTROLLER_ITEM, quantity: 1 },
      { itemId: "bicycle", quantity: 1 },
    ]);
    expect(migrated.equipment).toEqual({ transport: null });
    expect(migrated.collectedPickupIds).toEqual([]);
  });

  it("collects each stable pickup once and persists both stacks and collection IDs", () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);

    expect(store.collectPickup("pickup_milton_field_token_01", "field_token")).toBe(true);
    expect(store.collectPickup("pickup_milton_field_token_01", "field_token")).toBe(false);
    expect(store.countItem("field_token")).toBe(1);
    expect(store.hasItem("field_token")).toBe(true);
    expect(store.getState().collectedPickupIds).toEqual(["pickup_milton_field_token_01"]);

    const reloaded = makeStore(storage).getState();
    expect(reloaded.inventory).toEqual([{ itemId: "field_token", quantity: 1 }]);
    expect(reloaded.collectedPickupIds).toEqual(["pickup_milton_field_token_01"]);
  });

  it("keeps bicycle preference separate from scripted quest travel", () => {
    const store = makeStore();
    expect(store.setEquippedTransport("bicycle")).toBe(false);
    completeCatchRyan(store);
    expect(store.getState().equipment.transport).toBe(null);
    expect(store.setEquippedTransport("bicycle")).toBe(true);
    expect(store.getState().equipment.transport).toBe("bicycle");
    expect(store.setEquippedTransport(null)).toBe(true);
    expect(store.getState().equipment.transport).toBe(null);
  });

  it("remaps legacy mushroom coordinates while preserving stable IDs and partial collection", () => {
    const storage = new MemoryStorage();
    const writer = makeStore(storage);
    writer.setQuestStage("complete");
    writer.setActiveQuest("chapter_1", "andrew_mushroom_hunt");
    writer.setQuestStage("search_mushrooms");

    const save = JSON.parse(storage.getItem("milton-estates-save") ?? "null");
    save.version = 5;
    delete save.questProgress.ryanRide;
    delete save.unlockedMaps;
    save.questProgress.mushrooms.spawns = legacyMushroomLayout.spawns;
    save.questProgress.mushrooms.collectedIds = legacyMushroomLayout.collectedIds;
    storage.setItem("milton-estates-save", JSON.stringify(save));

    const repaired = makeStore(storage).getState();
    expect(repaired.questStage).toBe("search_mushrooms");
    expect(repaired.questProgress.mushrooms.spawns.map(({ id }) => id)).toEqual(
      legacyMushroomLayout.spawns.map(({ id }) => id),
    );
    expect(repaired.questProgress.mushrooms.collectedIds).toEqual(legacyMushroomLayout.collectedIds);
    expect(repaired.questProgress.mushrooms.spawns.every(isAuthoredMushroomSpawnPosition)).toBe(true);

    const legacyCreekPositions = new Map(
      legacyMushroomLayout.spawns
        .filter(({ map }) => map === "creek")
        .map(({ id, x, y }) => [id, { x, y }]),
    );
    for (const spawn of repaired.questProgress.mushrooms.spawns.filter(({ map }) => map === "creek")) {
      expect({ x: spawn.x, y: spawn.y }).toEqual(legacyCreekPositions.get(spawn.id));
    }
    expect(repaired.questProgress.mushrooms.spawns.filter(({ map }) => map === "neighborhood"))
      .not.toEqual(legacyMushroomLayout.spawns.filter(({ map }) => map === "neighborhood"));
    expect(JSON.parse(storage.getItem("milton-estates-save") ?? "null").questProgress.mushrooms.spawns)
      .toEqual(repaired.questProgress.mushrooms.spawns);
  });

  it("repairs an impossible mushroom layout and reconciles the active stage on load", () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);
    store.setQuestStage("complete");
    store.setActiveQuest("chapter_1", "andrew_mushroom_hunt");
    store.setQuestStage("search_mushrooms");

    const corrupted = JSON.parse(storage.getItem("milton-estates-save") ?? "null");
    corrupted.questProgress.mushrooms.spawns = [];
    corrupted.questProgress.mushrooms.collectedIds = ["missing-mushroom"];
    storage.setItem("milton-estates-save", JSON.stringify(corrupted));

    const repaired = makeStore(storage).getState();
    expect(repaired.questStage).toBe("search_mushrooms");
    expect(repaired.questProgress.mushrooms.spawns).toHaveLength(10);
    expect(new Set(repaired.questProgress.mushrooms.spawns.map(({ id }) => id)).size).toBe(10);
    expect(repaired.questProgress.mushrooms.collectedIds).toEqual([]);
    expect(repaired.completedQuestIds).toEqual(["missing_controller"]);
  });

  it("rejects incompatible quest stages instead of silently accepting them", () => {
    const store = makeStore();
    expect(() => store.setQuestStage("search_mushrooms")).toThrow(RangeError);
    expect(store.getState().questStage).toBe("talk_to_jeremy");
    expect(() => store.setActiveQuest("chapter_1", "storm_drain_detectives")).toThrow(RangeError);
  });

  it("migrates the retired search_yards save stage to the live creek route", () => {
    const storage = new MemoryStorage();
    storage.setItem("milton-estates-save", JSON.stringify({
      version: 1,
      questStage: "search_yards",
      inventory: [],
      secrets: [],
      currentMap: "neighborhood",
    }));

    const state = makeStore(storage).getState();
    expect(state.questStage).toBe("search_creek");
    expect(state.questProgress.missingControllerStage).toBe("search_creek");
  });

  it("migrates v4 using questProgress as authority and removes the duplicated stage", () => {
    const storage = new MemoryStorage();
    const templateStore = makeStore(storage);
    templateStore.setQuestStage("complete");
    templateStore.setActiveQuest("chapter_1", "andrew_mushroom_hunt");
    templateStore.setQuestStage("search_mushrooms");
    const legacy = JSON.parse(storage.getItem("milton-estates-save") ?? "null");
    legacy.version = 4;
    legacy.questStage = "complete";
    legacy.questProgress.missingControllerStage = "search_yards";
    delete legacy.questProgress.ryanRide;
    legacy.completedQuestIds = [];
    legacy.questHistory = [
      "missing_controller.started",
      "missing_controller.andrew_consulted",
      "missing_controller.creek_clue_found",
      "andrew_mushroom_hunt.started",
    ];
    storage.setItem("milton-estates-save", JSON.stringify(legacy));

    const state = makeStore(storage).getState();
    expect(state.questStage).toBe("search_mushrooms");
    expect(state.questProgress.missingControllerStage).toBe("search_creek");
    const persisted = JSON.parse(storage.getItem("milton-estates-save") ?? "null");
    expect(persisted.version).toBe(8);
    expect(persisted).not.toHaveProperty("questStage");
  });

  it.each([
    (save: Record<string, unknown>) => { save.completedQuestIds = ["missing_controller"]; },
    (save: Record<string, unknown>) => { save.questHistory = ["missing_controller.controller_returned"]; },
    (save: Record<string, unknown>) => { save.activeQuestId = "storm_drain_detectives"; },
    (save: Record<string, unknown>) => {
      save.activeQuestId = "andrew_mushroom_hunt";
      save.completedQuestIds = ["andrew_mushroom_hunt"];
      const progress = save.questProgress as { mushrooms: { stage: string; collectedIds: string[] } };
      progress.mushrooms.stage = "complete";
      progress.mushrooms.collectedIds = [];
    },
  ])("quarantines irrecoverable v7 domain contradictions", (corrupt) => {
    const storage = new MemoryStorage();
    const writer = makeStore(storage);
    writer.saveNow();
    const save = JSON.parse(storage.getItem("milton-estates-save") ?? "null");
    corrupt(save);
    storage.setItem("milton-estates-save", JSON.stringify(save));
    expect(makeStore(storage).getState()).toMatchObject({
      activeQuestId: "missing_controller",
      questStage: "talk_to_jeremy",
      completedQuestIds: [],
      questHistory: [],
    });
  });
});
