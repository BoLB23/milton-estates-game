import { describe, expect, it } from "vitest";
import type { MushroomQuestStage, QuestProgress } from "../game/types";
import { selectHudInventory } from "./hudInventory";

const mushrooms = Array.from({ length: 10 }, (_, index) => `mushroom-${index}`);

function state(options: {
  controllerStage?: QuestProgress["missingControllerStage"];
  mushroomStage?: MushroomQuestStage;
  collectedCount?: number;
  hasController?: boolean;
} = {}) {
  return {
    inventory: options.hasController === false ? [] : ["xbox_controller"],
    questProgress: {
      missingControllerStage: options.controllerStage ?? "return_to_jeremy",
      mushrooms: {
        stage: options.mushroomStage ?? "talk_to_andrew_for_mushrooms",
        spawns: [],
        collectedIds: mushrooms.slice(0, options.collectedCount ?? 0),
      },
      sports: { stage: "meet_jeremy_to_skateboard" as const },
      ryanRide: { stage: "invite" as const, selectedDestination: null, routeSeed: null },
    },
  };
}

describe("HUD carried inventory", () => {
  it("shows the controller only while Billy is returning it", () => {
    expect(selectHudInventory(state()).controllerCount).toBe(1);
    expect(selectHudInventory(state({ controllerStage: "complete" })).controllerCount).toBe(0);
    expect(selectHudInventory(state({ hasController: false })).controllerCount).toBe(0);
  });

  it("decrements mushrooms as each handoff is completed", () => {
    expect(selectHudInventory(state({ mushroomStage: "search_mushrooms", collectedCount: 6 })).mushroomCount).toBe(6);
    expect(selectHudInventory(state({ mushroomStage: "feed_mushroom_to_jeremy", collectedCount: 10 })).mushroomCount).toBe(10);
    expect(selectHudInventory(state({ mushroomStage: "place_mushroom_at_billy", collectedCount: 10 })).mushroomCount).toBe(9);
    expect(selectHudInventory(state({ mushroomStage: "give_mushrooms_to_andrew", collectedCount: 10 })).mushroomCount).toBe(8);
    expect(selectHudInventory(state({ mushroomStage: "complete", collectedCount: 10 })).mushroomCount).toBe(0);
  });
});
