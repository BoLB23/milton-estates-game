import { describe, expect, it } from "vitest";

import { THREE_PLAYER_SPORTS_MODULE } from "./module";
import { advanceSportsStage, SPORTS_COMPLETED_MILESTONE_COUNT } from "./rules";

describe("Three-Player Sports module", () => {
  it("owns its catalog metadata and neighborhood binding", () => {
    expect(THREE_PLAYER_SPORTS_MODULE).toMatchObject({
      migrationStatus: "native",
      definition: { id: "three_player_sports", chapterId: "chapter_1" },
      runtimeMapIds: ["neighborhood"],
    });
  });

  it("keeps the Jeremy, Billy, Andrew order", () => {
    let stage = advanceSportsStage("meet_jeremy_to_skateboard", {
      type: "skateboarded_with_jeremy",
    });
    stage = advanceSportsStage(stage, { type: "played_baseball_with_billy" });
    stage = advanceSportsStage(stage, { type: "played_basketball_with_andrew" });
    expect(stage).toBe("complete");
  });

  it("ignores an event for a later stop", () => {
    expect(advanceSportsStage("meet_jeremy_to_skateboard", {
      type: "played_basketball_with_andrew",
    })).toBe("meet_jeremy_to_skateboard");
  });

  it("records each completed activity at the stage it unlocks", () => {
    expect(SPORTS_COMPLETED_MILESTONE_COUNT).toMatchObject({
      meet_jeremy_to_skateboard: 0,
      meet_billy_to_play_baseball: 2,
      meet_andrew_to_play_basketball: 3,
      complete: 4,
    });
  });
});
