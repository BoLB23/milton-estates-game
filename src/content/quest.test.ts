import { describe, expect, it } from "vitest";
import { nextMushroomStage, nextSportsStage, nextStage } from "./quest";

describe("Missing Controller quest", () => {
  it("sends players to the creek after Andrew while keeping the yard clue optional", () => {
    let stage = nextStage("talk_to_jeremy", { type: "talked_to_jeremy" });
    stage = nextStage(stage, { type: "talked_to_andrew" });
    expect(stage).toBe("search_creek");
    stage = nextStage(stage, { type: "picked_up_controller" });
    stage = nextStage(stage, { type: "returned_controller" });
    expect(stage).toBe("complete");
  });

  it("ignores out-of-order and repeated events", () => {
    expect(nextStage("talk_to_jeremy", { type: "picked_up_controller" })).toBe("talk_to_jeremy");
    expect(nextStage("complete", { type: "talked_to_jeremy" })).toBe("complete");
  });
});

describe("Andrew's mushroom quest", () => {
  it("requires all ten mushrooms and the three handoff stops", () => {
    let stage = nextMushroomStage("talk_to_andrew_for_mushrooms", { type: "talked_to_andrew_for_mushrooms" });
    stage = nextMushroomStage(stage, { type: "collected_all_mushrooms" });
    stage = nextMushroomStage(stage, { type: "fed_mushroom_to_jeremy" });
    stage = nextMushroomStage(stage, { type: "placed_mushroom_at_billy" });
    stage = nextMushroomStage(stage, { type: "gave_mushrooms_to_andrew" });
    expect(stage).toBe("complete");
    expect(nextMushroomStage("search_mushrooms", { type: "gave_mushrooms_to_andrew" })).toBe("search_mushrooms");
  });
});

describe("Three-Player Sports Day quest", () => {
  it("keeps the Jeremy, Billy, Andrew order", () => {
    let stage = nextSportsStage("meet_jeremy_to_skateboard", { type: "skateboarded_with_jeremy" });
    stage = nextSportsStage(stage, { type: "played_baseball_with_billy" });
    stage = nextSportsStage(stage, { type: "played_basketball_with_andrew" });
    expect(stage).toBe("complete");
  });
});
