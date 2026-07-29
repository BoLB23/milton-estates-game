/** Pure, Phaser-independent decisions for Ryan's ride route adapters. */

export type RyanRideMode = "sprint" | "cruise" | "tease" | "waiting" | "stopped";

export interface RyanRideDecisionState {
  readonly mode: RyanRideMode;
  readonly caught: boolean;
  /** Timestamp of the last wait callout, in the adapter's monotonic clock. */
  readonly lastCalloutAt: number | null;
}

export interface RyanRideDecisionTuning {
  readonly farDistance: number;
  readonly resumeDistance: number;
  readonly calloutCooldownMs: number;
}

export interface RyanRideDecisionInput {
  readonly distanceToPlayer: number;
  /** Waiting is permitted only at authored safe points. */
  readonly atWaitSafeWaypoint: boolean;
  /** True only while Ryan is at an authored scene-exit trigger. */
  readonly attemptingExit: boolean;
  readonly nowMs: number;
  /** The authored route behavior for this waypoint. */
  readonly routeMode: Exclude<RyanRideMode, "waiting" | "stopped">;
}

export interface RyanRideDecision {
  readonly state: RyanRideDecisionState;
  readonly shouldMove: boolean;
  /** Scene adapters must gate their transition on this flag. */
  readonly canExit: boolean;
  /** A lightweight callout should be emitted at most once per cooldown. */
  readonly emitWaitCallout: boolean;
}

export interface RyanLoopSelection {
  readonly loopId: string;
  /** Persist this counter only if an adapter needs a sequence after reload. */
  readonly selectionCount: number;
}

export const DEFAULT_RYAN_RIDE_TUNING: RyanRideDecisionTuning = {
  farDistance: 460,
  resumeDistance: 250,
  calloutCooldownMs: 8_000,
};

export function createRyanRideDecisionState(
  mode: Exclude<RyanRideMode, "waiting" | "stopped"> = "cruise",
): RyanRideDecisionState {
  return { mode, caught: false, lastCalloutAt: null };
}

/** Validates hysteresis once when a route adapter is constructed. */
export function validateRyanRideTuning(tuning: RyanRideDecisionTuning): void {
  if (!Number.isFinite(tuning.farDistance) || !Number.isFinite(tuning.resumeDistance)) {
    throw new RangeError("Ryan ride distance thresholds must be finite");
  }
  if (tuning.farDistance <= tuning.resumeDistance || tuning.resumeDistance < 0) {
    throw new RangeError("Ryan ride farDistance must be greater than resumeDistance");
  }
  if (!Number.isFinite(tuning.calloutCooldownMs) || tuning.calloutCooldownMs < 0) {
    throw new RangeError("Ryan ride calloutCooldownMs must be a non-negative finite number");
  }
}

/**
 * Applies distance hysteresis and exit gating without owning sprites, timers,
 * or route positions. The adapter supplies the current authored waypoint mode.
 */
export function decideRyanRide(
  state: RyanRideDecisionState,
  input: RyanRideDecisionInput,
  tuning: RyanRideDecisionTuning = DEFAULT_RYAN_RIDE_TUNING,
): RyanRideDecision {
  validateRyanRideTuning(tuning);
  if (!Number.isFinite(input.distanceToPlayer) || input.distanceToPlayer < 0) {
    throw new RangeError("Ryan ride player distance must be a non-negative finite number");
  }

  if (state.caught || state.mode === "stopped") {
    return {
      state: { ...state, mode: "stopped", caught: true },
      shouldMove: false,
      canExit: false,
      emitWaitCallout: false,
    };
  }

  const shouldEnterWaiting = state.mode !== "waiting"
    && input.atWaitSafeWaypoint
    && input.distanceToPlayer > tuning.farDistance;
  const remainsWaiting = state.mode === "waiting" && input.distanceToPlayer > tuning.resumeDistance;
  const waiting = shouldEnterWaiting || remainsWaiting;
  const mayCallOut = state.lastCalloutAt === null
    || input.nowMs - state.lastCalloutAt >= tuning.calloutCooldownMs;
  const emitWaitCallout = waiting && mayCallOut;
  const nextState: RyanRideDecisionState = waiting
    ? { mode: "waiting", caught: false, lastCalloutAt: emitWaitCallout ? input.nowMs : state.lastCalloutAt }
    : { ...state, mode: input.routeMode };

  return {
    state: nextState,
    shouldMove: !waiting,
    // An exit is safe only once the player has caught up, even if Ryan did not
    // enter waiting because the exit waypoint itself was not wait-safe.
    canExit: input.attemptingExit && input.distanceToPlayer <= tuning.resumeDistance,
    emitWaitCallout,
  };
}

/** Latches the catch exactly once; adapters disable their Arcade overlap on `caughtNow`. */
export function latchRyanCatch(state: RyanRideDecisionState): {
  readonly state: RyanRideDecisionState;
  readonly caughtNow: boolean;
} {
  if (state.caught || state.mode === "stopped") return { state, caughtNow: false };
  return {
    state: { ...state, mode: "stopped", caught: true },
    caughtNow: true,
  };
}

/**
 * Picks a deterministic destination loop. It never repeats the immediately
 * previous loop when another authored loop exists.
 */
export function selectRyanLoop(
  loopIds: readonly string[],
  routeSeed: number,
  selectionCount: number,
  previousLoopId?: string,
): RyanLoopSelection {
  if (loopIds.length === 0) throw new RangeError("Ryan ride needs at least one chase loop");
  if (new Set(loopIds).size !== loopIds.length) throw new RangeError("Ryan ride chase loop IDs must be unique");
  if (!Number.isFinite(routeSeed) || !Number.isInteger(selectionCount) || selectionCount < 0) {
    throw new RangeError("Ryan ride route seed and selection count must be finite/non-negative");
  }

  const seed = Math.imul(Math.trunc(routeSeed), 0x9e3779b1) ^ Math.imul(selectionCount + 1, 0x85ebca6b);
  const randomIndex = Math.abs(seed >>> 0) % loopIds.length;
  let index = randomIndex;
  if (loopIds.length > 1 && loopIds[index] === previousLoopId) index = (index + 1) % loopIds.length;
  return { loopId: loopIds[index]!, selectionCount: selectionCount + 1 };
}
