import { describe, expect, it } from "vitest";
import { nextStage, type QuestEvent } from "../content/quest";
import { CONTROLLER_ITEM, GameStore } from "./GameStore";

class PlaythroughStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const EVENTS: readonly QuestEvent[] = [
  { type: "talked_to_jeremy" },
  { type: "talked_to_andrew" },
  { type: "picked_up_controller" },
  { type: "returned_controller" },
];

function advance(store: GameStore, event: QuestEvent): void {
  store.setQuestStage(nextStage(store.getState().questStage, event));
}

describe("complete playthrough scenarios", () => {
  it("completes the direct quest route across both map transitions", () => {
    const store = new GameStore(new PlaythroughStorage());

    advance(store, EVENTS[0]!);
    advance(store, EVENTS[1]!);
    store.setCurrentMap("creek");
    store.addInventoryItem(CONTROLLER_ITEM);
    advance(store, EVENTS[2]!);
    store.setCurrentMap("neighborhood");
    advance(store, EVENTS[3]!);

    expect(store.getState()).toMatchObject({
      questStage: "complete",
      inventory: [CONTROLLER_ITEM],
      discoveredMaps: ["neighborhood", "creek"],
      questHistory: [
        "missing_controller.started",
        "missing_controller.andrew_consulted",
        "missing_controller.creek_clue_found",
        "missing_controller.controller_recovered",
        "missing_controller.controller_returned",
      ],
    });
  });

  it("survives deliberately out-of-order exploration and records the optional secret", () => {
    const store = new GameStore(new PlaythroughStorage());

    store.setCurrentMap("creek");
    advance(store, { type: "picked_up_controller" });
    advance(store, { type: "returned_controller" });
    store.addSecret("creek_token");
    expect(store.getState().questStage).toBe("talk_to_jeremy");

    store.setCurrentMap("neighborhood");
    for (const event of EVENTS) {
      if (event.type === "picked_up_controller") store.addInventoryItem(CONTROLLER_ITEM);
      advance(store, event);
    }

    expect(store.getState()).toMatchObject({
      questStage: "complete",
      secrets: ["creek_token"],
      inventory: [CONTROLLER_ITEM],
    });
  });

  it("reloads in the creek after pickup and can return the controller", () => {
    const storage = new PlaythroughStorage();
    let store = new GameStore(storage);
    for (const event of EVENTS.slice(0, 3)) advance(store, event);
    store.setCurrentMap("creek");
    store.addInventoryItem(CONTROLLER_ITEM);
    advance(store, { type: "picked_up_controller" });
    store.saveNow();

    store = new GameStore(storage);
    expect(store.getState()).toMatchObject({
      currentMap: "creek",
      questStage: "return_to_jeremy",
      inventory: [CONTROLLER_ITEM],
    });

    store.setCurrentMap("neighborhood");
    advance(store, { type: "returned_controller" });
    expect(store.getState().questStage).toBe("complete");
  });
});
