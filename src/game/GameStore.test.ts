import { afterEach, describe, expect, it, vi } from "vitest";

import { EVENT, gameEvents } from "./events";
import { CONTROLLER_ITEM, GameStore } from "./GameStore";

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

afterEach(() => gameEvents.removeAllListeners());

describe("GameStore save v5", () => {
  it("starts with trustworthy mission and menu defaults", () => {
    expect(makeStore().getState()).toMatchObject({
      version: 5,
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
      settings: { masterVolume: 1, muted: false, textSize: "medium", reducedMotion: false },
      lastSavedAt: null,
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
      version: 5,
      activeChapterId: "chapter_1",
      activeQuestId: "missing_controller",
      completedChapterIds: [],
      completedQuestIds: [],
      questStage: "search_creek",
      questHistory: ["missing_controller.started", "missing_controller.andrew_consulted", "missing_controller.creek_clue_found"],
      inventory: [CONTROLLER_ITEM],
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
        version: 5,
        questStage: "return_to_jeremy",
        questHistory: ["missing_controller.started", "missing_controller.andrew_consulted", "missing_controller.creek_clue_found", "missing_controller.controller_recovered"],
        inventory: [CONTROLLER_ITEM],
        discoveredMaps: ["neighborhood", "creek"],
        lastSavedAt: null,
      });
      const persisted = JSON.parse(storage.getItem("milton-estates-save") ?? "null");
      expect(persisted.version).toBe(5);
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
    expect(state.inventory).toEqual([CONTROLLER_ITEM]);
    expect(state.questHistory).toEqual(["missing_controller.controller_returned"]);
    expect(state.discoveredMaps).toEqual(["neighborhood", "creek"]);
    expect(state.completedQuestIds).toEqual(["missing_controller"]);
    expect(JSON.parse(storage.getItem("milton-estates-save") ?? "null").version).toBe(5);
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
    snapshot.inventory.push("injected-item");
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
    expect(persisted.version).toBe(5);
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
  ])("quarantines irrecoverable v5 domain contradictions", (corrupt) => {
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
