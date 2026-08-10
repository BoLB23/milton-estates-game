import { describe, expect, it } from "vitest";
import { BAD_TRIP_SURVIVAL_CEILING_MS, decodeBadTripSurvivalValue, encodeBadTripSurvivalValue } from "./leaderboards";

describe("bad-trip survival leaderboard encoding", () => {
  it("encodes a longer run as a lower SDK score", () => {
    expect(encodeBadTripSurvivalValue(50_000)).toBeLessThan(encodeBadTripSurvivalValue(20_000));
  });

  it("decodes ordinary runs for the survivor-facing leaderboard", () => {
    expect(decodeBadTripSurvivalValue(encodeBadTripSurvivalValue(83_421))).toBe(83_421);
  });

  it("caps the score without ever producing zero", () => {
    expect(encodeBadTripSurvivalValue(BAD_TRIP_SURVIVAL_CEILING_MS * 2)).toBe(1);
  });
});
