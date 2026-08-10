import { describe, expect, it } from "vitest";
import { BAD_TRIP_PASS_MS, badTripDifficulty, stepBadTripPlayer } from "./badTripCore";

describe("bad-trip movement core", () => {
  const platforms = [{ x: 100, y: 400, width: 180 }];

  it("lands a falling player on a ledge", () => {
    const next = stepBadTripPlayer({ x: 180, y: 370, vx: 0, vy: 300, grounded: false }, { left: false, right: false, jump: false }, platforms, 40);
    expect(next.grounded).toBe(true);
    expect(next.y).toBe(378);
  });

  it("makes the pursuer increasingly dangerous over the 45-second pass threshold", () => {
    expect(badTripDifficulty(BAD_TRIP_PASS_MS).donSpeed).toBeGreaterThan(badTripDifficulty(0).donSpeed);
  });
});
