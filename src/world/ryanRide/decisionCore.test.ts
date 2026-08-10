import { describe, expect, it } from "vitest";
import {
  createRyanRideDecisionState,
  decideRyanRide,
  latchRyanCatch,
  selectRyanLoop,
  validateRyanRideTuning,
} from "./decisionCore";

describe("Ryan ride decision core", () => {
  it("waits only at authored safe points and resumes with hysteresis", () => {
    const state = createRyanRideDecisionState("cruise");
    const unsafe = decideRyanRide(state, {
      distanceToPlayer: 600, atWaitSafeWaypoint: false, attemptingExit: false, nowMs: 0, routeMode: "sprint",
    });
    expect(unsafe.state.mode).toBe("sprint");
    expect(unsafe.shouldMove).toBe(true);

    const waiting = decideRyanRide(unsafe.state, {
      distanceToPlayer: 600, atWaitSafeWaypoint: true, attemptingExit: false, nowMs: 10, routeMode: "cruise",
    });
    expect(waiting.state.mode).toBe("waiting");
    expect(waiting.shouldMove).toBe(false);
    expect(waiting.emitWaitCallout).toBe(true);

    const stillWaiting = decideRyanRide(waiting.state, {
      distanceToPlayer: 300, atWaitSafeWaypoint: false, attemptingExit: false, nowMs: 100, routeMode: "tease",
    });
    expect(stillWaiting.state.mode).toBe("waiting");

    const resumed = decideRyanRide(stillWaiting.state, {
      distanceToPlayer: 250, atWaitSafeWaypoint: false, attemptingExit: false, nowMs: 200, routeMode: "tease",
    });
    expect(resumed.state.mode).toBe("tease");
    expect(resumed.shouldMove).toBe(true);
  });

  it("throttles wait callouts and blocks exit until the player catches up", () => {
    const waiting = decideRyanRide(createRyanRideDecisionState(), {
      distanceToPlayer: 700, atWaitSafeWaypoint: true, attemptingExit: true, nowMs: 1_000, routeMode: "cruise",
    });
    expect(waiting.canExit).toBe(false);
    expect(waiting.emitWaitCallout).toBe(true);
    const repeated = decideRyanRide(waiting.state, {
      distanceToPlayer: 700, atWaitSafeWaypoint: true, attemptingExit: true, nowMs: 2_000, routeMode: "cruise",
    });
    expect(repeated.emitWaitCallout).toBe(false);
    expect(decideRyanRide(repeated.state, {
      distanceToPlayer: 250, atWaitSafeWaypoint: true, attemptingExit: true, nowMs: 9_500, routeMode: "cruise",
    }).canExit).toBe(true);
  });

  it("selects seeded loops reproducibly and avoids an immediate repeat", () => {
    const loops = ["chase_a", "chase_b", "chase_c"] as const;
    expect(selectRyanLoop(loops, 42, 0)).toEqual(selectRyanLoop(loops, 42, 0));
    const first = selectRyanLoop(loops, 42, 0);
    const second = selectRyanLoop(loops, 42, first.selectionCount, first.loopId);
    expect(second.loopId).not.toBe(first.loopId);
  });

  it("latches a catch exactly once and stops later decisions", () => {
    const caught = latchRyanCatch(createRyanRideDecisionState("sprint"));
    expect(caught.caughtNow).toBe(true);
    expect(latchRyanCatch(caught.state).caughtNow).toBe(false);
    expect(decideRyanRide(caught.state, {
      distanceToPlayer: 0, atWaitSafeWaypoint: true, attemptingExit: true, nowMs: 0, routeMode: "sprint",
    })).toMatchObject({ shouldMove: false, canExit: false, state: { mode: "stopped", caught: true } });
  });

  it("rejects invalid hysteresis and ambiguous loop definitions", () => {
    expect(() => validateRyanRideTuning({ farDistance: 250, resumeDistance: 250, calloutCooldownMs: 0 })).toThrow();
    expect(() => selectRyanLoop(["duplicate", "duplicate"], 1, 0)).toThrow();
  });
});
