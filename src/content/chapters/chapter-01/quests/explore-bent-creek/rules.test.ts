import { describe, expect, it } from "vitest";

import { EXPLORE_BENT_CREEK_MODULE } from "./module";
import {
  EXPLORE_BENT_CREEK_COMPLETED_MILESTONE_COUNT,
  EXPLORE_BENT_CREEK_OBJECTIVES,
  advanceExploreBentCreekStage,
} from "./rules";

describe("Explore Bent Creek module", () => {
  it("owns the Bent Creek catalog metadata and runtime bindings", () => {
    expect(EXPLORE_BENT_CREEK_MODULE).toMatchObject({
      migrationStatus: "native",
      definition: {
        id: "explore_bent_creek",
        title: "Explore Bent Creek",
        prerequisiteQuestIds: ["catch_ryan"],
      },
      runtimeMapIds: ["fruitville_pike", "bent_creek"],
    });
    expect(EXPLORE_BENT_CREEK_OBJECTIVES.open_gate)
      .toBe("Get the Bent Creek gate to open.");
    expect(EXPLORE_BENT_CREEK_COMPLETED_MILESTONE_COUNT.complete).toBe(2);
  });

  it("waits for Mickey and Schwartz after the gate opens", () => {
    expect(advanceExploreBentCreekStage("open_gate", { type: "opened_gate" })).toBe("meet_schwartz");
    expect(advanceExploreBentCreekStage("meet_schwartz", { type: "met_schwartz" })).toBe("complete");
    expect(advanceExploreBentCreekStage("complete", { type: "opened_gate" })).toBe("complete");
  });
});
