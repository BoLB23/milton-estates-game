import { describe, expect, it } from "vitest";
import { nextStage } from "./quest";

describe("Missing Controller quest", () => {
  it("advances through the intended sequence", () => {
    let stage = nextStage("talk_to_jeremy", { type: "talked_to_jeremy" });
    stage = nextStage(stage, { type: "talked_to_andrew" });
    stage = nextStage(stage, { type: "inspected_creek_clue" });
    stage = nextStage(stage, { type: "picked_up_controller" });
    stage = nextStage(stage, { type: "returned_controller" });
    expect(stage).toBe("complete");
  });

  it("ignores out-of-order and repeated events", () => {
    expect(nextStage("talk_to_jeremy", { type: "picked_up_controller" })).toBe("talk_to_jeremy");
    expect(nextStage("complete", { type: "talked_to_jeremy" })).toBe("complete");
  });
});
