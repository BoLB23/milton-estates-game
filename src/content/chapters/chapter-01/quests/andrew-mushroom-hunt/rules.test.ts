import { describe, expect, it } from "vitest";

import { MUSHROOM_HUNT_MODULE } from "./module";
import {
  MUSHROOM_COMPLETED_MILESTONE_COUNT,
  MUSHROOM_COUNT,
  MUSHROOM_OBJECTIVES,
  advanceMushroomStage,
  createMushroomSpawns,
  mushroomCountForMap,
} from "./rules";

describe("Andrew Mushroom Hunt module", () => {
  it("owns its stable metadata, progression, and runtime bindings", () => {
    expect(MUSHROOM_HUNT_MODULE).toMatchObject({
      migrationStatus: "native",
      definition: {
        id: "andrew_mushroom_hunt",
        chapterId: "chapter_1",
        prerequisiteQuestIds: ["missing_controller"],
      },
      assets: [],
      runtimeMapIds: ["neighborhood", "creek"],
    });
    expect(MUSHROOM_HUNT_MODULE.stages[0]).toBe("talk_to_andrew_for_mushrooms");
    expect(MUSHROOM_HUNT_MODULE.milestones).toHaveLength(5);
    expect(MUSHROOM_OBJECTIVES.complete)
      .toBe("Mushroom mission complete! Andrew has his ten mushrooms.");
    expect(MUSHROOM_COMPLETED_MILESTONE_COUNT.complete).toBe(5);
  });

  it("advances through the authored handoff sequence", () => {
    let stage = advanceMushroomStage(
      "talk_to_andrew_for_mushrooms",
      { type: "talked_to_andrew_for_mushrooms" },
    );
    stage = advanceMushroomStage(stage, { type: "collected_all_mushrooms" });
    stage = advanceMushroomStage(stage, { type: "fed_mushroom_to_jeremy" });
    stage = advanceMushroomStage(stage, { type: "placed_mushroom_at_billy" });
    stage = advanceMushroomStage(stage, { type: "gave_mushrooms_to_andrew" });
    expect(stage).toBe("complete");
  });

  it("ignores out-of-order and repeated events", () => {
    expect(advanceMushroomStage(
      "search_mushrooms",
      { type: "gave_mushrooms_to_andrew" },
    )).toBe("search_mushrooms");
    expect(advanceMushroomStage(
      "complete",
      { type: "talked_to_andrew_for_mushrooms" },
    )).toBe("complete");
  });

  it("creates deterministic, unique, evenly split persisted locations", () => {
    const spawns = createMushroomSpawns(2007);

    expect(spawns).toHaveLength(MUSHROOM_COUNT);
    expect(new Set(spawns.map(({ id }) => id)).size).toBe(MUSHROOM_COUNT);
    expect(mushroomCountForMap(spawns, "neighborhood")).toBe(5);
    expect(mushroomCountForMap(spawns, "creek")).toBe(5);
    expect(createMushroomSpawns(42)).toEqual(createMushroomSpawns(42));
    expect(createMushroomSpawns(42)).not.toEqual(createMushroomSpawns(43));
  });
});
