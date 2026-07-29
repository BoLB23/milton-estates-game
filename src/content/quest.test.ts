import { describe, expect, it } from "vitest";
import { nextRyanRideStage } from "./quest";

describe("Catch Ryan", () => {
  it("follows the authored invitation-to-catch sequence", () => {
    let stage = nextRyanRideStage("invite", { type: "accepted_ride" });
    stage = nextRyanRideStage(stage, { type: "selected_destination", destination: "reidenbaugh" });
    stage = nextRyanRideStage(stage, { type: "departed_neighborhood" });
    stage = nextRyanRideStage(stage, { type: "reached_reidenbaugh" });
    expect(nextRyanRideStage(stage, { type: "caught_ryan" })).toBe("complete");
  });
});
