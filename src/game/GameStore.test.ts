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

describe("GameStore save v2", () => {
  it("starts with trustworthy mission and menu defaults", () => {
    expect(makeStore().getState()).toEqual({
      version: 2,
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

    expect(store.getState()).toEqual({
      version: 2,
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
        version: 2,
        questStage: "return_to_jeremy",
        questHistory: ["missing_controller.started", "missing_controller.andrew_consulted", "missing_controller.creek_clue_found", "missing_controller.controller_recovered"],
        inventory: [CONTROLLER_ITEM],
        discoveredMaps: ["neighborhood", "creek"],
        lastSavedAt: null,
      });
      expect(JSON.parse(storage.getItem("milton-estates-save") ?? "null").version).toBe(2);
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

  it("rejects invalid settings instead of persisting unusable menu state", () => {
    const store = makeStore();
    expect(() => store.updateSettings({ masterVolume: 2 })).toThrow(RangeError);
    expect(store.getState().settings.masterVolume).toBe(1);
  });
});
