import type { LeaderboardDelivery, LeaderboardEntry } from "./GamePlatformAdapter";
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
const starts = new Map<TimedLeaderboard, { startedAt: number; invalidated: boolean }>();

/** Competitive runs are cancelled on tab suspension; they cannot be paused for an exploitable score. */
export function invalidateCompetitiveRunsForVisibility(): void {
  for (const timer of starts.values()) timer.invalidated = true;
}
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => {
  if (document.hidden) invalidateCompetitiveRunsForVisibility();
});

export function startLeaderboardTimer(board: TimedLeaderboard): void {
  starts.set(board, { startedAt: performance.now(), invalidated: false });
}

export function getLeaderboardElapsedMs(board: TimedLeaderboard): number | undefined {
  const startedAt = starts.get(board);
  return startedAt === undefined || startedAt.invalidated ? undefined : Math.max(0, performance.now() - startedAt.startedAt);
}

export type TimedLeaderboardDelivery = LeaderboardDelivery | { status: "cancelled" };
export async function finishLeaderboardTimer(board: TimedLeaderboard): Promise<TimedLeaderboardDelivery> {
  const startedAt = starts.get(board);
  starts.delete(board);
  if (startedAt === undefined || startedAt.invalidated) return { status: "cancelled" };
  return gamePlatform.submitLeaderboardTime(LEADERBOARD_KEYS[board], Math.max(1, Math.round(performance.now() - startedAt.startedAt)));
}

export function submitLeaderboardTime(board: TimedLeaderboard, milliseconds: number): Promise<LeaderboardDelivery> {
  return gamePlatform.submitLeaderboardTime(LEADERBOARD_KEYS[board], Math.max(1, Math.round(milliseconds)));
}

/** Read-only lookup for the in-game leaderboard-browsing page; never submits a score. */
export function fetchLeaderboard(board: TimedLeaderboard, limit = 10): Promise<LeaderboardEntry[]> {
  return gamePlatform.fetchLeaderboard(LEADERBOARD_KEYS[board], limit);
}

/** Static copy for the browsable leaderboard page. Order matches Billy's chapter-1 quest order. */
export const LEADERBOARD_PAGES: ReadonlyArray<{ board: TimedLeaderboard; title: string; kind: "fastest" | "longest" }> = [
  { board: "mushroomHunt", title: "Andrew's Mushroom Hunt — fastest completion", kind: "fastest" },
  { board: "chaseRyan", title: "Catch Ryan — fastest catch", kind: "fastest" },
  { board: "mickeyDragRace", title: "Mickey's Drag Race — fastest win", kind: "fastest" },
  { board: "badTripSurvival", title: "Don Rossi's Chase — longest survival", kind: "longest" },
];

/** Formats any leaderboard's entries as display lines, in the direction that board ranks best. */
export function leaderboardPageLines(kind: "fastest" | "longest", entries: readonly LeaderboardEntry[]): string[] {
  return kind === "longest" ? survivalLeaderboardLines(entries) : leaderboardLines(entries);
}

/** A compact personal-best line followed by leading scores from other players. */
export function leaderboardSummaryLines(
  kind: "fastest" | "longest",
  entries: readonly LeaderboardEntry[],
  currentUserId?: string,
  competitorLimit = 3,
  fallbackBestMs?: number,
): string[] {
  const personalBest = currentUserId ? entries.find((entry) => entry.userId === currentUserId) : undefined;
  const personalValue = personalBest
    ? kind === "longest" ? decodeBadTripSurvivalValue(personalBest.value) : personalBest.value
    : fallbackBestMs;
  const personalLine = personalValue === undefined
    ? "YOUR BEST — Not ranked yet"
    : `YOUR BEST${personalBest ? ` — #${personalBest.rank}` : ""} — ${kind === "longest" ? "survived " : ""}${formatLeaderboardTime(personalValue)}`;
  const competitors = entries
    .filter((entry) => !currentUserId || entry.userId !== currentUserId)
    .slice(0, competitorLimit);
  const competitorLines = leaderboardPageLines(kind, competitors);
  return [personalLine, ...(competitorLines.length ? competitorLines : ["No other player scores yet."])];
}

/** Milton Estates always displays elapsed/leaderboard time as plain seconds. */
export function formatLeaderboardTime(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds) / 1_000;
  return `${seconds.toFixed(2)}s`;
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
export function submitBadTripSurvivalTime(survivalMs: number): Promise<LeaderboardDelivery> {
  return gamePlatform.submitLeaderboardTime(LEADERBOARD_KEYS.badTripSurvival, encodeBadTripSurvivalValue(survivalMs));
}

export function leaderboardDeliveryLines(kind: "fastest" | "longest", delivery: TimedLeaderboardDelivery, currentUserId?: string, fallbackBestMs?: number): string[] {
  if (delivery.status === "accepted") return leaderboardSummaryLines(kind, delivery.entries, currentUserId, 3, fallbackBestMs);
  if (delivery.status === "cancelled") return ["Run cancelled while this tab was hidden. Start a fresh competitive run."];
  if (delivery.status === "pending") return [delivery.detail === "offline" ? "Score saved locally — submission pending until you reconnect." : "Score submission is pending confirmation."];
  if (delivery.status === "session-expired") return ["Score is pending. Sign in again from the catalog to submit it."];
  return ["Score could not be submitted. Use Retry after reconnecting."];
}
