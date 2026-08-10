import type { LeaderboardEntry } from "./GamePlatformAdapter";
import { gamePlatform } from "./integration";

export const LEADERBOARD_KEYS = {
  mushroomHunt: "milton-estates.mushroom-hunt.fastest-completion-ms",
  chaseRyan: "milton-estates.chase-ryan.fastest-catch-ms",
  mickeyDragRace: "milton-estates.mickey-drag-race.fastest-win-ms",
  /** Longer survival is encoded as a lower positive SDK value before submission. */
  badTripSurvival: "milton-estates.bad-trip.longest-survival-ms",
} as const;

/** Game Lab ranks lower values first; this ceiling makes longer survival rank first. */
export const BAD_TRIP_SURVIVAL_CEILING_MS = 15 * 60 * 1_000;

export type TimedLeaderboard = keyof typeof LEADERBOARD_KEYS;
const starts = new Map<TimedLeaderboard, number>();

export function startLeaderboardTimer(board: TimedLeaderboard): void {
  starts.set(board, performance.now());
}

export function getLeaderboardElapsedMs(board: TimedLeaderboard): number | undefined {
  const startedAt = starts.get(board);
  return startedAt === undefined ? undefined : Math.max(0, performance.now() - startedAt);
}

export async function finishLeaderboardTimer(board: TimedLeaderboard): Promise<LeaderboardEntry[]> {
  const startedAt = starts.get(board);
  starts.delete(board);
  if (startedAt === undefined) return [];
  return gamePlatform.submitLeaderboardTime(LEADERBOARD_KEYS[board], Math.max(1, Math.round(performance.now() - startedAt)));
}

export function submitLeaderboardTime(board: TimedLeaderboard, milliseconds: number): Promise<LeaderboardEntry[]> {
  return gamePlatform.submitLeaderboardTime(LEADERBOARD_KEYS[board], Math.max(1, Math.round(milliseconds)));
}

export function formatLeaderboardTime(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds) / 1_000;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

export function leaderboardLines(entries: readonly LeaderboardEntry[]): string[] {
  return entries.map((entry) => `#${entry.rank} ${entry.nickname} — ${formatLeaderboardTime(entry.value)}`);
}

/** Survival boards use the same numeric SDK API, but a larger value is better. */
export function survivalLeaderboardLines(entries: readonly LeaderboardEntry[]): string[] {
  return entries.map((entry) => `#${entry.rank} ${entry.nickname} — survived ${formatLeaderboardTime(decodeBadTripSurvivalValue(entry.value))}`);
}

export function encodeBadTripSurvivalValue(survivalMs: number): number {
  const capped = Math.min(BAD_TRIP_SURVIVAL_CEILING_MS - 1, Math.max(0, Math.round(survivalMs)));
  return BAD_TRIP_SURVIVAL_CEILING_MS - capped;
}

export function decodeBadTripSurvivalValue(encodedValue: number): number {
  return Math.max(0, BAD_TRIP_SURVIVAL_CEILING_MS - Math.max(1, Math.round(encodedValue)));
}

/** Submit exactly once when a run ends. Longer survival encodes to a lower SDK value. */
export function submitBadTripSurvivalTime(survivalMs: number): Promise<LeaderboardEntry[]> {
  return gamePlatform.submitLeaderboardTime(LEADERBOARD_KEYS.badTripSurvival, encodeBadTripSurvivalValue(survivalMs));
}
