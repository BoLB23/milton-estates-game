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
const replayableQuestIds = [
  "missing_controller", "andrew_mushroom_hunt", "three_player_sports", "catch_ryan", "explore_bent_creek",
  "attend_bonfire_at_andrews", "creek_clubhouse", "paper_airplane_relay", "bent_creek_caddy_caper",
] as const;

function completeCatchRyan(store: GameStore): void {
  store.setActiveQuest("chapter_1", "catch_ryan");
  store.acceptRyanRide();
  store.selectRyanRideDestination("reidenbaugh", 42);
  store.departNeighborhoodRide();
  store.reachReidenbaugh();
  store.catchRyan();
}

afterEach(() => gameEvents.removeAllListeners());

describe("GameStore save v9", () => {
  it("identifies whether this browser had a save before the initial autosave", () => {
    const freshStorage = new MemoryStorage();
    const returningStorage = new MemoryStorage();
    returningStorage.setItem("milton-estates-save", "not json");

    expect(makeStore(freshStorage).isFirstVisit()).toBe(true);
    expect(makeStore(returningStorage).isFirstVisit()).toBe(false);
  });

  it("starts with trustworthy mission and menu defaults", () => {
    expect(makeStore().getState()).toMatchObject({
      version: 9,
      activeChapterId: "chapter_1",
      activeQuestId: "missing_controller",
      completedChapterIds: [],
      completedQuestIds: [],
      questStage: "talk_to_billy",
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

  it("persists the three new quest records and advances the paper relay atomically", () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);

    store.setActiveQuest("chapter_1", "paper_airplane_relay");
    expect(store.advancePaperAirplaneRelay({ type: "material_found", material: "clean_sheet" })).toBe(false);
    store.advancePaperAirplaneRelay({ type: "advisor_consulted", advisor: "ryan" });
    store.advancePaperAirplaneRelay({ type: "advisor_consulted", advisor: "billy" });
    store.advancePaperAirplaneRelay({ type: "advisor_consulted", advisor: "andrew" });
    store.advancePaperAirplaneRelay({ type: "material_found", material: "clean_sheet" });
    store.advancePaperAirplaneRelay({ type: "material_found", material: "card_wing" });
    store.advancePaperAirplaneRelay({ type: "material_found", material: "message_strip" });
    store.advancePaperAirplaneRelay({ type: "plane_folded" });
    store.advancePaperAirplaneRelay({ type: "wind_gust_caught" });
    store.advancePaperAirplaneRelay({ type: "wind_gust_caught" });
    store.advancePaperAirplaneRelay({ type: "wind_gust_caught" });
    store.advancePaperAirplaneRelay({ type: "message_decoded" });
    store.advancePaperAirplaneRelay({ type: "message_delivered", friend: "andrew" });
    expect(store.getState()).toMatchObject({
      questStage: "complete",
      completedQuestIds: ["paper_airplane_relay"],
      questProgress: {
        paperAirplaneRelay: {
          stage: "complete",
          adviceIds: ["ryan", "billy", "andrew"],
          materialIds: ["clean_sheet", "card_wing", "message_strip"],
          windHits: 3,
          decoded: true,
          deliveredTo: "andrew",
        },
      },
    });

    store.setActiveQuest("chapter_1", "creek_clubhouse");
    store.setQuestStage("choose_design");
    expect(store.setCreekClubhouseRecord({
      stage: "choose_design", design: "fort", supplies: [], constructionStep: 0, knockBeats: [],
    })).toBe(true);
    expect(store.getCreekClubhouseRecord().design).toBe("fort");

    store.setActiveQuest("chapter_1", "bent_creek_caddy_caper");
    expect(store.setBentCreekCaddyCaperRecord({
      stage: "complete", clueIndex: 3, puttGates: 3, sprinklerIndex: 3, bestRematchScore: 4_200,
    })).toBe(true);
    expect(makeStore(storage).getState()).toMatchObject({
      completedQuestIds: ["paper_airplane_relay", "bent_creek_caddy_caper"],
      questProgress: {
        creekClubhouse: { design: "fort" },
        bentCreekCaddyCaper: { stage: "complete", bestRematchScore: 4_200 },
      },
    });
  });

  it("keeps new-quest completion rewards atomic and repairs interrupted reward writes", () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);

    store.setActiveQuest("chapter_1", "creek_clubhouse");
    expect(store.setCreekClubhouseRecord({
      stage: "complete", design: "lookout", supplies: ["rope", "blanket", "branches"], constructionStep: 3, knockBeats: [1, 1, 3, 1],
    })).toBe(true);
    expect(store.hasItem("clubhouse_journal_page")).toBe(true);
    expect(store.getState().secrets).toEqual(expect.arrayContaining(["creek_clubhouse_landmark", "creek_clubhouse_shortcut"]));

    store.setActiveQuest("chapter_1", "paper_airplane_relay");
    ["ryan", "billy", "andrew"].forEach((advisor) => store.advancePaperAirplaneRelay({ type: "advisor_consulted", advisor: advisor as "ryan" | "billy" | "andrew" }));
    ["clean_sheet", "card_wing", "message_strip"].forEach((material) => store.advancePaperAirplaneRelay({ type: "material_found", material: material as "clean_sheet" | "card_wing" | "message_strip" }));
    store.advancePaperAirplaneRelay({ type: "plane_folded" });
    store.advancePaperAirplaneRelay({ type: "wind_gust_caught" });
    store.advancePaperAirplaneRelay({ type: "wind_gust_caught" });
    store.advancePaperAirplaneRelay({ type: "wind_gust_caught" });
    store.advancePaperAirplaneRelay({ type: "message_decoded" });
    store.advancePaperAirplaneRelay({ type: "message_delivered", friend: "andrew" });
    expect(store.hasItem("paper_airplane")).toBe(true);
    expect(store.getState().secrets).toContain("paper_airplane_shortcut");

    store.setActiveQuest("chapter_1", "bent_creek_caddy_caper");
    expect(store.setBentCreekCaddyCaperRecord({
      stage: "complete", clueIndex: 3, puttGates: 3, sprinklerIndex: 3, bestRematchScore: null,
    })).toBe(true);
    expect(store.hasItem("bent_creek_visitor_badge")).toBe(true);

    const interrupted = JSON.parse(storage.getItem("milton-estates-save") ?? "null");
    interrupted.inventory = interrupted.inventory.filter((stack: { itemId: string }) => ![
      "clubhouse_journal_page", "paper_airplane", "bent_creek_visitor_badge",
    ].includes(stack.itemId));
    interrupted.secrets = interrupted.secrets.filter((secret: string) => ![
      "creek_clubhouse_landmark", "creek_clubhouse_shortcut", "paper_airplane_shortcut",
    ].includes(secret));
    storage.setItem("milton-estates-save", JSON.stringify(interrupted));

    const recovered = makeStore(storage).getState();
    expect(recovered.inventory.map((stack) => stack.itemId)).toEqual(expect.arrayContaining([
      "clubhouse_journal_page", "paper_airplane", "bent_creek_visitor_badge",
    ]));
    expect(recovered.secrets).toEqual(expect.arrayContaining([
      "creek_clubhouse_landmark", "creek_clubhouse_shortcut", "paper_airplane_shortcut",
    ]));
    expect(validateSaveInvariants(recovered)).toEqual([]);
  });

  it("requires Billy to assign the first quest before Jeremy becomes the objective", () => {
    const store = makeStore();
    expect(store.getState()).toMatchObject({ questStage: "talk_to_billy", questHistory: [] });

    expect(store.beginMissingControllerQuest()).toBe(true);
    expect(store.getState()).toMatchObject({
      questStage: "talk_to_jeremy",
      questHistory: ["missing_controller.started"],
    });
    expect(store.beginMissingControllerQuest()).toBe(false);
  });

  it("migrates a realistic v6 playthrough without losing player or quest state", () => {
    const storage = new MemoryStorage();
    storage.setItem("milton-estates-save", JSON.stringify(realisticV6Save));

    const state = makeStore(storage).getState();
    expect(state).toMatchObject({
      version: 9,
      activeQuestId: "catch_ryan",
      completedQuestIds: ["missing_controller", "andrew_mushroom_hunt", "three_player_sports"],
      currentMap: "stonehenge",
      discoveredMaps: ["neighborhood", "stonehenge", "creek"],
      unlockedMaps: ["neighborhood", "creek", "stonehenge", "reidenbaugh", "fruitville_pike", "bent_creek"],
      questStage: "ride_stonehenge",
      inventory: [],
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
    expect(persisted).toMatchObject({ version: 9, currentMap: "stonehenge" });
    expect(JSON.stringify(persisted)).not.toContain("reidenbaugh_road");
    expect(persisted.questProgress.mushrooms.spawns).toEqual(state.questProgress.mushrooms.spawns);
  });

  it("decodes valid v7 state and rejects a current map that is not unlocked", () => {
    const storage = new MemoryStorage();
    const writer = makeStore(storage);
    writer.setCurrentMap("creek");
    const valid = makeStore(storage).getState();
    expect(valid.version).toBe(9);
    expect(validateSaveInvariants(valid)).toEqual([]);

    const invalid = JSON.parse(storage.getItem("milton-estates-save") ?? "null");
    invalid.currentMap = "stonehenge";
    invalid.discoveredMaps = ["neighborhood", "stonehenge"];
    invalid.unlockedMaps = ["neighborhood", "creek"];
    storage.setItem("milton-estates-save", JSON.stringify(invalid));

    expect(makeStore(storage).getState()).toMatchObject({
      version: 9,
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
    expect(makeStore(storage).getState().questStage).toBe("talk_to_billy");
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
      version: 9,
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
      version: 9,
        questStage: "return_to_jeremy",
        questHistory: ["missing_controller.started", "missing_controller.andrew_consulted", "missing_controller.creek_clue_found", "missing_controller.controller_recovered"],
        inventory: [{ itemId: CONTROLLER_ITEM, quantity: 1 }],
        discoveredMaps: ["neighborhood", "creek"],
        lastSavedAt: null,
      });
      const persisted = JSON.parse(storage.getItem("milton-estates-save") ?? "null");
      expect(persisted.version).toBe(9);
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
    expect(state.inventory).toEqual([]);
    expect(state.questHistory).toEqual(["missing_controller.controller_returned"]);
    expect(state.discoveredMaps).toEqual(["neighborhood", "creek"]);
    expect(state.completedQuestIds).toEqual(["missing_controller"]);
    expect(JSON.parse(storage.getItem("milton-estates-save") ?? "null").version).toBe(9);
  });

  it("preserves the current adventure context while isolating replay progress", () => {
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
      questStage: "talk_to_billy",
      questHistory: [],
      inventory: [],
      secrets: ["creek_token"],
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

  it("exposes replay identity only in the runtime projection and never persists it", () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);
    store.setQuestStage("complete");
    const canonical = store.getCanonicalState();

    store.startQuestReplay("missing_controller");

    expect(store.getState().replayQuestId).toBe("missing_controller");
    expect(store.getReplayQuestId()).toBe("missing_controller");
    expect(store.isQuestReplayActive()).toBe(true);
    expect(store.isQuestReplayActive("missing_controller")).toBe(true);
    expect(store.isQuestReplayActive("andrew_mushroom_hunt")).toBe(false);
    expect(store.getCanonicalState()).toEqual(canonical);
    expect(store.getCanonicalState().replayQuestId).toBeNull();
    expect(JSON.parse(storage.getItem("milton-estates-save") ?? "null")).not.toHaveProperty("replayQuestId");
    expect(store.getCloudSnapshot()).not.toHaveProperty("replayQuestId");

    expect(store.endQuestReplay()).toBe(true);
    expect(store.getState().replayQuestId).toBeNull();
  });

  it("rejects nested replay and canonical activation without mutations or events", () => {
    const store = makeStore();
    store.setQuestStage("complete");
    const canonical = store.getCanonicalState();
    store.startQuestReplay("missing_controller");
    const replay = store.getState();
    const listener = vi.fn();
    gameEvents.on(EVENT.stateChanged, listener);

    expect(() => store.startQuestReplay("missing_controller")).toThrow(RangeError);
    expect(() => store.setActiveQuest("chapter_1", "andrew_mushroom_hunt")).toThrow(RangeError);

    expect(listener).not.toHaveBeenCalled();
    expect(store.getState()).toEqual(replay);
    expect(store.getCanonicalState()).toEqual(canonical);
  });

  it("advances a Missing Controller replay from Billy exactly once", () => {
    const store = makeStore();
    store.setQuestStage("complete");
    const canonical = store.getCanonicalState();

    store.startQuestReplay("missing_controller");
    expect(store.beginMissingControllerQuest()).toBe(true);
    expect(store.beginMissingControllerQuest()).toBe(false);
    expect(store.getState()).toMatchObject({
      replayQuestId: "missing_controller",
      questStage: "talk_to_jeremy",
      questHistory: ["missing_controller.started"],
    });
    expect(store.getCanonicalState()).toEqual(canonical);
  });

  it.each([
    ["missing_controller", "talk_to_billy"],
    ["andrew_mushroom_hunt", "talk_to_andrew_for_mushrooms"],
    ["three_player_sports", "meet_jeremy_to_skateboard"],
    ["catch_ryan", "invite"],
    ["explore_bent_creek", "open_gate"],
    ["attend_bonfire_at_andrews", "talk_to_schwartz"],
    ["creek_clubhouse", "talk_to_andrew"],
    ["paper_airplane_relay", "ask_for_advice"],
    ["bent_creek_caddy_caper", "inspect_display"],
  ] as const)("initializes and isolates the %s replay", (questId, initialStage) => {
    const store = makeStore();
    // This table covers replay construction; individual quest tests cover the
    // valid progression paths that earn these completed records.
    (store as unknown as { state: { completedQuestIds: typeof replayableQuestIds[number][] } })
      .state.completedQuestIds = [...replayableQuestIds];
    const canonical = store.getCanonicalState();

    store.startQuestReplay(questId);
    expect(store.getState()).toMatchObject({ replayQuestId: questId, activeQuestId: questId, questStage: initialStage });
    expect(store.getCanonicalState()).toEqual(canonical);
    expect(store.endQuestReplay()).toBe(true);
    expect(store.getState()).toEqual(canonical);
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
    expect(store.isQuestAt("missing_controller", "talk_to_billy")).toBe(true);
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
      questStage: "talk_to_billy",
      inventory: [],
      currentMap: "neighborhood",
      settings: { masterVolume: 0.2, muted: true, textSize: "large", reducedMotion: true },
    });
  });

  it("resets only the canonical active quest and removes its temporary items", () => {
    const store = makeStore();
    store.beginMissingControllerQuest();
    store.setQuestStage("search_creek");
    store.addInventoryItem(CONTROLLER_ITEM);
    store.addInventoryItem("field_token");
    store.addSecret("creek_token");
    store.setCurrentMap("creek");

    expect(store.resetActiveQuest()).toBe(true);
    expect(store.getState()).toMatchObject({
      activeQuestId: "missing_controller",
      questStage: "talk_to_billy",
      questHistory: [],
      inventory: [{ itemId: "field_token", quantity: 1 }],
      secrets: ["creek_token"],
      currentMap: "neighborhood",
    });
  });

  it("preserves unrelated completed progress when resetting a later quest", () => {
    const store = makeStore();
    store.setQuestStage("complete");
    store.setActiveQuest("chapter_1", "andrew_mushroom_hunt");
    store.setQuestStage("search_mushrooms");
    expect(store.collectMushroom(store.getMushroomSpawns()[0]!.id)).toBe(true);

    expect(store.resetActiveQuest()).toBe(true);
    expect(store.getState()).toMatchObject({
      activeQuestId: "andrew_mushroom_hunt",
      questStage: "talk_to_andrew_for_mushrooms",
      completedQuestIds: ["missing_controller"],
      questProgress: { missingControllerStage: "complete", mushrooms: { collectedIds: [] } },
    });
    expect(store.getState().questHistory).toContain("missing_controller.controller_returned");
  });

  it("returns false when an isolated replay is active", () => {
    const store = makeStore();
    store.setQuestStage("complete");
    store.startQuestReplay("missing_controller");
    expect(store.resetActiveQuest()).toBe(false);
  });

  it("returns the controller and completes its quest in one state update", () => {
    const storage = new MemoryStorage();
    const listener = vi.fn();
    const store = makeStore(storage);
    store.setQuestStage("return_to_jeremy");
    store.addInventoryItem(CONTROLLER_ITEM);
    gameEvents.on(EVENT.stateChanged, listener);

    store.setQuestStage("complete");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ questStage: "complete", inventory: [] });
    expect(JSON.parse(storage.getItem("milton-estates-save") ?? "null")).toMatchObject({
      inventory: [],
      questProgress: { missingControllerStage: "complete" },
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
      questStage: "meet_schwartz",
      completedQuestIds: ["catch_ryan"],
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

  it("completes Bent Creek and starts the bonfire quest after Mickey and Schwartz", () => {
    const store = makeStore();
    completeCatchRyan(store);
    store.openBentCreekGate();
    store.markMickeyDragRaceIntroSeen();
    store.recordMickeyDragRace(24_000, true);

    expect(store.canAcceptBonfireInvitation()).toBe(true);
    expect(store.acceptBonfireInvitation()).toBe(true);
    expect(store.getState()).toMatchObject({
      activeQuestId: "attend_bonfire_at_andrews",
      questStage: "attend_bonfire",
      completedQuestIds: ["catch_ryan", "explore_bent_creek"],
    });
  });

  it("preserves regional unlocks and durable rewards during a Catch Ryan replay", () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);
    completeCatchRyan(store);
    const canonical = store.getCanonicalState();
    const persisted = storage.getItem("milton-estates-save");

    store.startQuestReplay("catch_ryan");
    expect(store.getState()).toMatchObject({
      questStage: "invite",
      currentMap: "reidenbaugh",
      discoveredMaps: ["neighborhood", "stonehenge", "reidenbaugh"],
      unlockedMaps: ["neighborhood", "creek", "stonehenge", "reidenbaugh", "fruitville_pike", "bent_creek"],
      inventory: [{ itemId: "bicycle", quantity: 1 }],
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

  it("does not hand a replayed Bent Creek exploration into the next quest", () => {
    const store = makeStore();
    completeCatchRyan(store);
    store.openBentCreekGate();
    store.recordMickeyDragRace(23_120, true);
    expect(store.acceptBonfireInvitation()).toBe(true);
    const canonical = store.getCanonicalState();

    store.startQuestReplay("explore_bent_creek");
    store.openBentCreekGate();
    expect(store.getState()).toMatchObject({
      activeQuestId: "explore_bent_creek",
      questStage: "meet_schwartz",
    });
    expect(store.acceptBonfireInvitation()).toBe(true);
    expect(store.getState()).toMatchObject({
      activeQuestId: "explore_bent_creek",
      questStage: "complete",
    });
    expect(store.getCanonicalState()).toEqual(canonical);
  });

  it("keeps completed Mickey progress available during an earlier quest replay", () => {
    const store = makeStore();
    store.setQuestStage("complete");
    completeCatchRyan(store);
    store.openBentCreekGate();
    store.recordMickeyDragRace(23_120, true);
    const canonical = store.getCanonicalState();

    store.startQuestReplay("missing_controller");
    expect(store.getMickeyDragRaceRecord()).toEqual({
      unlocked: true,
      introSeen: false,
      beaten: true,
      bestTimeMs: 23_120,
    });
    expect(store.getCanonicalState()).toEqual(canonical);
    expect(store.endQuestReplay()).toBe(true);
    expect(store.getState()).toEqual(canonical);
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
    store.recordMickeyDragRace(20_000, false);
    store.recordMickeyDragRace(25_000, true);

    expect(store.getMickeyDragRaceRecord()).toEqual({ unlocked: true, introSeen: true, beaten: true, bestTimeMs: 23_120 });
    expect(makeStore(storage).getMickeyDragRaceRecord()).toEqual({ unlocked: true, introSeen: true, beaten: true, bestTimeMs: 23_120 });
  });

  it("persists Schwartz's invitation, bonfire arrival, and successful initiation", () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);
    completeCatchRyan(store);
    store.openBentCreekGate();

    expect(store.canAcceptBonfireInvitation()).toBe(false);
    expect(store.acceptBonfireInvitation()).toBe(false);

    store.recordMickeyDragRace(23_120, true);
    expect(store.canAcceptBonfireInvitation()).toBe(true);
    expect(store.acceptBonfireInvitation()).toBe(true);
    expect(store.getState()).toMatchObject({
      activeQuestId: "attend_bonfire_at_andrews",
      questStage: "attend_bonfire",
      questHistory: [
        "catch_ryan.started",
        "catch_ryan.destination_selected",
        "catch_ryan.neighborhood_departed",
        "catch_ryan.reidenbaugh_reached",
        "catch_ryan.ryan_caught",
        "explore_bent_creek.started",
        "explore_bent_creek.gate_opened",
        "attend_bonfire_at_andrews.started",
        "attend_bonfire_at_andrews.invitation_accepted",
      ],
    });
    expect(store.arriveAtAndrewsBonfire()).toBe(true);
    expect(store.completeBonfireInitiation()).toBe(true);
    expect(store.getState()).toMatchObject({
      questStage: "complete",
      completedQuestIds: ["catch_ryan", "explore_bent_creek", "attend_bonfire_at_andrews"],
      questProgress: { bonfire: { stage: "complete" } },
    });
    expect(makeStore(storage).getState().questProgress.bonfire.stage).toBe("complete");
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
    expect(migrated.version).toBe(9);
    expect(migrated.inventory).toEqual([{ itemId: "bicycle", quantity: 1 }]);
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
    expect(store.getState().questStage).toBe("talk_to_billy");
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
    expect(persisted.version).toBe(9);
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
      questStage: "talk_to_billy",
      completedQuestIds: [],
      questHistory: [],
    });
  });
});
