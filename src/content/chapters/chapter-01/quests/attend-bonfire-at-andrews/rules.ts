import type {
  BonfireQuestStage,
  QuestMilestone,
} from "../../../../../game/types";

export type BonfireQuestEvent =
  | { type: "accepted_schwartz_invitation" }
  | { type: "arrived_at_andrews" }
  | { type: "survived_bad_trip" };

export const BONFIRE_QUEST_STAGES = [
  "talk_to_schwartz",
  "attend_bonfire",
  "survive_bad_trip",
  "complete",
] as const satisfies readonly BonfireQuestStage[];

export const BONFIRE_QUEST_MILESTONES = [
  "attend_bonfire_at_andrews.started",
  "attend_bonfire_at_andrews.invitation_accepted",
  "attend_bonfire_at_andrews.arrived_at_andrews",
  "attend_bonfire_at_andrews.bad_trip_survived",
] as const satisfies readonly QuestMilestone[];

export const BONFIRE_QUEST_OBJECTIVES: Readonly<Record<BonfireQuestStage, string>> = {
  talk_to_schwartz: "Talk to Schwartz in Bent Creek.",
  attend_bonfire: "Leave Bent Creek to attend the bonfire at Andrew's.",
  survive_bad_trip: "Survive the bad trip and bring back the fire-roasted Dorito.",
  complete: "You made it into the crew. Get some rest at home.",
};

export const BONFIRE_QUEST_COMPLETED_MILESTONE_COUNT:
Readonly<Record<BonfireQuestStage, number>> = {
  talk_to_schwartz: 0,
  attend_bonfire: 2,
  survive_bad_trip: 3,
  complete: 4,
};

export function advanceBonfireQuestStage(
  current: BonfireQuestStage,
  event: BonfireQuestEvent,
): BonfireQuestStage {
  switch (current) {
    case "talk_to_schwartz":
      return event.type === "accepted_schwartz_invitation" ? "attend_bonfire" : current;
    case "attend_bonfire":
      return event.type === "arrived_at_andrews" ? "survive_bad_trip" : current;
    case "survive_bad_trip":
      return event.type === "survived_bad_trip" ? "complete" : current;
    default:
      return current;
  }
}
