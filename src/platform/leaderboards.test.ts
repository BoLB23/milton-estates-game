import { describe, expect, it } from "vitest";
import {
  BAD_TRIP_SURVIVAL_CEILING_MS,
  decodeBadTripSurvivalValue,
  encodeBadTripSurvivalValue,
  leaderboardSummaryLines,
  finishLeaderboardTimer,
  invalidateCompetitiveRunsForVisibility,
  startLeaderboardTimer,
} from "./leaderboards";

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

describe("leaderboard summaries", () => {
  it("shows the current player's best before other users", () => {
    expect(leaderboardSummaryLines("fastest", [
      { userId: "other", nickname: "June", value: 12_000, rank: 1 },
      { userId: "me", nickname: "Molly", value: 12_300, rank: 2 },
      { userId: "third", nickname: "Sam", value: 12_800, rank: 3 },
    ], "me")).toEqual([
      "YOUR BEST — #2 — 12.30s",
      "#1 June — 12.00s",
      "#3 Sam — 12.80s",
    ]);
  });

  it("decodes survival scores and supports a local fallback", () => {
    expect(leaderboardSummaryLines("longest", [], "me", 1, 51_250)).toEqual([
      "YOUR BEST — survived 51.25s",
      "No other player scores yet.",
    ]);
  });
});

describe("competitive timer visibility policy", () => {
  it("cancels a timed run after suspension instead of including hidden time", async () => {
    startLeaderboardTimer("chaseRyan");
    invalidateCompetitiveRunsForVisibility();
    await expect(finishLeaderboardTimer("chaseRyan")).resolves.toEqual({ status: "cancelled" });
  });
});
