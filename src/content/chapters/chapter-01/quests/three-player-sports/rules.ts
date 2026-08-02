import type {
  QuestMilestone,
  SportsQuestStage,
} from "../../../../../game/types";

export type SportsQuestEvent =
  | { type: "skateboarded_with_jeremy" }
  | { type: "played_baseball_with_billy" }
  | { type: "played_basketball_with_andrew" };

export const SPORTS_STAGES = [
  "meet_jeremy_to_skateboard",
  "meet_billy_to_play_baseball",
  "meet_andrew_to_play_basketball",
  "complete",
] as const satisfies readonly SportsQuestStage[];

export const SPORTS_MILESTONES = [
  "three_player_sports.started",
  "three_player_sports.skateboarded",
  "three_player_sports.played_baseball",
  "three_player_sports.played_basketball",
] as const satisfies readonly QuestMilestone[];

export const SPORTS_OBJECTIVES: Readonly<Record<SportsQuestStage, string>> = {
  meet_jeremy_to_skateboard: "Meet Jeremy at his house to skateboard together.",
  meet_billy_to_play_baseball: "Meet at Billy's house to play baseball together.",
  meet_andrew_to_play_basketball: "Meet Andrew at his house to play basketball together.",
  complete: "Sports day complete! All three friends played together.",
};

export const SPORTS_COMPLETED_MILESTONE_COUNT:
Readonly<Record<SportsQuestStage, number>> = {
  meet_jeremy_to_skateboard: 0,
  meet_billy_to_play_baseball: 2,
  meet_andrew_to_play_basketball: 3,
  complete: 4,
};

export function advanceSportsStage(
  current: SportsQuestStage,
  event: SportsQuestEvent,
): SportsQuestStage {
  switch (current) {
    case "meet_jeremy_to_skateboard":
      return event.type === "skateboarded_with_jeremy" ? "meet_billy_to_play_baseball" : current;
    case "meet_billy_to_play_baseball":
      return event.type === "played_baseball_with_billy" ? "meet_andrew_to_play_basketball" : current;
    case "meet_andrew_to_play_basketball":
      return event.type === "played_basketball_with_andrew" ? "complete" : current;
    default:
      return current;
  }
}
